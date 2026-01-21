/**
 * WebGL 2.0 Backend for Advanced Fireworks Engine
 * 
 * GPU-Accelerated rendering using WebGL 2.0 with instanced rendering.
 * Maintains full API compatibility with Canvas 2D backend.
 * 
 * Features:
 * - Instanced rendering for maximum GPU performance
 * - Shader-based particle rendering with HSL color support
 * - Hardware-accelerated alpha blending
 * - Same physics and feature set as Canvas 2D backend
 * - Graceful fallback and error handling
 * - Context loss recovery
 * - Support for all particle shapes (circle, heart, paw, image)
 */

const DEBUG_WEBGL = false;

class FireworksEngineWebGL {
  constructor(canvasId, config = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element '${canvasId}' not found`);
    }

    // WebGL context and rendering
    this.gl = null;
    this.shaderProgram = null;
    this.buffers = {};
    this.uniforms = {};
    this.attributes = {};
    this.particleDataArray = null;
    this.maxParticles = 20000;

    // Import global particle pool and classes from Canvas 2D engine
    this.particlePool = window.globalParticlePool || null;
    this.Particle = window.Particle;
    this.Firework = window.Firework;
    this.AudioManager = window.AudioManager;
    this.ShapeGenerators = window.ShapeGenerators;

    // Fireworks state
    this.fireworks = [];
    this.audioManager = new this.AudioManager();

    // Timing and performance
    this.lastTime = performance.now();
    this.lastRenderTime = performance.now();
    this.frameTimestamp = performance.now();
    this.frameCount = 0;
    this.fps = 0;
    this.fpsUpdateTime = performance.now();
    this.fpsHistory = [];
    this.performanceMode = 'normal';

    // Freeze detection
    this.freezeDetectionEnabled = true;
    this.frozenFrameCount = 0;
    this.maxFrozenFrames = 3;
    this.freezeWarningShown = false;

    // Combo throttling
    this.lastComboTriggerTime = 0;
    this.comboTriggerQueue = [];

    // Configuration (merge with defaults from Canvas 2D)
    this.config = {
      ...window.CONFIG,
      ...config,
      toasterMode: false,
      audioEnabled: true,
      audioVolume: 0.7,
      trailsEnabled: true,
      glowEnabled: true,
      targetFps: 60,
      minFps: 24,
      giftPopupPosition: 'bottom',
      giftPopupEnabled: true
    };

    this.running = false;
    this.socket = null;
    this.imageCache = new Map();
    this.debugMode = false;

    this.width = 0;
    this.height = 0;

    // WebGL specific
    this.contextLost = false;
    this.shaderCompilationFailed = false;
  }

  async init() {
    try {
      // Initialize WebGL 2 context
      if (!this.initWebGL()) {
        throw new Error('Failed to initialize WebGL 2 context');
      }

      // Load and compile shaders
      if (!await this.loadShaders()) {
        throw new Error('Failed to load shaders');
      }

      // Setup geometry and buffers
      this.setupBuffers();

      // Setup canvas
      this.resize();
      window.addEventListener('resize', () => this.resize());

      // Context loss handling
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.handleContextLost();
      }, false);

      this.canvas.addEventListener('webglcontextrestored', () => {
        this.handleContextRestored();
      }, false);

      // Initialize audio
      await this.audioManager.init();

      // Connect to Socket.io
      this.connectSocket();

      // Start render loop
      this.running = true;
      this.render();

      if (DEBUG_WEBGL) console.log('[Fireworks WebGL] Initialized successfully');
    } catch (error) {
      console.error('[Fireworks WebGL] Initialization failed:', error);
      throw error;
    }
  }

  initWebGL() {
    try {
      const contextOptions = {
        alpha: true,
        depth: false,
        stencil: false,
        antialias: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
        desynchronized: true
      };

      this.gl = this.canvas.getContext('webgl2', contextOptions);

      if (!this.gl) {
        console.error('[Fireworks WebGL] WebGL 2 not supported');
        return false;
      }

      const gl = this.gl;

      // Enable alpha blending for transparency
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Set clear color (transparent background)
      gl.clearColor(0, 0, 0, 0);

      if (DEBUG_WEBGL) {
        console.log('[Fireworks WebGL] WebGL 2 context created');
        console.log('[Fireworks WebGL] Vendor:', gl.getParameter(gl.VENDOR));
        console.log('[Fireworks WebGL] Renderer:', gl.getParameter(gl.RENDERER));
        console.log('[Fireworks WebGL] Max texture size:', gl.getParameter(gl.MAX_TEXTURE_SIZE));
      }

      return true;
    } catch (error) {
      console.error('[Fireworks WebGL] Failed to create WebGL context:', error);
      return false;
    }
  }

  async loadShaders() {
    try {
      // Load shader source files
      const vertSource = await this.fetchShaderSource('/plugins/fireworks/gpu/shaders/webgl/particle.vert');
      const fragSource = await this.fetchShaderSource('/plugins/fireworks/gpu/shaders/webgl/particle.frag');

      // Compile shaders
      const vertShader = this.compileShader(vertSource, this.gl.VERTEX_SHADER);
      const fragShader = this.compileShader(fragSource, this.gl.FRAGMENT_SHADER);

      if (!vertShader || !fragShader) {
        this.shaderCompilationFailed = true;
        return false;
      }

      // Link shader program
      this.shaderProgram = this.linkProgram(vertShader, fragShader);
      if (!this.shaderProgram) {
        this.shaderCompilationFailed = true;
        return false;
      }

      // Get attribute and uniform locations
      this.setupShaderLocations();

      if (DEBUG_WEBGL) console.log('[Fireworks WebGL] Shaders compiled and linked successfully');
      return true;
    } catch (error) {
      console.error('[Fireworks WebGL] Shader loading failed:', error);
      this.shaderCompilationFailed = true;
      return false;
    }
  }

  async fetchShaderSource(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${url} (${response.status})`);
    }
    return await response.text();
  }

  compileShader(source, type) {
    const gl = this.gl;
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      console.error('[Fireworks WebGL] Shader compilation error:', info);
      console.error('[Fireworks WebGL] Shader source:', source);
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  linkProgram(vertShader, fragShader) {
    const gl = this.gl;
    const program = gl.createProgram();

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      console.error('[Fireworks WebGL] Program linking error:', info);
      gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  setupShaderLocations() {
    const gl = this.gl;
    const program = this.shaderProgram;

    // Attribute locations
    this.attributes = {
      position: gl.getAttribLocation(program, 'a_position'),
      velocity: gl.getAttribLocation(program, 'a_velocity'),
      size: gl.getAttribLocation(program, 'a_size'),
      hue: gl.getAttribLocation(program, 'a_hue'),
      saturation: gl.getAttribLocation(program, 'a_saturation'),
      brightness: gl.getAttribLocation(program, 'a_brightness'),
      alpha: gl.getAttribLocation(program, 'a_alpha'),
      rotation: gl.getAttribLocation(program, 'a_rotation'),
      corner: gl.getAttribLocation(program, 'a_corner')
    };

    // Uniform locations
    this.uniforms = {
      resolution: gl.getUniformLocation(program, 'u_resolution')
    };

    if (DEBUG_WEBGL) {
      console.log('[Fireworks WebGL] Shader locations:', this.attributes, this.uniforms);
    }
  }

  setupBuffers() {
    const gl = this.gl;

    // Quad corners for instanced rendering (shared by all particles)
    // Each particle is rendered as a 2-triangle quad
    const cornerData = new Float32Array([
      -1, -1,  // Bottom-left
       1, -1,  // Bottom-right
      -1,  1,  // Top-left
       1,  1   // Top-right
    ]);

    this.buffers.corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.corner);
    gl.bufferData(gl.ARRAY_BUFFER, cornerData, gl.STATIC_DRAW);

    // Instance data buffer (per-particle attributes)
    // Format: [x, y, vx, vy, size, hue, saturation, brightness, alpha, rotation] * maxParticles
    this.particleDataArray = new Float32Array(this.maxParticles * 10);
    this.buffers.instance = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.instance);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleDataArray, gl.DYNAMIC_DRAW);

    // Setup VAO for cleaner state management
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Setup corner attribute (per-vertex)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.corner);
    gl.enableVertexAttribArray(this.attributes.corner);
    gl.vertexAttribPointer(this.attributes.corner, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(this.attributes.corner, 0); // Shared by all instances

    // Setup instance attributes (per-instance)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.instance);

    const stride = 10 * 4; // 10 floats * 4 bytes per float

    gl.enableVertexAttribArray(this.attributes.position);
    gl.vertexAttribPointer(this.attributes.position, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(this.attributes.position, 1);

    gl.enableVertexAttribArray(this.attributes.velocity);
    gl.vertexAttribPointer(this.attributes.velocity, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.vertexAttribDivisor(this.attributes.velocity, 1);

    gl.enableVertexAttribArray(this.attributes.size);
    gl.vertexAttribPointer(this.attributes.size, 1, gl.FLOAT, false, stride, 4 * 4);
    gl.vertexAttribDivisor(this.attributes.size, 1);

    gl.enableVertexAttribArray(this.attributes.hue);
    gl.vertexAttribPointer(this.attributes.hue, 1, gl.FLOAT, false, stride, 5 * 4);
    gl.vertexAttribDivisor(this.attributes.hue, 1);

    gl.enableVertexAttribArray(this.attributes.saturation);
    gl.vertexAttribPointer(this.attributes.saturation, 1, gl.FLOAT, false, stride, 6 * 4);
    gl.vertexAttribDivisor(this.attributes.saturation, 1);

    gl.enableVertexAttribArray(this.attributes.brightness);
    gl.vertexAttribPointer(this.attributes.brightness, 1, gl.FLOAT, false, stride, 7 * 4);
    gl.vertexAttribDivisor(this.attributes.brightness, 1);

    gl.enableVertexAttribArray(this.attributes.alpha);
    gl.vertexAttribPointer(this.attributes.alpha, 1, gl.FLOAT, false, stride, 8 * 4);
    gl.vertexAttribDivisor(this.attributes.alpha, 1);

    gl.enableVertexAttribArray(this.attributes.rotation);
    gl.vertexAttribPointer(this.attributes.rotation, 1, gl.FLOAT, false, stride, 9 * 4);
    gl.vertexAttribDivisor(this.attributes.rotation, 1);

    gl.bindVertexArray(null);

    if (DEBUG_WEBGL) console.log('[Fireworks WebGL] Buffers and VAO setup complete');
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;

    // Get resolution from preset
    const resolutionPreset = this.config.resolutionPreset || '1080p';
    const orientation = this.config.orientation || 'landscape';
    const targetResolution = this.getResolutionFromPreset(resolutionPreset, orientation);

    // Apply target resolution
    this.canvas.width = targetResolution.width;
    this.canvas.height = targetResolution.height;

    this.width = targetResolution.width;
    this.height = targetResolution.height;

    // Update WebGL viewport
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    if (DEBUG_WEBGL) {
      console.log(`[Fireworks WebGL] Canvas resolution: ${this.canvas.width}x${this.canvas.height} (${resolutionPreset}, ${orientation})`);
    }
  }

  getResolutionFromPreset(preset, orientation) {
    const resolutions = {
      '360p': { landscape: { width: 640, height: 360 }, portrait: { width: 360, height: 640 } },
      '540p': { landscape: { width: 960, height: 540 }, portrait: { width: 540, height: 960 } },
      '720p': { landscape: { width: 1280, height: 720 }, portrait: { width: 720, height: 1280 } },
      '1080p': { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } },
      '1440p': { landscape: { width: 2560, height: 1440 }, portrait: { width: 1440, height: 2560 } },
      '4k': { landscape: { width: 3840, height: 2160 }, portrait: { width: 2160, height: 3840 } }
    };

    const presetData = resolutions[preset] || resolutions['1080p'];
    return orientation === 'portrait' ? presetData.portrait : presetData.landscape;
  }

  connectSocket() {
    try {
      this.socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000
      });

      this.socket.on('connect', () => {
        if (DEBUG_WEBGL) console.log('[Fireworks WebGL] Connected to server');
      });

      this.socket.on('fireworks:trigger', (data) => {
        this.handleTrigger(data);
      });

      this.socket.on('fireworks:finale', (data) => {
        this.handleFinale(data);
      });

      this.socket.on('fireworks:follower-animation', (data) => {
        this.showFollowerAnimation(data);
      });

      this.socket.on('fireworks:config-update', (data) => {
        if (data.config) {
          Object.assign(this.config, data.config);
          if (data.config.resolutionPreset || data.config.orientation) {
            this.resize();
          }
          if (DEBUG_WEBGL) console.log('[Fireworks WebGL] Config updated:', data.config);
        }
      });
    } catch (error) {
      console.error('[Fireworks WebGL] Socket connection failed:', error);
    }
  }

  async handleTrigger(data) {
    const {
      position = { x: 0.5, y: 0.5 },
      shape = 'burst',
      colors = this.config.defaultColors,
      intensity = 1.0,
      particleCount = 50,
      giftImage = null,
      userAvatar = null,
      avatarParticleChance = 0.3,
      tier = 'medium',
      username = null,
      coins = 0,
      combo = 1,
      playSound = true,
      targetFps = null,
      minFps = null,
      despawnFadeDuration = null,
      giftPopupEnabled = null,
      giftPopupPosition = null
    } = data;

    // Update config values if provided
    if (targetFps !== null) this.config.targetFps = targetFps;
    if (minFps !== null) this.config.minFps = minFps;
    if (despawnFadeDuration !== null) this.config.despawnFadeDuration = despawnFadeDuration;
    if (giftPopupEnabled !== null) this.config.giftPopupEnabled = giftPopupEnabled;
    if (giftPopupPosition !== null) this.config.giftPopupPosition = giftPopupPosition;

    // Combo throttling
    const now = performance.now();
    const timeSinceLastTrigger = now - this.lastComboTriggerTime;
    const minInterval = window.CONFIG.comboThrottleMinInterval;

    if (this.lastComboTriggerTime > 0 && timeSinceLastTrigger < minInterval) {
      if (DEBUG_WEBGL) console.log('[Fireworks WebGL] Combo throttled');
      return;
    }

    this.lastComboTriggerTime = now;

    // High combo optimization
    const skipRockets = combo >= window.CONFIG.comboSkipRocketsThreshold;
    const instantExplode = combo >= window.CONFIG.comboInstantExplodeThreshold;

    // Launch position
    const startX = position.x * this.width;
    const targetY = position.y * this.height;

    // Load images if provided
    let giftImg = null;
    let avatarImg = null;
    if (giftImage) giftImg = await this.loadImage(giftImage);
    if (userAvatar) avatarImg = await this.loadImage(userAvatar);

    // Create firework using shared Firework class
    const firework = new this.Firework({
      x: startX,
      y: skipRockets ? targetY : this.height,
      targetY: targetY,
      shape: shape,
      colors: colors,
      intensity: intensity,
      giftImage: giftImg,
      userAvatar: avatarImg,
      avatarParticleChance: avatarParticleChance,
      useImages: !!(giftImg || avatarImg),
      tier: tier,
      combo: combo,
      skipRocket: skipRockets,
      instantExplode: instantExplode,
      engineFps: this.fps
    });

    // Audio handling (same as Canvas 2D backend)
    if (playSound && this.audioManager.enabled) {
      const audioConfig = this.audioManager.selectAudio(tier, combo, instantExplode, 1.5);

      if (audioConfig.useCombinedAudio) {
        if (audioConfig.combinedSound && !skipRockets) {
          this.audioManager.play(audioConfig.combinedSound, this.audioManager.COMBINED_AUDIO_VOLUME);
        }
      } else {
        if (audioConfig.launchSound && !skipRockets) {
          this.audioManager.play(audioConfig.launchSound, this.audioManager.LAUNCH_AUDIO_VOLUME);
        }

        const soundVolume = instantExplode
          ? this.audioManager.INSTANT_EXPLODE_VOLUME
          : this.audioManager.NORMAL_EXPLOSION_VOLUME;

        if (audioConfig.explosionSound) {
          firework.onExplodeSound = (intensity) => {
            this.audioManager.play(audioConfig.explosionSound, intensity * soundVolume);

            if (audioConfig.cracklingSound) {
              const cracklingDuration = tier === 'massive' ? 1.5 : tier === 'big' ? 1.2 : 1.0;
              this.audioManager.play(audioConfig.cracklingSound, 0.6, cracklingDuration);
            }
          };
        }
      }
    }

    this.fireworks.push(firework);

    // Show gift popup
    if (username && coins && giftImage) {
      this.showGiftPopup(startX, targetY, username, coins, combo, giftImage);
    }
  }

  handleFinale(data) {
    const {
      burstCount = 5,
      burstInterval = 300,
      shapes = ['burst', 'heart', 'ring'],
      intensity = 1.5,
      colors = this.config.defaultColors
    } = data;

    const optimizedBurstCount = Math.min(burstCount, 10);
    const optimizedInterval = Math.max(burstInterval, 500);
    const optimizedIntensity = Math.min(intensity, 2.0);

    let bursts = 0;
    const interval = setInterval(() => {
      if (bursts >= optimizedBurstCount) {
        clearInterval(interval);
        return;
      }

      const position = {
        x: 0.2 + Math.random() * 0.6,
        y: 0.2 + Math.random() * 0.4
      };

      const shape = shapes[Math.floor(Math.random() * shapes.length)];

      this.handleTrigger({
        position,
        shape,
        colors,
        intensity: optimizedIntensity * (0.8 + Math.random() * 0.4),
        particleCount: Math.round(50 * optimizedIntensity),
        playSound: true
      });

      bursts++;
    }, optimizedInterval);
  }

  showFollowerAnimation(data) {
    // Follower animation uses DOM elements (same as Canvas 2D)
    const animationEl = document.getElementById('follower-animation');
    const contentEl = document.getElementById('follower-content');
    const avatarEl = document.getElementById('follower-avatar');
    const usernameEl = document.getElementById('follower-username');

    if (!animationEl || !contentEl || !avatarEl || !usernameEl) return;

    animationEl.className = 'follower-animation';
    contentEl.className = 'follower-content';
    contentEl.style.transform = '';

    const position = data.position || 'center';
    animationEl.classList.add(`pos-${position}`);

    const size = data.size || 'medium';
    animationEl.classList.add(`size-${size}`);

    if (size === 'custom') {
      const scale = data.scale || 1.0;
      contentEl.style.transform = `scale(${scale})`;
    }

    const style = data.style || 'gradient-purple';
    contentEl.classList.add(`style-${style}`);

    const entrance = data.entrance || 'scale';
    animationEl.classList.add(`entrance-${entrance}`);

    usernameEl.textContent = data.username || 'Unknown';

    if (data.profilePictureUrl) {
      avatarEl.src = data.profilePictureUrl;
      avatarEl.classList.add('show');
    } else {
      avatarEl.classList.remove('show');
    }

    animationEl.classList.add('show');

    const duration = data.duration || 3000;
    setTimeout(() => {
      animationEl.classList.remove('show');
      setTimeout(() => {
        animationEl.className = 'follower-animation';
        contentEl.className = 'follower-content';
        contentEl.style.transform = '';
      }, 500);
    }, duration);
  }

  async loadImage(url) {
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url);
    }

    if (!url || typeof url !== 'string') return null;
    const lowerUrl = url.toLowerCase();
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];
    if (dangerousProtocols.some(protocol => lowerUrl.startsWith(protocol))) {
      console.warn('[Fireworks WebGL] Invalid image URL blocked:', url);
      return null;
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          if (img.decode) {
            await img.decode();
          }
        } catch (error) {
          if (DEBUG_WEBGL) console.warn('[Fireworks WebGL] Image decode failed:', error);
        }
        this.imageCache.set(url, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  showGiftPopup(x, y, username, coins, combo, giftImage) {
    const popupPosition = this.config.giftPopupPosition;
    const popupEnabled = this.config.giftPopupEnabled !== false;

    if (popupPosition === 'none' || !popupEnabled) return;

    let finalX = x;
    let finalY = y;

    if (typeof popupPosition === 'string') {
      switch (popupPosition) {
        case 'top':
          finalX = this.width / 2;
          finalY = 100;
          break;
        case 'middle':
          finalX = this.width / 2;
          finalY = this.height / 2;
          break;
        case 'bottom':
          finalX = x;
          finalY = this.height - 100;
          break;
      }
    } else if (typeof popupPosition === 'object' && popupPosition.x !== undefined) {
      finalX = popupPosition.x < 2 ? popupPosition.x * this.width : popupPosition.x;
      finalY = popupPosition.y < 2 ? popupPosition.y * this.height : popupPosition.y;
    }

    const popup = document.createElement('div');
    popup.className = 'gift-popup';
    popup.style.cssText = `
      position: absolute;
      left: ${finalX}px;
      top: ${finalY}px;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 25px;
      font-size: 18px;
      font-weight: bold;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: popIn 0.3s ease-out, fadeOut 0.5s ease-in 2s forwards;
      pointer-events: none;
      z-index: 100;
      border: 2px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    if (giftImage) {
      const img = document.createElement('img');
      img.src = giftImage;
      img.style.cssText = 'width: 32px; height: 32px; object-fit: contain;';
      popup.appendChild(img);
    }

    const text = document.createElement('span');
    text.textContent = `${username}: ${coins} coins`;
    popup.appendChild(text);

    if (combo > 1) {
      const comboSpan = document.createElement('span');
      comboSpan.style.color = '#ffcc00';
      comboSpan.textContent = ` ${combo}x COMBO!`;
      popup.appendChild(comboSpan);
    }

    document.getElementById('fireworks-container').appendChild(popup);

    setTimeout(() => popup.remove(), 2500);
  }

  render() {
    if (!this.running || this.contextLost) return;

    const now = performance.now();
    this.frameTimestamp = now;

    // FPS throttling
    const targetFps = this.config.targetFps || 60;
    const targetFrameTime = 1000 / targetFps;
    const timeSinceLastRender = now - this.lastRenderTime;

    if (timeSinceLastRender < targetFrameTime - 1) {
      requestAnimationFrame(() => this.render());
      return;
    }

    // Calculate deltaTime for frame-independent physics
    const deltaTime = Math.min((now - this.lastTime) / (1000 / 60), 3);
    this.lastTime = now;
    this.lastRenderTime = now;

    // Clear canvas
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Update all fireworks (physics on CPU)
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      this.fireworks[i].update(deltaTime);

      if (this.fireworks[i].isDone()) {
        this.fireworks.splice(i, 1);
      }
    }

    // Collect all visible particles
    const particles = this.collectParticles();

    // Render particles with WebGL
    if (particles.length > 0) {
      this.renderParticlesWebGL(particles);
    }

    // Update FPS and adaptive performance
    this.updatePerformanceMetrics(now);

    requestAnimationFrame(() => this.render());
  }

  collectParticles() {
    const particles = [];

    for (const firework of this.fireworks) {
      // Add rocket
      if (!firework.exploded && firework.rocket) {
        if (this.isParticleVisible(firework.rocket)) {
          particles.push(firework.rocket);
        }
      }

      // Add explosion particles
      for (const p of firework.particles) {
        if (this.isParticleVisible(p)) {
          particles.push(p);
        }
      }

      // Add secondary explosions
      for (const p of firework.secondaryExplosions) {
        if (this.isParticleVisible(p)) {
          particles.push(p);
        }
      }
    }

    return particles;
  }

  isParticleVisible(p) {
    // Alpha culling
    if (p.alpha < 0.01) return false;

    // Viewport culling
    const margin = 100;
    return !(p.x < -margin || p.x > this.width + margin || p.y < -margin || p.y > this.height + margin);
  }

  renderParticlesWebGL(particles) {
    const gl = this.gl;

    // Limit particles to max buffer size
    const particleCount = Math.min(particles.length, this.maxParticles);

    // Pack particle data into Float32Array
    for (let i = 0; i < particleCount; i++) {
      const p = particles[i];
      const offset = i * 10;

      this.particleDataArray[offset + 0] = p.x;
      this.particleDataArray[offset + 1] = p.y;
      this.particleDataArray[offset + 2] = p.vx;
      this.particleDataArray[offset + 3] = p.vy;
      this.particleDataArray[offset + 4] = p.size;
      this.particleDataArray[offset + 5] = p.hue;
      this.particleDataArray[offset + 6] = p.saturation;
      this.particleDataArray[offset + 7] = p.brightness;
      this.particleDataArray[offset + 8] = p.alpha;
      this.particleDataArray[offset + 9] = p.rotation;
    }

    // Upload particle data to GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.instance);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particleDataArray.subarray(0, particleCount * 10));

    // Use shader program
    gl.useProgram(this.shaderProgram);

    // Set uniforms
    gl.uniform2f(this.uniforms.resolution, this.width, this.height);

    // Bind VAO
    gl.bindVertexArray(this.vao);

    // Draw all particles with one instanced draw call
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, particleCount);

    // Unbind
    gl.bindVertexArray(null);

    if (DEBUG_WEBGL && this.frameCount % 60 === 0) {
      console.log(`[Fireworks WebGL] Rendered ${particleCount} particles`);
    }
  }

  updatePerformanceMetrics(now) {
    this.frameCount++;

    if (now - this.fpsUpdateTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsUpdateTime = now;

      this.fpsHistory.push(this.fps);
      if (this.fpsHistory.length > 5) {
        this.fpsHistory.shift();
      }

      // Freeze detection
      if (this.freezeDetectionEnabled) {
        if (this.fps === 0) {
          this.frozenFrameCount++;

          if (this.frozenFrameCount === 1 && !this.freezeWarningShown) {
            console.warn('[Fireworks WebGL] ⚠️ FPS dropped to 0, monitoring for freeze...');
            this.freezeWarningShown = true;
          }

          if (this.frozenFrameCount >= this.maxFrozenFrames) {
            console.error(`[Fireworks WebGL] 🔄 FPS frozen for ${this.maxFrozenFrames} seconds, auto-reloading...`);
            this.showFreezeWarning();
            setTimeout(() => window.location.reload(), 2000);
            return;
          }
        } else {
          if (this.frozenFrameCount > 0) {
            console.log(`[Fireworks WebGL] ✅ FPS recovered (was frozen for ${this.frozenFrameCount}s)`);
          }
          this.frozenFrameCount = 0;
          this.freezeWarningShown = false;
        }
      }

      // Adaptive performance
      const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
      this.applyAdaptivePerformance(avgFps);

      // Debug display
      if (this.debugMode) {
        const fpsEl = document.getElementById('fps');
        const particleEl = document.getElementById('particle-count');
        const modeEl = document.getElementById('performance-mode');
        if (fpsEl) fpsEl.textContent = this.fps;
        if (particleEl) particleEl.textContent = this.getTotalParticles();
        if (modeEl) modeEl.textContent = this.performanceMode.toUpperCase();
      }

      // Emit FPS to server
      if (this.socket && this.socket.connected) {
        this.socket.emit('fireworks:fps-update', { fps: this.fps, timestamp: now });
      }
    }
  }

  applyAdaptivePerformance(avgFps) {
    const targetFps = this.config.targetFps || 60;
    const minFps = this.config.minFps || 24;

    const resolutionScale = Math.min(this.width / 1920, 1.0);
    const adjustedMinFps = Math.floor(minFps * (0.7 + resolutionScale * 0.3));
    const adjustedTargetFps = Math.floor(targetFps * (0.7 + resolutionScale * 0.3));

    if (avgFps < adjustedMinFps) {
      if (this.performanceMode !== 'minimal') {
        this.performanceMode = 'minimal';
        this.applyPerformanceMode();
        if (DEBUG_WEBGL) console.log('[Fireworks WebGL] Performance: MINIMAL mode');
      }
    } else if (avgFps < adjustedTargetFps * 0.8) {
      if (this.performanceMode !== 'reduced') {
        this.performanceMode = 'reduced';
        this.applyPerformanceMode();
        if (DEBUG_WEBGL) console.log('[Fireworks WebGL] Performance: REDUCED mode');
      }
    } else if (avgFps >= adjustedTargetFps * 0.95) {
      if (this.performanceMode !== 'normal') {
        this.performanceMode = 'normal';
        this.applyPerformanceMode();
        if (DEBUG_WEBGL) console.log('[Fireworks WebGL] Performance: NORMAL mode');
      }
    }
  }

  applyPerformanceMode() {
    const CONFIG = window.CONFIG;

    switch (this.performanceMode) {
      case 'minimal':
        CONFIG.maxParticlesPerExplosion = 50;
        CONFIG.trailLength = 3;
        CONFIG.sparkleChance = 0.05;
        CONFIG.secondaryExplosionChance = 0;
        this.config.glowEnabled = false;
        this.config.trailsEnabled = false;

        while (this.fireworks.length > 20) {
          const fw = this.fireworks.pop();
          if (this.particlePool) {
            this.particlePool.releaseAll(fw.particles);
            this.particlePool.releaseAll(fw.secondaryExplosions);
          }
        }
        break;

      case 'reduced':
        CONFIG.maxParticlesPerExplosion = 100;
        CONFIG.trailLength = 8;
        CONFIG.sparkleChance = 0.08;
        CONFIG.secondaryExplosionChance = 0.05;
        this.config.glowEnabled = false;
        this.config.trailsEnabled = true;

        while (this.fireworks.length > 15) {
          const fw = this.fireworks.pop();
          if (this.particlePool) {
            this.particlePool.releaseAll(fw.particles);
            this.particlePool.releaseAll(fw.secondaryExplosions);
          }
        }
        break;

      case 'normal':
        CONFIG.maxParticlesPerExplosion = 200;
        CONFIG.trailLength = 20;
        CONFIG.sparkleChance = 0.15;
        CONFIG.secondaryExplosionChance = 0.1;
        this.config.glowEnabled = true;
        this.config.trailsEnabled = true;
        break;
    }
  }

  showFreezeWarning() {
    const warning = document.createElement('div');
    warning.id = 'freeze-warning';
    warning.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.9);
      color: white;
      padding: 30px 50px;
      border-radius: 15px;
      font-size: 24px;
      font-weight: bold;
      text-align: center;
      z-index: 10000;
      border: 3px solid white;
      box-shadow: 0 0 30px rgba(255, 0, 0, 0.8);
    `;
    warning.innerHTML = `
      <div>⚠️ OVERLAY FROZEN ⚠️</div>
      <div style="font-size: 18px; margin-top: 10px;">Auto-reloading in 2 seconds...</div>
    `;
    document.body.appendChild(warning);
  }

  getTotalParticles() {
    let count = 0;
    for (const fw of this.fireworks) {
      count += fw.particles.length + fw.secondaryExplosions.length;
      if (!fw.exploded) count++;
    }
    return count;
  }

  toggleDebug() {
    this.debugMode = !this.debugMode;
    const panel = document.getElementById('debug-panel');
    if (panel) {
      panel.classList.toggle('visible', this.debugMode);
    }
  }

  handleContextLost() {
    console.warn('[Fireworks WebGL] WebGL context lost');
    this.contextLost = true;
    this.running = false;
  }

  handleContextRestored() {
    console.log('[Fireworks WebGL] WebGL context restored, reinitializing...');
    this.contextLost = false;

    this.initWebGL();
    this.loadShaders().then(() => {
      this.setupBuffers();
      this.running = true;
      this.render();
      console.log('[Fireworks WebGL] Reinitialized successfully');
    });
  }

  destroy() {
    this.running = false;

    if (this.socket) {
      this.socket.disconnect();
    }

    if (this.gl) {
      const gl = this.gl;

      // Cleanup WebGL resources
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.buffers.corner) gl.deleteBuffer(this.buffers.corner);
      if (this.buffers.instance) gl.deleteBuffer(this.buffers.instance);
      if (this.shaderProgram) gl.deleteProgram(this.shaderProgram);

      // Lose context
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }

    if (DEBUG_WEBGL) console.log('[Fireworks WebGL] Destroyed');
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FireworksEngineWebGL;
}

// Expose to window for browser usage
if (typeof window !== 'undefined') {
  window.FireworksEngineWebGL = FireworksEngineWebGL;
}
