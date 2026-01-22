/**
 * WebGL2 Weather Renderer
 * 
 * Professional WebGL2-based weather effects renderer with guaranteed transparency.
 * Features: Instanced particle rendering, bloom post-processing, multi-layer effects,
 * premultiplied alpha blending, Shadow DOM isolation.
 * 
 * @version 2.0.0
 * @author PupCid
 */

class WebGL2WeatherRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      debug: options.debug || false,
      maxDPR: options.maxDPR || 1.5,
      fallbackChromaKey: options.fallbackChromaKey || false,
      ...options
    };
    
    // WebGL2 context with premultiplied alpha
    this.gl = null;
    this.programs = {};
    this.buffers = {};
    this.textures = {};
    this.framebuffers = {};
    
    // Particle systems
    this.particleSystems = {
      rain: { particles: [], maxCount: 1200, layerCounts: { far: 0, mid: 0, near: 0 } },
      snow: { particles: [], maxCount: 700, layerCounts: { far: 0, mid: 0, near: 0 } },
      fog: { quads: [], maxCount: 3 }
    };
    
    // Active effects
    this.activeEffects = new Set();
    
    // Performance metrics
    this.metrics = {
      fps: 0,
      frameTime: 0,
      particleCount: 0,
      drawCalls: 0
    };
    
    // Animation state
    this.animationId = null;
    this.lastFrameTime = 0;
    this.deltaTime = 0;
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize WebGL2 context and resources
   */
  init() {
    // Get WebGL2 context with transparency settings
    const contextOptions = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      desynchronized: true
    };
    
    this.gl = this.canvas.getContext('webgl2', contextOptions);
    
    if (!this.gl) {
      console.error('❌ WebGL2 not supported!');
      this.handleWebGL2NotSupported();
      return;
    }
    
    // Verify context attributes
    const attrs = this.gl.getContextAttributes();
    console.log('✅ WebGL2 context initialized:', attrs);
    
    if (!attrs.alpha || !attrs.premultipliedAlpha) {
      console.warn('⚠️ Transparency settings not optimal:', attrs);
    }
    
    // Setup WebGL state
    this.setupWebGLState();
    
    // Compile shaders and create programs
    this.createShaderPrograms();
    
    // Create geometry buffers
    this.createBuffers();
    
    // Create framebuffers for post-processing
    this.createFramebuffers();
    
    // Resize to initial size
    this.resize();
    
    // Initial clear with transparent black
    this.clearTransparent();
    
    // Verify initial transparency
    this.verifyTransparency();
    
    console.log('✅ WebGL2 Weather Renderer initialized');
  }
  
  /**
   * Handle WebGL2 not supported - fallback to Canvas 2D or chroma key
   */
  handleWebGL2NotSupported() {
    const message = 'WebGL2 is not supported in this browser. Please use a modern browser (Chrome, Firefox, Edge).';
    console.error(message);
    
    // Emit event for UI to handle
    if (window.socket) {
      window.socket.emit('weather:webgl-error', { message });
    }
    
    // Optionally show chroma key background as fallback
    if (this.options.fallbackChromaKey) {
      document.body.style.background = '#ff00ff'; // Hot pink for chroma key
    }
  }
  
  /**
   * Setup WebGL state for transparent rendering
   */
  setupWebGLState() {
    const gl = this.gl;
    
    // Enable depth testing
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    
    // Enable blending with premultiplied alpha
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA,  // RGB: premultiplied alpha
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA   // Alpha
    );
    gl.blendEquation(gl.FUNC_ADD);
    
    // Clear color: transparent black (0, 0, 0, 0)
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clearDepth(1.0);
    
    // Disable culling for particles
    gl.disable(gl.CULL_FACE);
  }
  
  /**
   * Create and compile shader programs
   */
  createShaderPrograms() {
    const gl = this.gl;
    
    // Rain particle shader (instanced)
    this.programs.rain = this.createProgram(
      this.getVertexShader('rain'),
      this.getFragmentShader('rain')
    );
    
    // Snow particle shader (instanced)
    this.programs.snow = this.createProgram(
      this.getVertexShader('snow'),
      this.getFragmentShader('snow')
    );
    
    // Fog shader (textured quads)
    this.programs.fog = this.createProgram(
      this.getVertexShader('fog'),
      this.getFragmentShader('fog')
    );
    
    // Lightning bolt shader
    this.programs.lightning = this.createProgram(
      this.getVertexShader('lightning'),
      this.getFragmentShader('lightning')
    );
    
    // Sunbeam/godray shader
    this.programs.sunbeam = this.createProgram(
      this.getVertexShader('sunbeam'),
      this.getFragmentShader('sunbeam')
    );
    
    // Bloom downsample shader
    this.programs.bloomDown = this.createProgram(
      this.getVertexShader('fullscreen'),
      this.getFragmentShader('bloomDown')
    );
    
    // Bloom upsample shader (dual Kawase)
    this.programs.bloomUp = this.createProgram(
      this.getVertexShader('fullscreen'),
      this.getFragmentShader('bloomUp')
    );
    
    // Final composite shader (with optional LUT and chromatic aberration)
    this.programs.composite = this.createProgram(
      this.getVertexShader('fullscreen'),
      this.getFragmentShader('composite')
    );
  }
  
  /**
   * Create a shader program from vertex and fragment source
   */
  createProgram(vertexSource, fragmentSource) {
    const gl = this.gl;
    
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }
    
    // Cache uniform and attribute locations
    program.uniforms = this.getUniformLocations(program);
    program.attributes = this.getAttributeLocations(program);
    
    return program;
  }
  
  /**
   * Compile a shader
   */
  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      console.error('Shader source:', source);
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
  /**
   * Get all uniform locations for a program
   */
  getUniformLocations(program) {
    const gl = this.gl;
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }
    
    return uniforms;
  }
  
  /**
   * Get all attribute locations for a program
   */
  getAttributeLocations(program) {
    const gl = this.gl;
    const attributes = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveAttrib(program, i);
      attributes[info.name] = gl.getAttribLocation(program, info.name);
    }
    
    return attributes;
  }
  
  /**
   * Get vertex shader source
   */
  getVertexShader(type) {
    switch (type) {
      case 'rain':
        return `#version 300 es
        precision highp float;
        
        // Per-vertex attributes
        in vec2 a_position;
        
        // Per-instance attributes
        in vec3 a_instancePosition; // x, y, layer (z for depth)
        in vec4 a_instanceData;     // length, angle, alpha, speed
        
        // Uniforms
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform mat4 u_projection;
        
        // Outputs to fragment shader
        out float v_alpha;
        out float v_layer;
        
        void main() {
          v_alpha = a_instanceData.z;
          v_layer = a_instancePosition.z;
          
          // Apply particle length and rotation
          float length = a_instanceData.x;
          float angle = a_instanceData.y;
          
          vec2 rotated = vec2(
            a_position.x * cos(angle) - a_position.y * sin(angle),
            a_position.x * sin(angle) + a_position.y * cos(angle)
          );
          
          // Scale by length
          rotated.y *= length;
          
          // Apply instance position
          vec2 worldPos = a_instancePosition.xy + rotated;
          
          // Convert to clip space
          vec2 clipSpace = (worldPos / u_resolution) * 2.0 - 1.0;
          clipSpace.y *= -1.0; // Flip Y axis
          
          // Apply depth based on layer for proper sorting
          float depth = 1.0 - (v_layer * 0.3);
          
          gl_Position = vec4(clipSpace, depth, 1.0);
        }`;
        
      case 'snow':
        return `#version 300 es
        precision highp float;
        
        // Per-vertex attributes (quad corners)
        in vec2 a_position;
        
        // Per-instance attributes
        in vec3 a_instancePosition; // x, y, layer
        in vec4 a_instanceData;     // size, rotation, alpha, wobble
        
        // Uniforms
        uniform vec2 u_resolution;
        uniform float u_time;
        
        // Outputs
        out float v_alpha;
        out vec2 v_uv;
        out float v_sparkle;
        
        void main() {
          v_alpha = a_instanceData.z;
          v_uv = a_position * 0.5 + 0.5;
          v_sparkle = fract(a_instanceData.w + u_time * 0.1);
          
          // Apply rotation
          float rotation = a_instanceData.y;
          vec2 rotated = vec2(
            a_position.x * cos(rotation) - a_position.y * sin(rotation),
            a_position.x * sin(rotation) + a_position.y * cos(rotation)
          );
          
          // Apply size
          float size = a_instanceData.x;
          rotated *= size;
          
          // Apply wobble offset
          float wobble = a_instanceData.w;
          rotated.x += sin(wobble + u_time) * size * 0.3;
          
          // Apply instance position
          vec2 worldPos = a_instancePosition.xy + rotated;
          
          // Convert to clip space
          vec2 clipSpace = (worldPos / u_resolution) * 2.0 - 1.0;
          clipSpace.y *= -1.0;
          
          float depth = 1.0 - (a_instancePosition.z * 0.3);
          gl_Position = vec4(clipSpace, depth, 1.0);
        }`;
        
      case 'fog':
        return `#version 300 es
        precision highp float;
        
        in vec2 a_position;
        
        uniform vec2 u_resolution;
        uniform vec2 u_offset;
        uniform float u_scale;
        
        out vec2 v_texCoord;
        
        void main() {
          v_texCoord = a_position * 0.5 + 0.5;
          
          vec2 worldPos = (a_position * u_scale * vec2(u_resolution.x, u_resolution.y)) + u_offset;
          vec2 clipSpace = (worldPos / u_resolution) * 2.0 - 1.0;
          clipSpace.y *= -1.0;
          
          gl_Position = vec4(clipSpace, 0.5, 1.0);
        }`;
        
      case 'lightning':
        return `#version 300 es
        precision highp float;
        
        in vec2 a_position;
        
        uniform vec2 u_resolution;
        uniform vec2 u_start;
        uniform vec2 u_end;
        uniform float u_thickness;
        
        out float v_glow;
        
        void main() {
          vec2 dir = normalize(u_end - u_start);
          vec2 perp = vec2(-dir.y, dir.x);
          
          vec2 worldPos = mix(u_start, u_end, a_position.x);
          worldPos += perp * (a_position.y - 0.5) * u_thickness;
          
          vec2 clipSpace = (worldPos / u_resolution) * 2.0 - 1.0;
          clipSpace.y *= -1.0;
          
          v_glow = 1.0 - abs(a_position.y - 0.5) * 2.0;
          
          gl_Position = vec4(clipSpace, 0.1, 1.0);
        }`;
        
      case 'sunbeam':
        return `#version 300 es
        precision highp float;
        
        in vec2 a_position;
        
        uniform vec2 u_resolution;
        uniform vec2 u_origin;
        uniform float u_angle;
        uniform float u_spread;
        
        out vec2 v_uv;
        out float v_rayIntensity;
        
        void main() {
          v_uv = a_position * 0.5 + 0.5;
          
          // Create angled beam
          float beamAngle = u_angle + (a_position.x - 0.5) * u_spread;
          vec2 dir = vec2(sin(beamAngle), -cos(beamAngle));
          
          vec2 worldPos = u_origin + dir * (a_position.y + 1.0) * u_resolution.y * 0.5;
          worldPos.x += a_position.x * 200.0;
          
          vec2 clipSpace = (worldPos / u_resolution) * 2.0 - 1.0;
          clipSpace.y *= -1.0;
          
          v_rayIntensity = 1.0 - abs(a_position.x) * 0.7;
          
          gl_Position = vec4(clipSpace, 0.8, 1.0);
        }`;
        
      case 'fullscreen':
        return `#version 300 es
        precision highp float;
        
        in vec2 a_position;
        
        out vec2 v_texCoord;
        
        void main() {
          v_texCoord = a_position * 0.5 + 0.5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }`;
        
      default:
        return '';
    }
  }
  
  /**
   * Get fragment shader source
   */
  getFragmentShader(type) {
    switch (type) {
      case 'rain':
        return `#version 300 es
        precision highp float;
        
        in float v_alpha;
        in float v_layer;
        
        out vec4 fragColor;
        
        void main() {
          // Rain color: light blue-grey
          vec3 color = vec3(0.63, 0.77, 0.91); // #a0c4e8
          
          // Premultiply alpha
          fragColor = vec4(color * v_alpha, v_alpha);
        }`;
        
      case 'snow':
        return `#version 300 es
        precision highp float;
        
        in float v_alpha;
        in vec2 v_uv;
        in float v_sparkle;
        
        out vec4 fragColor;
        
        void main() {
          // Circular snowflake
          float dist = length(v_uv - 0.5) * 2.0;
          float circle = smoothstep(1.0, 0.8, dist);
          
          // Add sparkle
          float sparkle = step(0.95, v_sparkle) * circle * 0.5;
          
          vec3 color = vec3(1.0) + sparkle;
          float alpha = circle * v_alpha;
          
          // Premultiply alpha
          fragColor = vec4(color * alpha, alpha);
        }`;
        
      case 'fog':
        return `#version 300 es
        precision highp float;
        
        in vec2 v_texCoord;
        
        uniform sampler2D u_noiseTexture;
        uniform float u_time;
        uniform float u_alpha;
        uniform vec2 u_scroll;
        
        out vec4 fragColor;
        
        void main() {
          // Multi-octave noise
          vec2 uv1 = v_texCoord + u_scroll * 0.1 + vec2(u_time * 0.01, 0.0);
          vec2 uv2 = v_texCoord * 2.0 + u_scroll * 0.15 + vec2(0.0, u_time * 0.015);
          
          float noise1 = texture(u_noiseTexture, uv1).r;
          float noise2 = texture(u_noiseTexture, uv2).r * 0.5;
          
          float fog = (noise1 + noise2) * 0.7;
          
          // Fog color: soft grey-blue
          vec3 color = vec3(0.75, 0.76, 0.8);
          float alpha = fog * u_alpha;
          
          // Standard alpha blending for fog
          fragColor = vec4(color * alpha, alpha);
        }`;
        
      case 'lightning':
        return `#version 300 es
        precision highp float;
        
        in float v_glow;
        
        uniform vec3 u_color;
        uniform float u_intensity;
        
        out vec4 fragColor;
        
        void main() {
          // Additive glow for lightning
          float glow = pow(v_glow, 2.0) * u_intensity;
          vec3 color = u_color * glow;
          
          // Additive blending: pre-multiply with full alpha
          fragColor = vec4(color, glow);
        }`;
        
      case 'sunbeam':
        return `#version 300 es
        precision highp float;
        
        in vec2 v_uv;
        in float v_rayIntensity;
        
        uniform float u_intensity;
        
        out vec4 fragColor;
        
        void main() {
          // Warm sunbeam color
          vec3 color = vec3(1.0, 0.92, 0.75);
          
          // Vertical gradient
          float gradient = 1.0 - v_uv.y;
          float intensity = v_rayIntensity * gradient * u_intensity * 0.15;
          
          // Additive blending
          fragColor = vec4(color * intensity, intensity);
        }`;
        
      case 'bloomDown':
        return `#version 300 es
        precision highp float;
        
        in vec2 v_texCoord;
        
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_threshold;
        
        out vec4 fragColor;
        
        void main() {
          vec2 texelSize = 1.0 / u_resolution;
          
          // Dual Kawase blur - downsample with 4-tap
          vec4 color = vec4(0.0);
          color += texture(u_texture, v_texCoord + vec2(-1.0, -1.0) * texelSize);
          color += texture(u_texture, v_texCoord + vec2( 1.0, -1.0) * texelSize);
          color += texture(u_texture, v_texCoord + vec2(-1.0,  1.0) * texelSize);
          color += texture(u_texture, v_texCoord + vec2( 1.0,  1.0) * texelSize);
          color *= 0.25;
          
          // Apply threshold
          float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
          float soft = max(0.0, brightness - u_threshold);
          soft = soft * soft / (2.0 * max(0.001, brightness - u_threshold) + soft);
          
          color.rgb *= max(soft, 0.0) / max(brightness, 0.001);
          
          fragColor = color;
        }`;
        
      case 'bloomUp':
        return `#version 300 es
        precision highp float;
        
        in vec2 v_texCoord;
        
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_radius;
        
        out vec4 fragColor;
        
        void main() {
          vec2 texelSize = 1.0 / u_resolution * u_radius;
          
          // Dual Kawase blur - upsample with 9-tap
          vec4 color = vec4(0.0);
          
          // Center
          color += texture(u_texture, v_texCoord) * 4.0;
          
          // Corners
          color += texture(u_texture, v_texCoord + vec2(-1.0, -1.0) * texelSize);
          color += texture(u_texture, v_texCoord + vec2( 1.0, -1.0) * texelSize);
          color += texture(u_texture, v_texCoord + vec2(-1.0,  1.0) * texelSize);
          color += texture(u_texture, v_texCoord + vec2( 1.0,  1.0) * texelSize);
          
          // Edges
          color += texture(u_texture, v_texCoord + vec2( 0.0, -1.0) * texelSize) * 2.0;
          color += texture(u_texture, v_texCoord + vec2(-1.0,  0.0) * texelSize) * 2.0;
          color += texture(u_texture, v_texCoord + vec2( 1.0,  0.0) * texelSize) * 2.0;
          color += texture(u_texture, v_texCoord + vec2( 0.0,  1.0) * texelSize) * 2.0;
          
          fragColor = color / 16.0;
        }`;
        
      case 'composite':
        return `#version 300 es
        precision highp float;
        
        in vec2 v_texCoord;
        
        uniform sampler2D u_sceneTexture;
        uniform sampler2D u_bloomTexture;
        uniform sampler2D u_lutTexture;
        
        uniform float u_bloomStrength;
        uniform float u_chromaticAberration;
        uniform bool u_useLUT;
        
        out vec4 fragColor;
        
        // LUT lookup helper
        vec3 applyLUT(vec3 color, sampler2D lut) {
          // 3D LUT lookup (assuming 32x32x32 LUT stored as 32x1024 texture)
          float lutSize = 32.0;
          float scale = (lutSize - 1.0) / lutSize;
          float offset = 1.0 / (2.0 * lutSize);
          
          color = clamp(color, 0.0, 1.0);
          
          float blueSlice = color.b * (lutSize - 1.0);
          float blueSliceLower = floor(blueSlice);
          float blueSliceUpper = ceil(blueSlice);
          float blueBlend = blueSlice - blueSliceLower;
          
          vec2 uvLower = vec2(
            (color.r * scale + offset + blueSliceLower) / lutSize,
            color.g * scale + offset
          );
          
          vec2 uvUpper = vec2(
            (color.r * scale + offset + blueSliceUpper) / lutSize,
            color.g * scale + offset
          );
          
          vec3 colorLower = texture(lut, uvLower).rgb;
          vec3 colorUpper = texture(lut, uvUpper).rgb;
          
          return mix(colorLower, colorUpper, blueBlend);
        }
        
        void main() {
          vec2 uv = v_texCoord;
          
          // Chromatic aberration
          vec3 color;
          if (u_chromaticAberration > 0.0) {
            vec2 offset = (uv - 0.5) * u_chromaticAberration * 0.01;
            color.r = texture(u_sceneTexture, uv + offset).r;
            color.g = texture(u_sceneTexture, uv).g;
            color.b = texture(u_sceneTexture, uv - offset).b;
          } else {
            color = texture(u_sceneTexture, uv).rgb;
          }
          
          // Add bloom
          vec3 bloom = texture(u_bloomTexture, uv).rgb;
          color += bloom * u_bloomStrength;
          
          // Apply LUT
          if (u_useLUT) {
            color = applyLUT(color, u_lutTexture);
          }
          
          // Get alpha from scene
          float alpha = texture(u_sceneTexture, uv).a;
          
          // Premultiply alpha for final output
          fragColor = vec4(color * alpha, alpha);
        }`;
        
      default:
        return '';
    }
  }
  
  /**
   * Create geometry buffers
   */
  createBuffers() {
    const gl = this.gl;
    
    // Fullscreen quad for post-processing
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ]);
    
    this.buffers.fullscreenQuad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.fullscreenQuad);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    
    // Rain particle geometry (line segment)
    const rainVertices = new Float32Array([
      0, 0,
      0, 1
    ]);
    
    this.buffers.rainGeometry = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.rainGeometry);
    gl.bufferData(gl.ARRAY_BUFFER, rainVertices, gl.STATIC_DRAW);
    
    // Snow particle geometry (quad)
    const snowVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ]);
    
    this.buffers.snowGeometry = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.snowGeometry);
    gl.bufferData(gl.ARRAY_BUFFER, snowVertices, gl.STATIC_DRAW);
    
    // Create instance buffers (will be filled dynamically)
    this.buffers.rainInstances = {
      position: gl.createBuffer(),
      data: gl.createBuffer()
    };
    
    this.buffers.snowInstances = {
      position: gl.createBuffer(),
      data: gl.createBuffer()
    };
  }
  
  /**
   * Create framebuffers for post-processing
   */
  createFramebuffers() {
    const gl = this.gl;
    
    // Main scene framebuffer
    this.framebuffers.scene = this.createFramebuffer('scene');
    
    // Bloom chain (3 levels for dual Kawase)
    this.framebuffers.bloom = [
      this.createFramebuffer('bloom0'),
      this.createFramebuffer('bloom1'),
      this.createFramebuffer('bloom2')
    ];
    
    // Create noise texture for fog
    this.createNoiseTexture();
  }
  
  /**
   * Create a procedural noise texture
   */
  createNoiseTexture() {
    const gl = this.gl;
    const size = 256;
    const data = new Uint8Array(size * size);
    
    // Generate simple noise
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 255;
    }
    
    this.textures.noise = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.textures.noise);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, size, size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    
    console.log('✅ Noise texture created');
  }
  
  /**
   * Create a framebuffer with color and depth attachments
   */
  createFramebuffer(name) {
    const gl = this.gl;
    
    const fbo = gl.createFramebuffer();
    const colorTexture = gl.createTexture();
    const depthBuffer = gl.createRenderbuffer();
    
    // Create color texture
    gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // Create depth buffer
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 1, 1);
    
    // Attach to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
    
    // Check framebuffer status
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error(`Framebuffer ${name} incomplete:`, status);
    }
    
    // Unbind
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    return {
      fbo,
      colorTexture,
      depthBuffer,
      width: 1,
      height: 1
    };
  }
  
  /**
   * Resize framebuffer
   */
  resizeFramebuffer(fb, width, height) {
    const gl = this.gl;
    
    fb.width = width;
    fb.height = height;
    
    // Resize color texture
    gl.bindTexture(gl.TEXTURE_2D, fb.colorTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    
    // Resize depth buffer
    gl.bindRenderbuffer(gl.RENDERBUFFER, fb.depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
  }
  
  /**
   * Resize canvas and framebuffers
   */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.options.maxDPR);
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;
    
    const width = Math.floor(displayWidth * dpr);
    const height = Math.floor(displayHeight * dpr);
    
    // Resize canvas
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.style.width = `${displayWidth}px`;
      this.canvas.style.height = `${displayHeight}px`;
      
      // Resize framebuffers
      this.resizeFramebuffer(this.framebuffers.scene, width, height);
      
      // Resize bloom chain (each level is half the previous)
      let bloomWidth = Math.floor(width / 2);
      let bloomHeight = Math.floor(height / 2);
      this.framebuffers.bloom.forEach(fb => {
        this.resizeFramebuffer(fb, bloomWidth, bloomHeight);
        bloomWidth = Math.floor(bloomWidth / 2);
        bloomHeight = Math.floor(bloomHeight / 2);
      });
      
      // Update viewport
      if (this.gl) {
        this.gl.viewport(0, 0, width, height);
      }
      
      console.log(`Canvas resized: ${width}x${height} (DPR: ${dpr.toFixed(2)})`);
    }
  }
  
  /**
   * Clear canvas with transparent black
   */
  clearTransparent() {
    const gl = this.gl;
    if (!gl) return;
    
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
  
  /**
   * Verify initial transparency by reading back first pixel
   */
  verifyTransparency() {
    const gl = this.gl;
    if (!gl) return;
    
    const pixels = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    
    const isTransparent = pixels[0] === 0 && pixels[1] === 0 && pixels[2] === 0 && pixels[3] === 0;
    
    if (isTransparent) {
      console.log('✅ Initial transparency verified: RGBA = [0, 0, 0, 0]');
    } else {
      console.warn(`⚠️ Initial transparency check failed: RGBA = [${pixels[0]}, ${pixels[1]}, ${pixels[2]}, ${pixels[3]}]`);
    }
    
    return isTransparent;
  }
  
  /**
   * Start animation loop
   */
  start() {
    if (this.animationId) {
      console.warn('Renderer already running');
      return;
    }
    
    this.lastFrameTime = performance.now();
    this.animate();
    
    console.log('✅ Renderer started');
  }
  
  /**
   * Stop animation loop
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
      console.log('Renderer stopped');
    }
  }
  
  /**
   * Main animation loop
   */
  animate(currentTime = 0) {
    this.animationId = requestAnimationFrame((t) => this.animate(t));
    
    // Calculate delta time
    this.deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;
    
    // Update FPS
    this.metrics.fps = this.deltaTime > 0 ? Math.round(1000 / this.deltaTime) : 0;
    this.metrics.frameTime = this.deltaTime;
    
    // Update particles
    this.updateParticles(this.deltaTime);
    
    // Render
    this.render(currentTime);
  }
  
  /**
   * Update all particle systems
   */
  updateParticles(deltaTime) {
    const speed = deltaTime / 16.67; // Normalize to 60fps
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    // Update rain particles
    this.particleSystems.rain.particles.forEach(p => {
      p.y += p.speed * speed;
      p.x += Math.sin(p.angle) * p.speed * 0.1 * speed;
      
      // Wrap around when out of bounds
      if (p.y > h + 50) {
        p.y = -50;
        p.x = Math.random() * w;
      }
      if (p.x < -50) p.x = w + 50;
      if (p.x > w + 50) p.x = -50;
    });
    
    // Update snow particles
    this.particleSystems.snow.particles.forEach(p => {
      const speedY = 1 + (1 - p.layer) * 2; // Closer = faster
      p.y += speedY * speed;
      
      // Update wobble animation
      p.wobble += 0.03 * speed;
      p.x += Math.sin(p.wobble) * 0.8 * speed;
      p.rotation += 0.02 * speed;
      
      // Wrap around
      if (p.y > h + 50) {
        p.y = -50;
        p.x = Math.random() * w;
      }
      if (p.x < -50) p.x = w + 50;
      if (p.x > w + 50) p.x = -50;
    });
    
    // Update fog layers
    this.particleSystems.fog.quads.forEach(q => {
      q.scrollX += 0.5 * speed * 0.01;
      q.scrollY += 0.3 * speed * 0.01;
    });
    
    // Count total particles
    this.metrics.particleCount = 
      this.particleSystems.rain.particles.length +
      this.particleSystems.snow.particles.length +
      this.particleSystems.fog.quads.length;
  }
  
  /**
   * Main render function
   */
  render(time) {
    const gl = this.gl;
    if (!gl) return;
    
    this.metrics.drawCalls = 0;
    
    // Render scene to framebuffer
    this.renderScene(time);
    
    // Apply bloom if any glowing effects are active
    const bloomStrength = this.getBloomStrength();
    if (bloomStrength > 0) {
      this.renderBloom();
    }
    
    // Composite to screen
    this.renderComposite(bloomStrength);
  }
  
  /**
   * Render main scene to framebuffer
   */
  renderScene(time) {
    const gl = this.gl;
    
    // Bind scene framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.scene.fbo);
    gl.viewport(0, 0, this.framebuffers.scene.width, this.framebuffers.scene.height);
    
    // Clear with transparent black
    this.clearTransparent();
    
    // Render effects in order (back to front for proper alpha blending)
    if (this.activeEffects.has('fog')) {
      this.renderFog(time);
    }
    
    if (this.activeEffects.has('sunbeam')) {
      this.renderSunbeams(time);
    }
    
    if (this.activeEffects.has('rain') || this.activeEffects.has('storm')) {
      this.renderRain(time);
    }
    
    if (this.activeEffects.has('snow')) {
      this.renderSnow(time);
    }
    
    if (this.activeEffects.has('lightning') || this.activeEffects.has('storm')) {
      this.renderLightning(time);
    }
  }
  
  /**
   * Render rain particles with instancing
   */
  renderRain(time) {
    const gl = this.gl;
    const program = this.programs.rain;
    if (!program) return;
    
    const particles = this.particleSystems.rain.particles;
    if (particles.length === 0) return;
    
    gl.useProgram(program);
    
    // Set uniforms
    gl.uniform2f(program.uniforms.u_resolution, window.innerWidth, window.innerHeight);
    gl.uniform1f(program.uniforms.u_time, time * 0.001);
    
    // Prepare instance data
    const instancePositions = new Float32Array(particles.length * 3);
    const instanceData = new Float32Array(particles.length * 4);
    
    particles.forEach((p, i) => {
      const i3 = i * 3;
      const i4 = i * 4;
      
      // Position (x, y, layer)
      instancePositions[i3] = p.x;
      instancePositions[i3 + 1] = p.y;
      instancePositions[i3 + 2] = p.layer;
      
      // Data (length, angle, alpha, speed)
      instanceData[i4] = p.length;
      instanceData[i4 + 1] = p.angle;
      instanceData[i4 + 2] = p.alpha;
      instanceData[i4 + 3] = p.speed;
    });
    
    // Upload instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.rainInstances.position);
    gl.bufferData(gl.ARRAY_BUFFER, instancePositions, gl.DYNAMIC_DRAW);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.rainInstances.data);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);
    
    // Setup geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.rainGeometry);
    const posLoc = program.attributes.a_position;
    if (posLoc !== undefined && posLoc !== -1) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }
    
    // Setup instance position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.rainInstances.position);
    const instPosLoc = program.attributes.a_instancePosition;
    if (instPosLoc !== undefined && instPosLoc !== -1) {
      gl.enableVertexAttribArray(instPosLoc);
      gl.vertexAttribPointer(instPosLoc, 3, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(instPosLoc, 1);
    }
    
    // Setup instance data attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.rainInstances.data);
    const instDataLoc = program.attributes.a_instanceData;
    if (instDataLoc !== undefined && instDataLoc !== -1) {
      gl.enableVertexAttribArray(instDataLoc);
      gl.vertexAttribPointer(instDataLoc, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(instDataLoc, 1);
    }
    
    // Draw instanced
    gl.drawArraysInstanced(gl.LINES, 0, 2, particles.length);
    
    // Clean up divisors
    if (instPosLoc !== undefined && instPosLoc !== -1) {
      gl.vertexAttribDivisor(instPosLoc, 0);
    }
    if (instDataLoc !== undefined && instDataLoc !== -1) {
      gl.vertexAttribDivisor(instDataLoc, 0);
    }
    
    this.metrics.drawCalls++;
  }
  
  /**
   * Render snow particles with instancing
   */
  renderSnow(time) {
    const gl = this.gl;
    const program = this.programs.snow;
    if (!program) return;
    
    const particles = this.particleSystems.snow.particles;
    if (particles.length === 0) return;
    
    gl.useProgram(program);
    
    // Set uniforms
    gl.uniform2f(program.uniforms.u_resolution, window.innerWidth, window.innerHeight);
    gl.uniform1f(program.uniforms.u_time, time * 0.001);
    
    // Prepare instance data
    const instancePositions = new Float32Array(particles.length * 3);
    const instanceData = new Float32Array(particles.length * 4);
    
    particles.forEach((p, i) => {
      const i3 = i * 3;
      const i4 = i * 4;
      
      // Position (x, y, layer)
      instancePositions[i3] = p.x;
      instancePositions[i3 + 1] = p.y;
      instancePositions[i3 + 2] = p.layer;
      
      // Data (size, rotation, alpha, wobble)
      instanceData[i4] = p.size;
      instanceData[i4 + 1] = p.rotation;
      instanceData[i4 + 2] = p.alpha;
      instanceData[i4 + 3] = p.wobble;
    });
    
    // Upload instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.snowInstances.position);
    gl.bufferData(gl.ARRAY_BUFFER, instancePositions, gl.DYNAMIC_DRAW);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.snowInstances.data);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);
    
    // Setup geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.snowGeometry);
    const posLoc = program.attributes.a_position;
    if (posLoc !== undefined && posLoc !== -1) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }
    
    // Setup instance position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.snowInstances.position);
    const instPosLoc = program.attributes.a_instancePosition;
    if (instPosLoc !== undefined && instPosLoc !== -1) {
      gl.enableVertexAttribArray(instPosLoc);
      gl.vertexAttribPointer(instPosLoc, 3, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(instPosLoc, 1);
    }
    
    // Setup instance data attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.snowInstances.data);
    const instDataLoc = program.attributes.a_instanceData;
    if (instDataLoc !== undefined && instDataLoc !== -1) {
      gl.enableVertexAttribArray(instDataLoc);
      gl.vertexAttribPointer(instDataLoc, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(instDataLoc, 1);
    }
    
    // Draw instanced
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, particles.length);
    
    // Clean up divisors
    if (instPosLoc !== undefined && instPosLoc !== -1) {
      gl.vertexAttribDivisor(instPosLoc, 0);
    }
    if (instDataLoc !== undefined && instDataLoc !== -1) {
      gl.vertexAttribDivisor(instDataLoc, 0);
    }
    
    this.metrics.drawCalls++;
  }
  
  /**
   * Render fog layers
   */
  renderFog(time) {
    const gl = this.gl;
    const program = this.programs.fog;
    if (!program) return;
    
    const quads = this.particleSystems.fog.quads;
    if (quads.length === 0) return;
    
    gl.useProgram(program);
    
    // Set common uniforms
    gl.uniform2f(program.uniforms.u_resolution, window.innerWidth, window.innerHeight);
    gl.uniform1f(program.uniforms.u_time, time * 0.001);
    
    // Bind noise texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.noise);
    gl.uniform1i(program.uniforms.u_noiseTexture, 0);
    
    // Setup fullscreen quad geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.fullscreenQuad);
    const posLoc = program.attributes.a_position;
    
    if (posLoc !== undefined && posLoc !== -1) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }
    
    // Draw each fog layer
    quads.forEach(q => {
      gl.uniform2f(program.uniforms.u_offset, 0, 0);
      gl.uniform1f(program.uniforms.u_scale, q.scale);
      gl.uniform1f(program.uniforms.u_alpha, q.alpha);
      gl.uniform2f(program.uniforms.u_scroll, q.scrollX, q.scrollY);
      
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.metrics.drawCalls++;
    });
  }
  
  /**
   * Render lightning bolts
   */
  renderLightning(time) {
    const gl = this.gl;
    const program = this.programs.lightning;
    if (!program) return;
    
    // Check if we should show lightning (random chance or storm active)
    const shouldShowLightning = this.activeEffects.has('storm') && Math.random() > 0.98;
    
    if (!shouldShowLightning && !this.lastLightningTime) return;
    
    // Track lightning timing
    if (!this.lastLightningTime) {
      this.lastLightningTime = time;
      this.lightningDuration = 150 + Math.random() * 200; // 150-350ms
    }
    
    const elapsed = time - this.lastLightningTime;
    if (elapsed > this.lightningDuration) {
      this.lastLightningTime = null;
      return;
    }
    
    gl.useProgram(program);
    
    // Lightning parameters
    const w = window.innerWidth;
    const h = window.innerHeight;
    const startX = Math.random() * w;
    const startY = 0;
    const endX = startX + (Math.random() - 0.5) * 300;
    const endY = h * (0.3 + Math.random() * 0.4);
    
    gl.uniform2f(program.uniforms.u_resolution, w, h);
    gl.uniform2f(program.uniforms.u_start, startX, startY);
    gl.uniform2f(program.uniforms.u_end, endX, endY);
    gl.uniform1f(program.uniforms.u_thickness, 20 + Math.random() * 30);
    gl.uniform3f(program.uniforms.u_color, 0.9, 0.95, 1.0); // Bright blue-white
    gl.uniform1f(program.uniforms.u_intensity, 1.0 - (elapsed / this.lightningDuration));
    
    // Setup geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.fullscreenQuad);
    const posLoc = program.attributes.a_position;
    if (posLoc !== undefined && posLoc !== -1) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }
    
    // Use additive blending for glow
    gl.blendFunc(gl.ONE, gl.ONE);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // Restore premultiplied alpha blending
    gl.blendFuncSeparate(
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA
    );
    
    this.metrics.drawCalls++;
  }
  
  /**
   * Render sunbeams
   */
  renderSunbeams(time) {
    const gl = this.gl;
    const program = this.programs.sunbeam;
    if (!program) return;
    
    gl.useProgram(program);
    
    // Sunbeam parameters
    const w = window.innerWidth;
    const h = window.innerHeight;
    const originX = w * (0.3 + Math.sin(time * 0.0001) * 0.2); // Slowly moving
    const originY = -h * 0.2; // Above screen
    
    gl.uniform2f(program.uniforms.u_resolution, w, h);
    gl.uniform2f(program.uniforms.u_origin, originX, originY);
    gl.uniform1f(program.uniforms.u_angle, Math.PI * 0.4); // Angled from top
    gl.uniform1f(program.uniforms.u_spread, Math.PI * 0.3); // Beam spread
    gl.uniform1f(program.uniforms.u_intensity, 0.6);
    
    // Setup geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.fullscreenQuad);
    const posLoc = program.attributes.a_position;
    if (posLoc !== undefined && posLoc !== -1) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }
    
    // Use additive blending for glow
    gl.blendFunc(gl.ONE, gl.ONE);
    
    // Draw multiple beams
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * 0.15;
      gl.uniform1f(program.uniforms.u_angle, Math.PI * (0.4 + offset));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.metrics.drawCalls++;
    }
    
    // Restore premultiplied alpha blending
    gl.blendFuncSeparate(
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA
    );
  }
  
  /**
   * Apply dual Kawase bloom
   */
  renderBloom() {
    const gl = this.gl;
    
    // Downsample chain
    const threshold = 0.8;
    
    // First pass: downsample from scene with threshold
    this.applyBloomPass(
      this.framebuffers.scene.colorTexture,
      this.framebuffers.bloom[0],
      'down',
      threshold,
      1.0
    );
    
    // Downsample to smaller levels
    for (let i = 1; i < this.framebuffers.bloom.length; i++) {
      this.applyBloomPass(
        this.framebuffers.bloom[i - 1].colorTexture,
        this.framebuffers.bloom[i],
        'down',
        0.0,
        1.0
      );
    }
    
    // Upsample chain (additive)
    for (let i = this.framebuffers.bloom.length - 2; i >= 0; i--) {
      this.applyBloomPass(
        this.framebuffers.bloom[i + 1].colorTexture,
        this.framebuffers.bloom[i],
        'up',
        0.0,
        1.0 + (i * 0.3) // Increase radius as we go up
      );
    }
    
    this.metrics.drawCalls += this.framebuffers.bloom.length * 2;
  }
  
  /**
   * Apply a bloom pass (down or up)
   */
  applyBloomPass(sourceTexture, targetFB, direction, threshold, radius) {
    const gl = this.gl;
    const program = direction === 'down' ? this.programs.bloomDown : this.programs.bloomUp;
    
    if (!program) return;
    
    // Bind target framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFB.fbo);
    gl.viewport(0, 0, targetFB.width, targetFB.height);
    
    // Use program
    gl.useProgram(program);
    
    // Bind source texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(program.uniforms.u_texture, 0);
    
    // Set uniforms
    gl.uniform2f(program.uniforms.u_resolution, targetFB.width, targetFB.height);
    
    if (direction === 'down' && program.uniforms.u_threshold) {
      gl.uniform1f(program.uniforms.u_threshold, threshold);
    }
    
    if (direction === 'up' && program.uniforms.u_radius) {
      gl.uniform1f(program.uniforms.u_radius, radius);
    }
    
    // Draw fullscreen quad
    this.drawFullscreenQuad(program);
  }
  
  /**
   * Composite final frame to screen
   */
  renderComposite(bloomStrength) {
    const gl = this.gl;
    const program = this.programs.composite;
    
    if (!program) return;
    
    // Render to default framebuffer (screen)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    
    // Clear
    this.clearTransparent();
    
    // Use composite program
    gl.useProgram(program);
    
    // Bind scene texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.framebuffers.scene.colorTexture);
    gl.uniform1i(program.uniforms.u_sceneTexture, 0);
    
    // Bind bloom texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.framebuffers.bloom[0].colorTexture);
    gl.uniform1i(program.uniforms.u_bloomTexture, 1);
    
    // Set uniforms
    gl.uniform1f(program.uniforms.u_bloomStrength, bloomStrength);
    gl.uniform1f(program.uniforms.u_chromaticAberration, 0.0); // TODO: Make configurable
    gl.uniform1i(program.uniforms.u_useLUT, 0); // TODO: Implement LUT support
    
    // Draw fullscreen quad
    this.drawFullscreenQuad(program);
    
    this.metrics.drawCalls++;
  }
  
  /**
   * Draw a fullscreen quad
   */
  drawFullscreenQuad(program) {
    const gl = this.gl;
    
    // Bind fullscreen quad buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.fullscreenQuad);
    
    // Setup position attribute
    const posLoc = program.attributes.a_position;
    if (posLoc !== undefined && posLoc !== -1) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }
    
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  
  /**
   * Get bloom strength based on active effects
   */
  getBloomStrength() {
    let strength = 0;
    
    if (this.activeEffects.has('storm') || this.activeEffects.has('lightning')) {
      strength = Math.max(strength, 1.5);
    }
    
    if (this.activeEffects.has('sunbeam')) {
      strength = Math.max(strength, 0.8);
    }
    
    return strength;
  }
  
  /**
   * Start an effect
   */
  startEffect(effect, options = {}) {
    console.log(`Starting effect: ${effect}`, options);
    
    this.activeEffects.add(effect);
    
    // Initialize particles for the effect
    switch (effect) {
      case 'rain':
        this.initRainParticles(options.intensity || 0.5);
        break;
      case 'snow':
        this.initSnowParticles(options.intensity || 0.5);
        break;
      case 'storm':
        this.activeEffects.add('rain');
        this.activeEffects.add('lightning');
        this.initRainParticles(options.intensity || 0.7);
        break;
      case 'fog':
        this.initFogLayers(options.intensity || 0.5);
        break;
      case 'sunbeam':
        // No particles needed, just shader effect
        break;
    }
  }
  
  /**
   * Stop an effect
   */
  stopEffect(effect) {
    console.log(`Stopping effect: ${effect}`);
    
    this.activeEffects.delete(effect);
    
    // Clear particles for the effect
    switch (effect) {
      case 'rain':
        this.particleSystems.rain.particles = [];
        break;
      case 'snow':
        this.particleSystems.snow.particles = [];
        break;
      case 'storm':
        this.activeEffects.delete('rain');
        this.activeEffects.delete('lightning');
        this.particleSystems.rain.particles = [];
        break;
      case 'fog':
        this.particleSystems.fog.quads = [];
        break;
    }
  }
  
  /**
   * Stop all effects
   */
  stopAllEffects() {
    console.log('Stopping all effects');
    
    this.activeEffects.clear();
    this.particleSystems.rain.particles = [];
    this.particleSystems.snow.particles = [];
    this.particleSystems.fog.quads = [];
  }
  
  /**
   * Initialize rain particles
   */
  initRainParticles(intensity) {
    const count = Math.floor(this.particleSystems.rain.maxCount * intensity);
    const particles = [];
    
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        layer: Math.random(), // 0-1 for depth sorting
        length: 15 + Math.random() * 25,
        angle: Math.PI / 2 + (Math.random() - 0.5) * 0.2,
        alpha: 0.4 + Math.random() * 0.4,
        speed: 15 + Math.random() * 15
      });
    }
    
    this.particleSystems.rain.particles = particles;
    console.log(`Initialized ${count} rain particles`);
  }
  
  /**
   * Initialize snow particles
   */
  initSnowParticles(intensity) {
    const count = Math.floor(this.particleSystems.snow.maxCount * intensity);
    const particles = [];
    
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        layer: Math.random(),
        size: 2 + Math.random() * 5,
        rotation: Math.random() * Math.PI * 2,
        alpha: 0.5 + Math.random() * 0.5,
        wobble: Math.random() * Math.PI * 2
      });
    }
    
    this.particleSystems.snow.particles = particles;
    console.log(`Initialized ${count} snow particles`);
  }
  
  /**
   * Initialize fog layers
   */
  initFogLayers(intensity) {
    const count = Math.min(3, Math.ceil(intensity * 3));
    const quads = [];
    
    for (let i = 0; i < count; i++) {
      quads.push({
        x: 0,
        y: 0,
        scale: 1 + i * 0.3,
        alpha: 0.2 * intensity,
        scrollX: Math.random() * 0.5,
        scrollY: Math.random() * 0.3
      });
    }
    
    this.particleSystems.fog.quads = quads;
    console.log(`Initialized ${count} fog layers`);
  }
  
  /**
   * Get debug info
   */
  getDebugInfo() {
    const gl = this.gl;
    if (!gl) return {};
    
    return {
      fps: this.metrics.fps,
      frameTime: this.metrics.frameTime.toFixed(2),
      particleCount: this.metrics.particleCount,
      drawCalls: this.metrics.drawCalls,
      activeEffects: Array.from(this.activeEffects),
      canvasSize: `${this.canvas.width}x${this.canvas.height}`,
      dpr: (this.canvas.width / window.innerWidth).toFixed(2),
      webglVersion: 'WebGL2',
      alpha: gl.getContextAttributes().alpha,
      premultipliedAlpha: gl.getContextAttributes().premultipliedAlpha
    };
  }
  
  /**
   * Destroy renderer and cleanup resources
   */
  destroy() {
    console.log('Destroying WebGL2 renderer...');
    
    // Stop animation
    this.stop();
    
    // Delete WebGL resources
    const gl = this.gl;
    if (gl) {
      // Delete programs
      Object.values(this.programs).forEach(program => {
        if (program) gl.deleteProgram(program);
      });
      
      // Delete buffers
      Object.values(this.buffers).forEach(buffer => {
        if (buffer && buffer.deleteBuffer) {
          gl.deleteBuffer(buffer);
        } else if (typeof buffer === 'object') {
          Object.values(buffer).forEach(b => {
            if (b) gl.deleteBuffer(b);
          });
        }
      });
      
      // Delete framebuffers
      if (this.framebuffers.scene) {
        gl.deleteFramebuffer(this.framebuffers.scene.fbo);
        gl.deleteTexture(this.framebuffers.scene.colorTexture);
        gl.deleteRenderbuffer(this.framebuffers.scene.depthBuffer);
      }
      
      this.framebuffers.bloom.forEach(fb => {
        gl.deleteFramebuffer(fb.fbo);
        gl.deleteTexture(fb.colorTexture);
        gl.deleteRenderbuffer(fb.depthBuffer);
      });
    }
    
    // Clear references
    this.gl = null;
    this.programs = {};
    this.buffers = {};
    this.textures = {};
    this.framebuffers = {};
    this.particleSystems = {};
    this.activeEffects.clear();
    
    console.log('✅ Renderer destroyed');
  }
}

// Export for use in overlay
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebGL2WeatherRenderer;
}
