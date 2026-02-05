/**
 * Weather Engine - Shared rendering engine for weather effects
 * This module provides the core particle system and effect definitions
 * that can be used by both the overlay and the admin panel preview.
 * 
 * @module weather-engine
 */

(function(global) {
  'use strict';

  // Visual effect constants
  const FOG_MAX_ALPHA = 0.25;           // Maximum alpha for fog particles
  const SNOWFLAKE_SPARKLE_CHANCE = 0.04; // 4% chance of sparkle per frame
  const GLITCH_LINE_FREQUENCY = 0.2;    // 20% chance of glitch lines per frame
  const DIGITAL_NOISE_FREQUENCY = 0.25; // 25% chance of digital noise per frame
  const FIXED_TIMESTEP = 1000 / 60;     // 60 physics updates per second
  const MAX_ACCUMULATED = 200;          // Cap to prevent spiral of death

  /**
   * SimplexNoise - Lightweight Simplex noise implementation for fog effects
   * Based on Stefan Gustavson's implementation
   */
  class SimplexNoise {
    constructor(random = Math.random) {
      this.grad3 = [
        [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
        [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
        [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
      ];
      this.p = [];
      for (let i = 0; i < 256; i++) {
        this.p[i] = Math.floor(random() * 256);
      }
      this.perm = [];
      for (let i = 0; i < 512; i++) {
        this.perm[i] = this.p[i & 255];
      }
    }

    dot(g, x, y) {
      return g[0] * x + g[1] * y;
    }

    noise2D(xin, yin) {
      const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
      const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
      
      let n0, n1, n2;
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s);
      const j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const X0 = i - t;
      const Y0 = j - t;
      const x0 = xin - X0;
      const y0 = yin - Y0;
      
      let i1, j1;
      if (x0 > y0) {
        i1 = 1; j1 = 0;
      } else {
        i1 = 0; j1 = 1;
      }
      
      const x1 = x0 - i1 + G2;
      const y1 = y0 - j1 + G2;
      const x2 = x0 - 1.0 + 2.0 * G2;
      const y2 = y0 - 1.0 + 2.0 * G2;
      
      const ii = i & 255;
      const jj = j & 255;
      const gi0 = this.perm[ii + this.perm[jj]] % 12;
      const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
      const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;
      
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 < 0) n0 = 0.0;
      else {
        t0 *= t0;
        n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0);
      }
      
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 < 0) n1 = 0.0;
      else {
        t1 *= t1;
        n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1);
      }
      
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 < 0) n2 = 0.0;
      else {
        t2 *= t2;
        n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2);
      }
      
      return 70.0 * (n0 + n1 + n2);
    }
  }

  /**
   * Koch Snowflake Generator - Creates fractal snowflake patterns
   */
  function generateKochSnowflake(iterations = 2) {
    // Start with equilateral triangle
    let points = [
      { x: 0, y: -1 },
      { x: Math.cos(-Math.PI / 6), y: Math.sin(-Math.PI / 6) },
      { x: Math.cos(-5 * Math.PI / 6), y: Math.sin(-5 * Math.PI / 6) }
    ];
    
    for (let iter = 0; iter < iterations; iter++) {
      points = kochIteration(points);
    }
    return points;
  }

  function kochIteration(points) {
    const newPoints = [];
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      
      // First point
      newPoints.push({ x: p1.x, y: p1.y });
      
      // First third
      newPoints.push({
        x: p1.x + dx / 3,
        y: p1.y + dy / 3
      });
      
      // Peak (rotated 60 degrees)
      const midX = p1.x + dx / 2;
      const midY = p1.y + dy / 2;
      const px = p1.x + dx / 3;
      const py = p1.y + dy / 3;
      const angle = Math.PI / 3;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      newPoints.push({
        x: px + (midX - px) * cos - (midY - py) * sin,
        y: py + (midX - px) * sin + (midY - py) * cos
      });
      
      // Second third
      newPoints.push({
        x: p1.x + 2 * dx / 3,
        y: p1.y + 2 * dy / 3
      });
    }
    return newPoints;
  }

  /**
   * Generate multiple snowflake variants
   */
  function generateSnowflakeVariants() {
    const variants = [];
    // Generate 5 different snowflake patterns with varying iterations
    for (let i = 0; i < 5; i++) {
      const iterations = 1 + Math.floor(i / 2); // 1, 1, 2, 2, 3
      variants.push(generateKochSnowflake(iterations));
    }
    return variants;
  }

  /**
   * ParticlePool - Object pooling system to eliminate GC pressure
   */
  class ParticlePool {
    constructor(ParticleClass, particleType, initialSize = 500) {
      this.ParticleClass = ParticleClass;
      this.particleType = particleType;
      this.available = [];
      this.active = new Set();
      this.peakUsage = 0;
      this.totalAcquired = 0;
      
      // Pre-allocate particles
      for (let i = 0; i < initialSize; i++) {
        this.available.push(new ParticleClass(particleType));
      }
    }

    acquire(config) {
      let particle;
      if (this.available.length > 0) {
        particle = this.available.pop();
      } else {
        // Dynamic growth when needed
        particle = new this.ParticleClass(this.particleType);
      }
      
      particle.reset(config);
      this.active.add(particle);
      this.totalAcquired++;
      this.peakUsage = Math.max(this.peakUsage, this.active.size);
      
      return particle;
    }

    release(particle) {
      if (this.active.has(particle)) {
        particle.active = false;
        this.active.delete(particle);
        this.available.push(particle);
      }
    }

    releaseAll() {
      this.active.forEach(particle => {
        particle.active = false;
        this.available.push(particle);
      });
      this.active.clear();
    }

    getStats() {
      return {
        available: this.available.length,
        active: this.active.size,
        total: this.available.length + this.active.size,
        peakUsage: this.peakUsage,
        totalAcquired: this.totalAcquired
      };
    }
  }

  /**
   * Particle class with optimized rendering
   */
  class Particle {
    constructor(type, config = {}) {
      this.type = type;
      this.active = true;
      this.reset(config);
    }

    reset(config = {}) {
      const w = config.width || window.innerWidth;
      const h = config.height || window.innerHeight;
      
      this.x = config.x !== undefined ? config.x : Math.random() * w;
      this.y = config.startFromTop ? -20 : (config.y !== undefined ? config.y : Math.random() * h);
      this.z = Math.random(); // Depth for parallax (0-1)
      this.active = true;
      
      // Store previous position for interpolation
      this.prevX = this.x;
      this.prevY = this.y;
      
      switch (this.type) {
        case 'rain':
          this.speedY = 15 + Math.random() * 15;
          this.speedX = Math.random() * 3 - 1.5;
          this.length = 15 + Math.random() * 25;
          this.width = 1 + Math.random() * 1.5;
          this.alpha = 0.4 + Math.random() * 0.4;
          this.color = `rgba(160, 196, 232, ${this.alpha})`;
          // Rain splash properties
          this.wind = 0;
          this.turbulence = 0;
          this.splashing = false;
          this.splashParticles = [];
          break;
        
        case 'snow':
          this.speedY = 1 + Math.random() * 2.5;
          this.speedX = Math.random() * 2 - 1;
          this.size = 2 + Math.random() * 5;
          this.alpha = 0.5 + Math.random() * 0.5;
          this.wobble = Math.random() * Math.PI * 2;
          this.wobbleSpeed = 0.02 + Math.random() * 0.04;
          this.rotation = Math.random() * Math.PI * 2;
          this.rotationSpeed = (Math.random() - 0.5) * 0.1;
          // Snowflake variant (0-4 for different Koch snowflake patterns)
          this.variant = Math.floor(Math.random() * 5);
          // Cache snowflake points if not already cached
          if (!config.snowflakeVariants) {
            this.snowflakePoints = null;
          } else {
            this.snowflakePoints = config.snowflakeVariants[this.variant];
          }
          break;
        
        case 'storm':
          this.speedY = 20 + Math.random() * 20;
          this.speedX = 8 + Math.random() * 12;
          this.length = 20 + Math.random() * 35;
          this.width = 1.5 + Math.random() * 2;
          this.alpha = 0.5 + Math.random() * 0.4;
          this.color = `rgba(107, 163, 214, ${this.alpha})`;
          break;
        
        case 'fog':
          this.speedY = 0.3 + Math.random() * 0.4;
          this.speedX = 0.5 + Math.random() - 0.5;
          this.size = 80 + Math.random() * 200;
          this.alpha = 0.15 + Math.random() * 0.2;
          this.life = 0;
          this.maxLife = 250 + Math.random() * 400;
          this.hue = 200 + Math.random() * 20; // Slight color variation
          break;
      }
    }

    update(deltaTime, intensity = 1.0, dimensions = null, globalWind = 0, currentTime = Date.now()) {
      const speed = deltaTime / 16.67; // Normalize to 60fps
      const w = dimensions?.width || window.innerWidth;
      const h = dimensions?.height || window.innerHeight;
      
      // Store previous position for interpolation
      this.prevX = this.x;
      this.prevY = this.y;
      
      switch (this.type) {
        case 'rain':
          // Wind influence
          this.wind = globalWind + (Math.random() - 0.5) * 2;
          // Turbulence (subtle randomness)
          this.turbulence = Math.sin(currentTime * 0.01 + this.x * 0.1) * 0.5;
          
          this.x += (this.speedX + this.wind + this.turbulence) * speed;
          this.y += this.speedY * speed * intensity;
          
          // Check for ground hit and trigger splash
          if (this.y > h - 10 && !this.splashing) {
            this.triggerSplash();
          }
          
          // Update splash particles
          if (this.splashParticles.length > 0) {
            for (let i = 0, len = this.splashParticles.length; i < len; i++) {
              const splash = this.splashParticles[i];
              splash.x += splash.vx * speed;
              splash.y += splash.vy * speed;
              splash.vy += 0.2 * speed; // gravity
              splash.life -= 0.05 * speed;
            }
            this.splashParticles = this.splashParticles.filter(s => s.life > 0);
          }
          
          if (this.y > h + 20) {
            this.reset({ startFromTop: true, width: w, height: h });
          }
          if (this.x < -20 || this.x > w + 20) {
            this.x = Math.random() * w;
          }
          break;
        
        case 'snow':
          this.y += this.speedY * speed * intensity;
          this.wobble += this.wobbleSpeed * speed;
          this.x += Math.sin(this.wobble) * 0.8 * speed + this.speedX * speed;
          this.rotation += this.rotationSpeed * speed;
          if (this.y > h + 20) {
            this.reset({ startFromTop: true, width: w, height: h });
          }
          if (this.x < -20) this.x = w + 20;
          if (this.x > w + 20) this.x = -20;
          break;
        
        case 'storm':
          this.y += this.speedY * speed * intensity;
          this.x += this.speedX * speed * intensity;
          if (this.y > h + 50) {
            this.reset({ startFromTop: true, width: w, height: h });
          }
          if (this.x > w + 100) {
            this.x = -100;
            this.y = Math.random() * h;
          }
          break;
        
        case 'fog':
          this.y += this.speedY * speed;
          this.x += this.speedX * speed;
          this.life += speed;
          // Smooth fade in/out using sine wave
          const lifePercent = this.life / this.maxLife;
          this.alpha = Math.sin(lifePercent * Math.PI) * FOG_MAX_ALPHA;
          if (this.life > this.maxLife) {
            this.reset({ width: w, height: h });
          }
          if (this.x < -this.size) this.x = w + this.size;
          if (this.x > w + this.size) this.x = -this.size;
          break;
      }
    }

    triggerSplash() {
      this.splashing = true;
      // Create 3-5 tiny splash droplets that arc outward
      const splashCount = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < splashCount; i++) {
        this.splashParticles.push({
          x: this.x,
          y: this.y,
          vx: (Math.random() - 0.5) * 3,
          vy: -2 - Math.random() * 2,
          life: 1.0,
          size: 1 + Math.random()
        });
      }
    }

    draw(ctx, alpha = 1.0) {
      if (!this.active || !ctx) return;
      
      ctx.save();
      ctx.globalAlpha = this.alpha;
      
      switch (this.type) {
        case 'rain':
        case 'storm':
          {
            // Depth-based rendering
            const depthFactor = 0.5 + this.z * 0.5; // z: 0-1 → depth: 0.5-1.0
            const glowIntensity = this.type === 'storm' ? 0.3 : 0.15;
            
            // Outer glow layer
            const glowGradient = ctx.createLinearGradient(
              this.x, this.y,
              this.x - this.speedX * 2, this.y - this.length
            );
            const glowColor = this.type === 'storm' 
              ? `rgba(107, 163, 214, ${this.alpha * glowIntensity})` 
              : `rgba(160, 196, 232, ${this.alpha * glowIntensity})`;
            glowGradient.addColorStop(0, glowColor);
            glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.strokeStyle = glowGradient;
            ctx.lineWidth = (this.width + 2) * depthFactor;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x - this.speedX * 2, this.y - this.length);
            ctx.stroke();
            
            // Main raindrop with depth-based color
            const mainGradient = ctx.createLinearGradient(
              this.x, this.y,
              this.x - this.speedX * 2, this.y - this.length
            );
            
            const baseR = this.type === 'storm' ? 107 : 160;
            const baseG = this.type === 'storm' ? 163 : 196;
            const baseB = this.type === 'storm' ? 214 : 232;
            
            const depthR = Math.round(baseR * depthFactor);
            const depthG = Math.round(baseG * depthFactor);
            const depthB = Math.round(baseB * depthFactor);
            
            mainGradient.addColorStop(0, `rgba(${depthR}, ${depthG}, ${depthB}, ${this.alpha})`);
            mainGradient.addColorStop(0.5, `rgba(${baseR}, ${baseG}, ${baseB}, ${this.alpha * 0.8})`);
            mainGradient.addColorStop(1, `rgba(${baseR}, ${baseG}, ${baseB}, 0)`);
            
            ctx.strokeStyle = mainGradient;
            ctx.lineWidth = this.width * depthFactor;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x - this.speedX * 2, this.y - this.length);
            ctx.stroke();
            
            // Enhanced splash rendering
            if (this.type === 'rain' && this.splashParticles.length > 0) {
              this.splashParticles.forEach(splash => {
                const splashAlpha = splash.life * 0.7;
                
                // Glow layer
                ctx.globalAlpha = splashAlpha * 0.3;
                ctx.fillStyle = 'rgba(200, 230, 255, 1)';
                ctx.beginPath();
                ctx.arc(splash.x, splash.y, splash.size + 2, 0, Math.PI * 2);
                ctx.fill();
                
                // Main splash
                ctx.globalAlpha = splashAlpha;
                ctx.fillStyle = 'rgba(180, 210, 240, 1)';
                ctx.beginPath();
                ctx.arc(splash.x, splash.y, splash.size, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.globalAlpha = this.alpha;
              });
            }
          }
          break;
        
        case 'snow':
          {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            
            // Use Koch snowflake if available, otherwise fallback to simple star
            if (this.snowflakePoints && this.snowflakePoints.length > 0) {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              for (let i = 0; i < this.snowflakePoints.length; i++) {
                const x = this.snowflakePoints[i].x * this.size;
                const y = this.snowflakePoints[i].y * this.size;
                if (i === 0) {
                  ctx.moveTo(x, y);
                } else {
                  ctx.lineTo(x, y);
                }
              }
              ctx.closePath();
              ctx.fill();
            } else {
              // Fallback to simple 6-point star
              const points = 6;
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              for (let i = 0; i < points; i++) {
                const angle = (i * Math.PI * 2) / points;
                const x = Math.cos(angle) * this.size;
                const y = Math.sin(angle) * this.size;
                if (i === 0) {
                  ctx.moveTo(x, y);
                } else {
                  ctx.lineTo(x, y);
                }
              }
              ctx.closePath();
              ctx.fill();
            }
            
            // Add sparkle effect occasionally
            if (Math.random() < SNOWFLAKE_SPARKLE_CHANCE) {
              ctx.fillStyle = '#ffffdd';
              ctx.globalAlpha = 0.9;
              ctx.beginPath();
              ctx.arc(0, 0, this.size * 0.4, 0, Math.PI * 2);
              ctx.fill();
            }
            
            ctx.restore();
          }
          break;
        
        case 'fog':
          {
            const gradient = ctx.createRadialGradient(
              this.x, this.y, 0,
              this.x, this.y, this.size
            );
            gradient.addColorStop(0, `hsla(${this.hue}, 15%, 75%, ${this.alpha})`);
            gradient.addColorStop(0.5, `hsla(${this.hue}, 15%, 70%, ${this.alpha * 0.5})`);
            gradient.addColorStop(1, 'rgba(180, 180, 200, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
      }
      
      ctx.restore();
    }

    destroy() {
      this.active = false;
    }
  }

  /**
   * Weather Engine class - manages weather effects and rendering
   */
  class WeatherEngine {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', {
        alpha: true,
        willReadFrequently: false,
        premultipliedAlpha: true
      });
      
      // Enable high-quality rendering
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      
      this.options = {
        debug: options.debug || false,
        enablePostProcessing: options.enablePostProcessing || false,
        renderQuality: options.renderQuality || 'high',
        ...options
      };
      
      // Initialize particle pools
      this.pools = {
        rain: new ParticlePool(Particle, 'rain', 500),
        snow: new ParticlePool(Particle, 'snow', 500),
        storm: new ParticlePool(Particle, 'storm', 500),
        fog: new ParticlePool(Particle, 'fog', 100)
      };
      
      // Generate snowflake variants for better visuals
      this.snowflakeVariants = generateSnowflakeVariants();
      
      // Initialize Simplex noise for fog
      this.noise = new SimplexNoise();
      
      // Global wind value for rain effects
      this.globalWind = 0;
      
      this.state = {
        activeEffects: [],
        particles: [],
        animationId: null,
        lastFrameTime: 0,
        accumulator: 0,
        fps: 0,
        fpsHistory: [],
        running: false
      };
      
      this.dimensions = {
        width: 0,
        height: 0
      };
      
      // Lightning segments (for procedural lightning)
      this.lightningSegments = [];
      this.lightningFadeTime = 0;
      
      this.updateDimensions();
    }

    /**
     * Update canvas dimensions
     */
    updateDimensions() {
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = this.canvas.clientWidth || this.canvas.width;
      const displayHeight = this.canvas.clientHeight || this.canvas.height;
      
      this.canvas.width = displayWidth * dpr;
      this.canvas.height = displayHeight * dpr;
      this.ctx.scale(dpr, dpr);
      
      // Re-apply high-quality rendering settings after canvas resize
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      
      this.dimensions.width = displayWidth;
      this.dimensions.height = displayHeight;
      
      // Ensure canvas starts with transparent background
      this.ctx.clearRect(0, 0, displayWidth, displayHeight);
    }

    /**
     * Start an effect
     */
    startEffect(type, intensity = 0.5, duration = 10000, options = {}) {
      const isPermanent = options.permanent === true;
      
      // Stop existing permanent effect of this type
      if (isPermanent) {
        this.stopEffect(type);
      }
      
      const effect = {
        type,
        intensity,
        startTime: Date.now(),
        duration,
        permanent: isPermanent,
        particles: [],
        timerId: null
      };
      
      // Create particles based on effect type using pools
      if (type === 'rain') {
        const particleCount = Math.floor(250 * intensity);
        for (let i = 0; i < particleCount; i++) {
          const particle = this.pools.rain.acquire({
            width: this.dimensions.width,
            height: this.dimensions.height
          });
          effect.particles.push(particle);
        }
      } else if (type === 'snow') {
        const particleCount = Math.floor(180 * intensity);
        for (let i = 0; i < particleCount; i++) {
          const particle = this.pools.snow.acquire({
            width: this.dimensions.width,
            height: this.dimensions.height,
            snowflakeVariants: this.snowflakeVariants
          });
          effect.particles.push(particle);
        }
      } else if (type === 'storm') {
        const particleCount = Math.floor(300 * intensity);
        for (let i = 0; i < particleCount; i++) {
          const particle = this.pools.storm.acquire({
            width: this.dimensions.width,
            height: this.dimensions.height
          });
          effect.particles.push(particle);
        }
      } else if (type === 'fog') {
        const particleCount = Math.floor(30 * intensity);
        for (let i = 0; i < particleCount; i++) {
          const particle = this.pools.fog.acquire({
            width: this.dimensions.width,
            height: this.dimensions.height
          });
          effect.particles.push(particle);
        }
      } else if (type === 'thunder') {
        effect.nextFlash = Date.now() + 500;
        effect.flashCount = 0;
      } else if (type === 'sunbeam') {
        effect.beams = this.createSunbeams(intensity);
      } else if (type === 'glitchclouds') {
        effect.glitchLines = [];
      }
      
      this.state.particles.push(...effect.particles);
      this.state.activeEffects.push(effect);
      
      // Schedule auto-stop
      if (!isPermanent && duration > 0) {
        effect.timerId = setTimeout(() => this.stopEffect(type, effect), duration);
      }
      
      return effect;
    }

    /**
     * Stop an effect
     */
    stopEffect(type, specificEffect = null) {
      if (specificEffect) {
        // Stop specific effect instance
        if (specificEffect.timerId) {
          clearTimeout(specificEffect.timerId);
          specificEffect.timerId = null;
        }
        // Release particles back to pool instead of destroying
        specificEffect.particles.forEach(p => {
          if (this.pools[p.type]) {
            this.pools[p.type].release(p);
          } else {
            p.destroy();
          }
        });
        this.state.particles = this.state.particles.filter(p => p.active);
        this.state.activeEffects = this.state.activeEffects.filter(e => e !== specificEffect);
      } else {
        // Stop all effects of this type
        this.state.activeEffects.filter(e => e.type === type).forEach(e => {
          if (e.timerId) clearTimeout(e.timerId);
          // Release particles back to pool
          e.particles.forEach(p => {
            if (this.pools[p.type]) {
              this.pools[p.type].release(p);
            } else {
              p.destroy();
            }
          });
        });
        this.state.particles = this.state.particles.filter(p => p.type !== type);
        this.state.activeEffects = this.state.activeEffects.filter(e => e.type !== type);
      }
    }

    /**
     * Stop all effects
     */
    stopAllEffects() {
      this.state.activeEffects.forEach(e => {
        if (e.timerId) clearTimeout(e.timerId);
        // Release particles back to pools
        e.particles.forEach(p => {
          if (this.pools[p.type]) {
            this.pools[p.type].release(p);
          } else {
            p.destroy();
          }
        });
      });
      this.state.particles = [];
      this.state.activeEffects = [];
    }

    /**
     * Create sunbeams for sunbeam effect
     */
    createSunbeams(intensity) {
      const beamCount = Math.floor(3 + intensity * 7);
      const beams = [];
      const w = this.dimensions.width;
      const h = this.dimensions.height;
      
      for (let i = 0; i < beamCount; i++) {
        beams.push({
          x: Math.random() * w * 1.5 - w * 0.25,
          y: Math.random() * h * 0.3,
          width: 40 + Math.random() * 80,
          height: h * 1.2,
          angle: 5 + Math.random() * 10,
          opacity: 0.1 + Math.random() * 0.2,
          speed: 0.05 + Math.random() * 0.15
        });
      }
      
      return beams;
    }

    /**
     * Render loop with fixed timestep
     */
    render(timestamp) {
      const deltaTime = Math.min(timestamp - this.state.lastFrameTime, 100);
      this.state.lastFrameTime = timestamp;
      
      // Clear canvas
      this.ctx.clearRect(0, 0, this.dimensions.width, this.dimensions.height);
      
      // Calculate FPS
      if (deltaTime > 0) {
        this.state.fps = Math.round(1000 / deltaTime);
        this.state.fpsHistory.push(this.state.fps);
        if (this.state.fpsHistory.length > 60) this.state.fpsHistory.shift();
      }
      
      // Get current time once for this frame
      const currentTime = Date.now();
      
      // Fixed timestep accumulation
      this.state.accumulator += deltaTime;
      this.state.accumulator = Math.min(this.state.accumulator, MAX_ACCUMULATED);
      
      // Update physics with fixed timestep
      while (this.state.accumulator >= FIXED_TIMESTEP) {
        this.updatePhysics(FIXED_TIMESTEP, currentTime);
        this.state.accumulator -= FIXED_TIMESTEP;
      }
      
      // Interpolation factor for smooth rendering
      const alpha = this.state.accumulator / FIXED_TIMESTEP;
      
      // Render with interpolation
      this.renderInterpolated(alpha);
      
      // Handle special effects
      for (const effect of this.state.activeEffects) {
        if (effect.type === 'sunbeam' && effect.beams) {
          this.drawSunbeams(effect);
        }
        if (effect.type === 'fog') {
          this.drawVolumetricFog(effect);
        }
        if (effect.type === 'glitchclouds') {
          this.drawGlitchClouds(effect);
        }
        if (effect.type === 'thunder') {
          this.handleThunder(effect);
        }
      }
      
      // Continue animation
      if (this.state.running) {
        this.state.animationId = requestAnimationFrame(this.render.bind(this));
      }
    }

    /**
     * Update physics with fixed timestep
     */
    updatePhysics(deltaTime, currentTime) {
      // Update global wind (slow sine wave)
      this.globalWind = Math.sin(currentTime * 0.0005) * 3;
      
      // Update particles - use Set iteration to avoid splice in hot path
      for (const particle of this.state.particles) {
        if (!particle.active) continue;
        
        const effect = this.state.activeEffects.find(e =>
          e.particles && e.particles.includes(particle)
        );
        const intensity = effect ? effect.intensity : 1.0;
        
        particle.update(deltaTime, intensity, this.dimensions, this.globalWind, currentTime);
      }
      
      // Clean up inactive particles (done here, not in render loop)
      this.state.particles = this.state.particles.filter(p => p.active);
    }

    /**
     * Render with interpolation for smooth visuals
     */
    renderInterpolated(alpha) {
      for (const particle of this.state.particles) {
        if (!particle.active) continue;
        
        // Interpolate position for smooth rendering
        const renderX = particle.prevX + (particle.x - particle.prevX) * alpha;
        const renderY = particle.prevY + (particle.y - particle.prevY) * alpha;
        
        // Temporarily set interpolated position for rendering
        const origX = particle.x;
        const origY = particle.y;
        particle.x = renderX;
        particle.y = renderY;
        
        particle.draw(this.ctx, alpha);
        
        // Restore actual position
        particle.x = origX;
        particle.y = origY;
      }
    }

    /**
     * Draw sunbeams with HDR bloom effect
     */
    drawSunbeams(effect) {
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'lighter';
      
      const w = this.dimensions.width;
      
      effect.beams.forEach(beam => {
        beam.x += beam.speed;
        if (beam.x > w + 150) {
          beam.x = -150;
        }
        
        // Multiple passes for bloom effect
        const bloomPasses = 3;
        for (let pass = 0; pass < bloomPasses; pass++) {
          const bloomScale = 1 + pass * 0.3;
          const bloomAlpha = beam.opacity * (1 - pass * 0.3) * effect.intensity;
          
          this.ctx.save();
          this.ctx.translate(beam.x, beam.y);
          this.ctx.rotate((beam.angle * Math.PI) / 180);
          this.ctx.scale(bloomScale, 1);
          
          // Gradient with HDR-like falloff (exponential, not linear)
          const gradient = this.ctx.createLinearGradient(0, 0, 0, beam.height);
          gradient.addColorStop(0, `rgba(255, 250, 220, ${bloomAlpha})`);
          gradient.addColorStop(0.3, `rgba(255, 245, 200, ${bloomAlpha * 0.6})`);
          gradient.addColorStop(0.6, `rgba(255, 240, 180, ${bloomAlpha * 0.2})`);
          gradient.addColorStop(1, 'rgba(255, 235, 160, 0)');
          
          // Tapered beam shape (not rectangle)
          this.ctx.beginPath();
          this.ctx.moveTo(-beam.width / 2, 0);
          this.ctx.lineTo(beam.width / 2, 0);
          this.ctx.lineTo(beam.width * 0.1, beam.height);
          this.ctx.lineTo(-beam.width * 0.1, beam.height);
          this.ctx.closePath();
          this.ctx.fillStyle = gradient;
          this.ctx.fill();
          
          this.ctx.restore();
        }
        
        // Add dust motes in beam
        this.drawDustMotes(beam, effect);
      });
      
      this.ctx.restore();
    }

    /**
     * Draw floating dust particles in sunbeam
     */
    drawDustMotes(beam, effect) {
      const moteCount = Math.floor(15 * effect.intensity);
      const time = Date.now() * 0.001;
      
      this.ctx.save();
      for (let i = 0; i < moteCount; i++) {
        // Deterministic position based on beam and time
        const seed = beam.x + beam.y + i;
        const moteY = ((seed * 13 + time * 20) % beam.height);
        const moteX = beam.x + Math.sin(seed + time * 2) * beam.width * 0.4;
        
        this.ctx.globalAlpha = 0.3 + Math.sin(seed + time * 3) * 0.2;
        this.ctx.fillStyle = '#ffffdd';
        this.ctx.beginPath();
        this.ctx.arc(moteX, beam.y + moteY, 1 + Math.random() * 1.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    }

    /**
     * Draw volumetric fog with Perlin noise
     */
    drawVolumetricFog(effect) {
      const time = Date.now() * 0.0005;
      
      for (const particle of effect.particles) {
        if (!particle.active) continue;
        
        this.ctx.save();
        
        // Noise-based alpha modulation
        const noiseValue = this.noise.noise2D(particle.x * 0.005, time);
        const alphaModulation = 0.7 + noiseValue * 0.3;
        
        // Multiple gradient layers for depth
        const layers = 3;
        for (let i = 0; i < layers; i++) {
          const layerSize = particle.size * (1 - i * 0.2);
          const layerAlpha = particle.alpha * alphaModulation * (1 - i * 0.3);
          
          // Offset based on noise for organic shapes
          const offsetX = this.noise.noise2D(particle.x * 0.003, time + i) * 20;
          const offsetY = this.noise.noise2D(particle.y * 0.003, time + i + 10) * 20;
          
          const gradient = this.ctx.createRadialGradient(
            particle.x + offsetX, particle.y + offsetY, 0,
            particle.x + offsetX, particle.y + offsetY, layerSize
          );
          
          // Subtle hue shift between layers
          const hue = particle.hue + i * 5;
          gradient.addColorStop(0, `hsla(${hue}, 15%, 75%, ${layerAlpha})`);
          gradient.addColorStop(0.5, `hsla(${hue}, 15%, 70%, ${layerAlpha * 0.5})`);
          gradient.addColorStop(1, 'rgba(180, 180, 200, 0)');
          
          this.ctx.fillStyle = gradient;
          this.ctx.beginPath();
          this.ctx.arc(particle.x + offsetX, particle.y + offsetY, layerSize, 0, Math.PI * 2);
          this.ctx.fill();
        }
        
        this.ctx.restore();
      }
    }

    /**
     * Handle thunder effect with procedural lightning
     */
    handleThunder(effect) {
      const now = Date.now();
      
      // Trigger new lightning
      if (now >= effect.nextFlash) {
        this.generateLightningBolt();
        effect.flashCount = (effect.flashCount || 0) + 1;
        effect.nextFlash = now + 400 + Math.random() * 2500;
        
        // Trigger external callback
        if (this.options.onLightning) {
          this.options.onLightning(effect.intensity);
        }
      }
      
      // Draw existing lightning with fade
      if (this.lightningSegments.length > 0 && now < this.lightningFadeTime) {
        const fadeProgress = 1 - (this.lightningFadeTime - now) / 150;
        this.drawLightning(fadeProgress);
      } else if (now >= this.lightningFadeTime) {
        this.lightningSegments = [];
      }
    }

    /**
     * Generate procedural lightning bolt with L-system branching
     */
    generateLightningBolt() {
      const w = this.dimensions.width;
      const h = this.dimensions.height;
      
      const startX = Math.random() * w;
      const startY = 0;
      const endX = startX + (Math.random() - 0.5) * w * 0.3;
      const endY = h;
      
      this.lightningSegments = this.subdivideLightning(
        startX, startY, endX, endY, 6, 1.0
      );
      this.lightningFadeTime = Date.now() + 150;
    }

    /**
     * Recursive lightning subdivision with branching
     */
    subdivideLightning(x1, y1, x2, y2, generations, brightness) {
      const segments = [];
      
      if (generations === 0) {
        segments.push({ x1, y1, x2, y2, brightness });
        return segments;
      }
      
      // Midpoint with displacement
      const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * (x2 - x1) * 0.4;
      const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * 50;
      
      segments.push(...this.subdivideLightning(x1, y1, midX, midY, generations - 1, brightness));
      segments.push(...this.subdivideLightning(midX, midY, x2, y2, generations - 1, brightness * 0.9));
      
      // Random branching
      if (Math.random() < 0.3 && generations > 2) {
        const branchAngle = (Math.random() - 0.5) * Math.PI / 3;
        const branchLength = Math.hypot(x2 - midX, y2 - midY) * 0.6;
        const branchEndX = midX + Math.cos(branchAngle) * branchLength;
        const branchEndY = midY + Math.sin(branchAngle) * branchLength + branchLength * 0.5;
        segments.push(...this.subdivideLightning(midX, midY, branchEndX, branchEndY, generations - 2, brightness * 0.5));
      }
      
      return segments;
    }

    /**
     * Draw lightning with glow effect
     */
    drawLightning(fadeProgress) {
      this.ctx.save();
      
      const alpha = 1 - fadeProgress;
      
      // Outer glow
      this.ctx.shadowColor = `rgba(180, 200, 255, ${0.8 * alpha})`;
      this.ctx.shadowBlur = 30;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      
      // Draw multiple passes for glow effect
      const widths = [15, 8, 3, 1];
      widths.forEach((width, i) => {
        this.ctx.lineWidth = width;
        const baseAlpha = alpha * (i === 3 ? 1 : (0.3 - i * 0.05));
        this.ctx.strokeStyle = i === 3 
          ? `rgba(255, 255, 255, ${baseAlpha})` 
          : `rgba(200, 220, 255, ${baseAlpha})`;
        
        this.ctx.beginPath();
        this.lightningSegments.forEach(seg => {
          this.ctx.moveTo(seg.x1, seg.y1);
          this.ctx.lineTo(seg.x2, seg.y2);
        });
        this.ctx.stroke();
      });
      
      this.ctx.restore();
    }

    /**
     * Draw glitch clouds
     */
    drawGlitchClouds(effect) {
      this.ctx.save();
      const w = this.dimensions.width;
      const h = this.dimensions.height;
      
      // Draw random glitch lines
      if (Math.random() < GLITCH_LINE_FREQUENCY) {
        const lineCount = Math.floor(5 + Math.random() * 10);
        for (let i = 0; i < lineCount; i++) {
          const y = Math.random() * h;
          const height = 1 + Math.random() * 5;
          const offset = (Math.random() - 0.5) * 20 * effect.intensity;
          
          this.ctx.globalAlpha = 0.3 + Math.random() * 0.4;
          this.ctx.fillStyle = Math.random() > 0.5 ? '#ff00ff' : '#00ffff';
          this.ctx.fillRect(0, y, w, height);
        }
      }
      
      // Add digital noise overlay
      if (Math.random() < DIGITAL_NOISE_FREQUENCY) {
        const noiseIntensity = effect.intensity * 0.05;
        this.ctx.globalAlpha = noiseIntensity;
        
        for (let i = 0; i < 50; i++) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          const size = 1 + Math.random() * 3;
          const brightness = Math.random() * 255;
          
          this.ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
          this.ctx.fillRect(x, y, size, size);
        }
      }
      
      this.ctx.restore();
    }

    /**
     * Trigger lightning flash (callback-based for external elements)
     */
    triggerLightning(intensity) {
      // This will be handled by the implementation (overlay or preview)
      // using custom callbacks
      if (this.options.onLightning) {
        this.options.onLightning(intensity);
      }
    }

    /**
     * Start rendering
     */
    start() {
      if (!this.state.running) {
        this.state.running = true;
        this.state.lastFrameTime = performance.now();
        this.state.animationId = requestAnimationFrame(this.render.bind(this));
      }
    }

    /**
     * Stop rendering
     */
    stop() {
      this.state.running = false;
      if (this.state.animationId) {
        cancelAnimationFrame(this.state.animationId);
        this.state.animationId = null;
      }
    }

    /**
     * Get current FPS
     */
    getFPS() {
      return this.state.fps;
    }

    /**
     * Get average FPS
     */
    getAverageFPS() {
      if (this.state.fpsHistory.length === 0) return 0;
      return Math.round(
        this.state.fpsHistory.reduce((a, b) => a + b, 0) / this.state.fpsHistory.length
      );
    }

    /**
     * Get particle count
     */
    getParticleCount() {
      return this.state.particles.length;
    }

    /**
     * Get pool statistics for debugging
     */
    getPoolStats() {
      return {
        rain: this.pools.rain.getStats(),
        snow: this.pools.snow.getStats(),
        storm: this.pools.storm.getStats(),
        fog: this.pools.fog.getStats()
      };
    }

    /**
     * Get active effects
     */
    getActiveEffects() {
      return this.state.activeEffects;
    }

    /**
     * Destroy engine
     */
    destroy() {
      this.stop();
      this.stopAllEffects();
      // Release all pools
      Object.values(this.pools).forEach(pool => pool.releaseAll());
      this.state.particles = [];
      this.state.activeEffects = [];
    }
  }

  // Export to global scope or as module
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
      WeatherEngine, 
      Particle, 
      ParticlePool, 
      SimplexNoise,
      generateKochSnowflake,
      generateSnowflakeVariants
    };
  } else {
    global.WeatherEngine = WeatherEngine;
    global.WeatherParticle = Particle;
    global.ParticlePool = ParticlePool;
    global.SimplexNoise = SimplexNoise;
    global.generateKochSnowflake = generateKochSnowflake;
    global.generateSnowflakeVariants = generateSnowflakeVariants;
  }

})(typeof window !== 'undefined' ? window : global);
