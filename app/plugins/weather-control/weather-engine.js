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
      
      switch (this.type) {
        case 'rain':
          this.speedY = 15 + Math.random() * 15;
          this.speedX = Math.random() * 3 - 1.5;
          this.length = 15 + Math.random() * 25;
          this.width = 1 + Math.random() * 1.5;
          this.alpha = 0.4 + Math.random() * 0.4;
          this.color = `rgba(160, 196, 232, ${this.alpha})`;
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

    update(deltaTime, intensity = 1.0, dimensions = null) {
      const speed = deltaTime / 16.67; // Normalize to 60fps
      const w = dimensions?.width || window.innerWidth;
      const h = dimensions?.height || window.innerHeight;
      
      switch (this.type) {
        case 'rain':
          this.y += this.speedY * speed * intensity;
          this.x += this.speedX * speed;
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

    draw(ctx) {
      if (!this.active || !ctx) return;
      
      ctx.save();
      ctx.globalAlpha = this.alpha;
      
      switch (this.type) {
        case 'rain':
        case 'storm':
          ctx.strokeStyle = this.color || (this.type === 'storm' ? '#6ba3d6' : '#a0c4e8');
          ctx.lineWidth = this.width;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(this.x - this.speedX * 2, this.y - this.length);
          ctx.stroke();
          break;
        
        case 'snow':
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.rotate(this.rotation);
          
          // Draw snowflake with multiple points
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
          
          // Add sparkle effect occasionally
          if (Math.random() < SNOWFLAKE_SPARKLE_CHANCE) {
            ctx.fillStyle = '#ffffdd';
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(0, 0, this.size * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
          
          ctx.restore();
          break;
        
        case 'fog':
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
      
      this.options = {
        debug: options.debug || false,
        ...options
      };
      
      this.state = {
        activeEffects: [],
        particles: [],
        animationId: null,
        lastFrameTime: 0,
        fps: 0,
        fpsHistory: [],
        running: false
      };
      
      this.dimensions = {
        width: 0,
        height: 0
      };
      
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
      
      // Create particles based on effect type
      if (type === 'rain') {
        const particleCount = Math.floor(250 * intensity);
        for (let i = 0; i < particleCount; i++) {
          const particle = new Particle('rain');
          effect.particles.push(particle);
        }
      } else if (type === 'snow') {
        const particleCount = Math.floor(180 * intensity);
        for (let i = 0; i < particleCount; i++) {
          const particle = new Particle('snow');
          effect.particles.push(particle);
        }
      } else if (type === 'storm') {
        const particleCount = Math.floor(300 * intensity);
        for (let i = 0; i < particleCount; i++) {
          const particle = new Particle('storm');
          effect.particles.push(particle);
        }
      } else if (type === 'fog') {
        const particleCount = Math.floor(30 * intensity);
        for (let i = 0; i < particleCount; i++) {
          const particle = new Particle('fog');
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
        specificEffect.particles.forEach(p => p.destroy());
        this.state.particles = this.state.particles.filter(p => p.active);
        this.state.activeEffects = this.state.activeEffects.filter(e => e !== specificEffect);
      } else {
        // Stop all effects of this type
        this.state.activeEffects.filter(e => e.type === type).forEach(e => {
          if (e.timerId) clearTimeout(e.timerId);
          e.particles.forEach(p => p.destroy());
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
        e.particles.forEach(p => p.destroy());
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
     * Render loop
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
      
      // Update and draw particles
      for (let i = this.state.particles.length - 1; i >= 0; i--) {
        const particle = this.state.particles[i];
        if (!particle.active) {
          this.state.particles.splice(i, 1);
          continue;
        }
        
        const effect = this.state.activeEffects.find(e =>
          e.particles && e.particles.includes(particle)
        );
        const intensity = effect ? effect.intensity : 1.0;
        
        particle.update(deltaTime, intensity, this.dimensions);
        particle.draw(this.ctx);
      }
      
      // Handle special effects
      for (const effect of this.state.activeEffects) {
        if (effect.type === 'sunbeam' && effect.beams) {
          this.drawSunbeams(effect);
        }
        if (effect.type === 'glitchclouds') {
          this.drawGlitchClouds(effect);
        }
        if (effect.type === 'thunder' && Date.now() >= effect.nextFlash) {
          this.triggerLightning(effect.intensity);
          effect.flashCount = (effect.flashCount || 0) + 1;
          effect.nextFlash = Date.now() + 400 + Math.random() * 2500;
        }
      }
      
      // Continue animation
      if (this.state.running) {
        this.state.animationId = requestAnimationFrame(this.render.bind(this));
      }
    }

    /**
     * Draw sunbeams
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
        
        this.ctx.save();
        this.ctx.translate(beam.x, beam.y);
        this.ctx.rotate((beam.angle * Math.PI) / 180);
        
        const gradient = this.ctx.createLinearGradient(0, 0, 0, beam.height);
        gradient.addColorStop(0, `rgba(255, 255, 200, ${beam.opacity * effect.intensity})`);
        gradient.addColorStop(0.5, `rgba(255, 255, 200, ${beam.opacity * 0.5 * effect.intensity})`);
        gradient.addColorStop(1, 'rgba(255, 255, 200, 0)');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(-beam.width / 2, 0, beam.width, beam.height);
        this.ctx.restore();
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
      this.state.particles = [];
      this.state.activeEffects = [];
    }
  }

  // Export to global scope or as module
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WeatherEngine, Particle };
  } else {
    global.WeatherEngine = WeatherEngine;
    global.WeatherParticle = Particle;
  }

})(typeof window !== 'undefined' ? window : global);
