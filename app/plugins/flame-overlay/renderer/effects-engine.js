/**
 * Enhanced WebGL Effects Engine v2.2.0
 * Supports multiple visual effects: flames, particles, energy waves, lightning
 * Features: Multi-layer flames, bloom post-processing, smoke effects, advanced animation
 * 
 * Based on modern WebGL rendering techniques and shader programming
 */

class EffectsEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        
        if (!this.canvas) {
            console.error('Canvas element not found:', canvasId);
            return;
        }
        
        this.gl = null;
        this.programs = {};
        this.currentProgram = null;
        this.textures = {};
        this.uniforms = {};
        this.buffers = {};
        this.startTime = Date.now();
        this.config = {};
        this.particles = [];
        this.lightningSegments = [];
        this.postProcessor = null;
        
        this.init();
    }
    
    init() {
        if (!this.canvas) {
            console.error('Cannot initialize: canvas is null');
            return;
        }
        
        this.gl = this.canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: true,
            preserveDrawingBuffer: false
        });
        
        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }
        
        this.loadConfig();
        this.setupAllShaders();
        this.setupGeometry();
        this.loadTextures();
        this.initPostProcessor();
        this.initParticles();
        this.render();
        this.setupSocketListener();
        
        window.addEventListener('resize', () => this.handleResize());
        this.handleResize();
    }
    
    async loadConfig() {
        try {
            const response = await fetch('/api/flame-overlay/config');
            const data = await response.json();
            if (data.success) {
                this.config = data.config;
                this.switchEffect(this.config.effectType || 'flames');
            }
        } catch (error) {
            console.error('Failed to load config:', error);
            this.config = {
                effectType: 'flames',
                resolutionPreset: 'tiktok-portrait',
                customWidth: 720,
                customHeight: 1280,
                frameMode: 'bottom',
                frameThickness: 150,
                flameColor: '#ff6600',
                flameSpeed: 0.5,
                flameIntensity: 1.3,
                flameBrightness: 0.25,
                enableGlow: true,
                enableAdditiveBlend: true,
                maskOnlyEdges: true,
                noiseOctaves: 8,
                useHighQualityTextures: false,
                detailScaleAuto: true,
                edgeFeather: 0.3,
                frameCurve: 0.0,
                frameNoiseAmount: 0.0,
                animationEasing: 'linear',
                pulseEnabled: false,
                pulseAmount: 0.2,
                pulseSpeed: 1.0,
                bloomEnabled: false,
                bloomIntensity: 0.8,
                bloomThreshold: 0.6,
                bloomRadius: 4,
                layersEnabled: false,
                layerCount: 3,
                layerParallax: 0.3,
                chromaticAberration: 0.005,
                filmGrain: 0.03,
                depthIntensity: 0.5,
                smokeEnabled: false,
                smokeIntensity: 0.4,
                smokeSpeed: 0.3,
                smokeColor: '#333333'
            };
            this.switchEffect('flames');
        }
    }
    
    setupSocketListener() {
        if (typeof io !== 'undefined') {
            try {
                const socket = io();
                
                socket.on('connect', () => {
                    console.log('Socket.io connected for config updates');
                });
                
                socket.on('connect_error', (error) => {
                    console.warn('Socket.io connection error:', error);
                });
                
                socket.on('flame-overlay:config-update', (data) => {
                    console.log('Config update received:', data);
                    const oldEffect = this.config.effectType;
                    this.config = data.config;
                    
                    if (oldEffect !== this.config.effectType) {
                        this.switchEffect(this.config.effectType);
                    }
                    
                    this.updateUniforms();
                    
                    // Resize post-processor if bloom settings changed
                    if (this.postProcessor && this.config.bloomEnabled) {
                        this.postProcessor.resize(this.canvas.width, this.canvas.height);
                    }
                });
            } catch (error) {
                console.error('Failed to setup socket listener:', error);
            }
        } else {
            console.warn('Socket.io not available - config updates disabled');
        }
    }
    
    initPostProcessor() {
        if (typeof PostProcessor !== 'undefined') {
            this.postProcessor = new PostProcessor(this.gl);
            this.postProcessor.resize(this.canvas.width, this.canvas.height);
        } else {
            console.warn('PostProcessor not available - bloom effects disabled');
        }
    }
    
    setupAllShaders() {
        this.setupFlameShaders();
        this.setupSmokeShaders();
        this.setupParticleShaders();
        this.setupEnergyShaders();
        this.setupLightningShaders();
    }
    
    setupFlameShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            
            varying vec2 vTexCoord;
            varying vec3 vPosition;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
                vPosition = aPosition;
            }
        `;
        
        // Inline flame.frag shader
        const fragmentShaderSource = `precision highp float;

// Uniforms
uniform float uTime;
uniform sampler2D uNoiseTexture;
uniform sampler2D uFireProfile;
uniform sampler2D uGradientLUT;
uniform vec3 uFlameColor;
uniform float uFlameSpeed;
uniform float uFlameIntensity;
uniform float uFlameBrightness;
uniform vec2 uResolution;
uniform float uFrameThickness;
uniform int uFrameMode; // 0=bottom, 1=top, 2=sides, 3=all
uniform bool uMaskEdges;

// New quality settings
uniform int uNoiseOctaves; // 4-12
uniform bool uUseHighQualityTextures;
uniform float uDetailScale; // Auto-calculated from resolution

// Edge settings
uniform float uEdgeFeather; // 0.0-1.0
uniform float uFrameCurve; // 0.0-1.0
uniform float uFrameNoiseAmount; // 0.0-1.0

// Animation settings
uniform int uAnimationEasing; // 0=linear, 1=sine, 2=quad, 3=elastic
uniform bool uPulseEnabled;
uniform float uPulseAmount; // 0.0-1.0
uniform float uPulseSpeed; // 0.1-3.0

// Post-FX settings
uniform float uDepthIntensity; // 0.0-1.0

// Layer settings
uniform bool uLayersEnabled;
uniform int uLayerCount; // 1-3
uniform float uLayerParallax; // 0.0-1.0

varying vec2 vTexCoord;
varying vec3 vPosition;

const float modulus = 61.0;

// Include noise functions (these would be inline in actual shader)
// Simplex noise 2D
vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289_2(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x * 34.0) + 1.0) * x);
}

float simplexNoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289_2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 random2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// 8-octave fBm with configurable octave count
float fbm(vec2 p, int octaves) {
    float sum = 0.0;
    float freq = 1.0;
    float amp = 1.0;
    const float lacunarity = 2.0;
    const float gain = 0.5;
    
    for (int i = 0; i < 12; i++) {
        if (i >= octaves) break;
        float n = simplexNoise(p * freq) * 0.7 + valueNoise(p * freq) * 0.3;
        sum += n * amp;
        freq *= lacunarity;
        amp *= gain;
    }
    
    return sum;
}

// Easing functions
float applyEasing(float t, int easingType) {
    if (easingType == 1) return sin(t * 1.5707963); // sine
    if (easingType == 2) return t * t; // quad
    if (easingType == 3) return pow(2.0, -10.0 * t) * sin((t - 0.075) * (6.283185 / 0.3)) + 1.0; // elastic
    return t; // linear
}

// Blackbody radiation
vec3 blackbodyColor(float temp) {
    temp = temp * 39000.0 + 1000.0;
    float r, g, b;
    temp /= 100.0;
    
    if (temp <= 66.0) {
        r = 1.0;
    } else {
        r = temp - 60.0;
        r = 329.698727446 * pow(r, -0.1332047592);
        r /= 255.0;
        r = clamp(r, 0.0, 1.0);
    }
    
    if (temp <= 66.0) {
        g = temp;
        g = 99.4708025861 * log(g) - 161.1195681661;
        g /= 255.0;
        g = clamp(g, 0.0, 1.0);
    } else {
        g = temp - 60.0;
        g = 288.1221695283 * pow(g, -0.0755148492);
        g /= 255.0;
        g = clamp(g, 0.0, 1.0);
    }
    
    if (temp >= 66.0) {
        b = 1.0;
    } else if (temp <= 19.0) {
        b = 0.0;
    } else {
        b = temp - 10.0;
        b = 138.5177312231 * log(b) - 305.0447927307;
        b /= 255.0;
        b = clamp(b, 0.0, 1.0);
    }
    
    return vec3(r, g, b);
}

// Curved frame with noise modulation
float getCurvedFrameDistance(vec2 pixelPos, vec2 resolution, float thickness, float curve, float noiseAmt) {
    vec2 center = resolution * 0.5;
    vec2 toEdge = abs(pixelPos - center);
    vec2 maxDist = resolution * 0.5;
    
    // Apply curve (rounded corners)
    float cornerRadius = min(resolution.x, resolution.y) * curve * 0.3;
    vec2 cornerOffset = max(toEdge - (maxDist - cornerRadius), 0.0);
    float cornerDist = length(cornerOffset);
    
    float distFromLeft = pixelPos.x;
    float distFromRight = resolution.x - pixelPos.x;
    float distFromBottom = pixelPos.y;
    float distFromTop = resolution.y - pixelPos.y;
    
    float minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
    minDist = max(minDist - cornerDist, 0.0);
    
    // Add noise modulation to edges
    if (noiseAmt > 0.0) {
        float noiseVal = simplexNoise(pixelPos * 0.01) * noiseAmt * thickness * 0.3;
        minDist += noiseVal;
    }
    
    return minDist;
}

// Sample fire with multiple layers
vec4 sampleFireLayer(vec3 loc, vec4 scale, float layerOffset, float speedMult, float brightnessMult) {
    loc.xz = loc.xz * 2.0 - 1.0;
    vec2 st = vec2(sqrt(dot(loc.xz, loc.xz)), loc.y);
    
    // Apply easing and pulse
    float timeAdjusted = uTime;
    if (uPulseEnabled) {
        timeAdjusted += sin(uTime * uPulseSpeed) * uPulseAmount;
    }
    timeAdjusted = applyEasing(fract(timeAdjusted * 0.1), uAnimationEasing) * 10.0;
    
    loc.y -= timeAdjusted * scale.w * uFlameSpeed * speedMult;
    loc *= scale.xyz;
    loc.y += layerOffset;
    
    // Use configurable octave fBm instead of simple turbulence
    float offset = sqrt(st.y) * uFlameIntensity * fbm(loc.xy * uDetailScale, uNoiseOctaves);
    st.y += offset;
    
    if (st.y > 1.0) {
        return vec4(0.0, 0.0, 0.0, 0.0);
    }
    
    vec4 result = texture2D(uFireProfile, st);
    
    // Fade bottom
    if (st.y < 0.1) {
        result *= st.y / 0.1;
    }
    
    // Apply blackbody color or custom color
    float temp = result.r; // Use red channel as temperature
    vec3 bbColor = blackbodyColor(temp);
    result.rgb = mix(uFlameColor * result.rgb, bbColor, 0.3);
    
    // Apply brightness multiplier for this layer
    result.rgb *= brightnessMult;
    
    // Fake depth (inner glow)
    if (uDepthIntensity > 0.0) {
        float depth = result.r * uDepthIntensity;
        result.rgb += vec3(depth) * 0.5;
    }
    
    return result;
}

void main() {
    vec2 uv = vTexCoord;
    vec2 pixelPos = gl_FragCoord.xy;
    
    // Determine if we're in a frame area
    bool inFrame = false;
    float edgeDist = 0.0;
    
    if (uFrameMode == 0) {
        // Bottom only
        if (uFrameCurve > 0.0 || uFrameNoiseAmount > 0.0) {
            float dist = getCurvedFrameDistance(pixelPos, uResolution, uFrameThickness, uFrameCurve, uFrameNoiseAmount);
            if (pixelPos.y < uFrameThickness && dist < uFrameThickness) {
                inFrame = true;
                edgeDist = pixelPos.y / uFrameThickness;
            }
        } else {
            if (pixelPos.y < uFrameThickness) {
                inFrame = true;
                edgeDist = pixelPos.y / uFrameThickness;
            }
        }
    } else if (uFrameMode == 1) {
        // Top only
        if (pixelPos.y > uResolution.y - uFrameThickness) {
            inFrame = true;
            edgeDist = (uResolution.y - pixelPos.y) / uFrameThickness;
        }
    } else if (uFrameMode == 2) {
        // Sides only
        if (pixelPos.x < uFrameThickness || pixelPos.x > uResolution.x - uFrameThickness) {
            inFrame = true;
            if (pixelPos.x < uFrameThickness) {
                edgeDist = pixelPos.x / uFrameThickness;
            } else {
                edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
            }
        }
    } else {
        // All edges with curve support
        float minDist;
        if (uFrameCurve > 0.0 || uFrameNoiseAmount > 0.0) {
            minDist = getCurvedFrameDistance(pixelPos, uResolution, uFrameThickness, uFrameCurve, uFrameNoiseAmount);
        } else {
            float distFromLeft = pixelPos.x;
            float distFromRight = uResolution.x - pixelPos.x;
            float distFromBottom = pixelPos.y;
            float distFromTop = uResolution.y - pixelPos.y;
            minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
        }
        
        if (minDist < uFrameThickness) {
            inFrame = true;
            edgeDist = minDist / uFrameThickness;
        }
    }
    
    if (!inFrame) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    // Multi-layer compositing
    vec4 finalColor = vec4(0.0);
    
    if (uLayersEnabled && uLayerCount > 1) {
        // Background layer: large, slow, dark
        vec3 samplePos1 = vec3(uv.x, edgeDist, uv.y);
        samplePos1.x += uLayerParallax * 0.02;
        vec4 layer1 = sampleFireLayer(samplePos1, vec4(0.8, 2.0, 0.8, 0.5), 0.0, 0.5, 0.6 * uFlameBrightness);
        finalColor = layer1;
        
        // Midground layer: normal
        vec3 samplePos2 = vec3(uv.x, edgeDist, uv.y);
        vec4 layer2 = sampleFireLayer(samplePos2, vec4(1.0, 2.0, 1.0, 0.5), 0.0, 1.0, 1.0 * uFlameBrightness);
        finalColor = mix(finalColor, layer2, layer2.a);
        
        if (uLayerCount >= 3) {
            // Foreground layer: small, fast, bright
            vec3 samplePos3 = vec3(uv.x, edgeDist, uv.y);
            samplePos3.x -= uLayerParallax * 0.02;
            vec4 layer3 = sampleFireLayer(samplePos3, vec4(1.2, 2.0, 1.2, 0.5), 0.0, 1.5, 1.2 * uFlameBrightness);
            finalColor = mix(finalColor, layer3, layer3.a);
        }
    } else {
        // Single layer
        vec3 samplePos = vec3(uv.x, edgeDist, uv.y);
        finalColor = sampleFireLayer(samplePos, vec4(1.0, 2.0, 1.0, 0.5), 0.0, 1.0, uFlameBrightness);
    }
    
    // Apply soft edge blending / feathering
    if (uEdgeFeather > 0.0) {
        float featherDist = uFrameThickness * uEdgeFeather;
        float featherNoise = simplexNoise(pixelPos * 0.02) * 0.5 + 0.5;
        float featherAmount = smoothstep(0.0, featherDist / uFrameThickness, edgeDist);
        featherAmount = mix(featherAmount, featherAmount * featherNoise, 0.3);
        finalColor.a *= featherAmount;
    } else if (uMaskEdges) {
        finalColor.a *= smoothstep(0.0, 0.3, edgeDist);
    }
    
    gl_FragColor = finalColor;
}
`;
        
        this.programs.flames = this.createProgram(vertexShaderSource, fragmentShaderSource);
    }
    
    setupSmokeShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            
            varying vec2 vTexCoord;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
            }
        `;
        
        // Inline smoke.frag shader
        const fragmentShaderSource = `precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uFrameThickness;
uniform int uFrameMode;
uniform float uSmokeIntensity;
uniform float uSmokeSpeed;
uniform vec3 uSmokeColor;
uniform float uDetailScale;

varying vec2 vTexCoord;

// Simplex noise (inline for smoke shader)
vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289_2(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x * 34.0) + 1.0) * x);
}

float simplexNoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289_2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// Multi-octave noise for smoke
float smokeFbm(vec2 p) {
    float sum = 0.0;
    float freq = 1.0;
    float amp = 1.0;
    
    for (int i = 0; i < 6; i++) {
        sum += simplexNoise(p * freq) * amp;
        freq *= 2.0;
        amp *= 0.5;
    }
    
    return sum;
}

void main() {
    vec2 pixelPos = gl_FragCoord.xy;
    vec2 uv = vTexCoord;
    
    // Determine if we're in frame area (reuse same logic as flame)
    bool inFrame = false;
    float edgeDist = 0.0;
    
    if (uFrameMode == 0) {
        // Bottom only
        if (pixelPos.y < uFrameThickness) {
            inFrame = true;
            edgeDist = pixelPos.y / uFrameThickness;
        }
    } else if (uFrameMode == 1) {
        // Top only
        if (pixelPos.y > uResolution.y - uFrameThickness) {
            inFrame = true;
            edgeDist = (uResolution.y - pixelPos.y) / uFrameThickness;
        }
    } else if (uFrameMode == 2) {
        // Sides only
        if (pixelPos.x < uFrameThickness || pixelPos.x > uResolution.x - uFrameThickness) {
            inFrame = true;
            if (pixelPos.x < uFrameThickness) {
                edgeDist = pixelPos.x / uFrameThickness;
            } else {
                edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
            }
        }
    } else {
        // All edges
        float distFromLeft = pixelPos.x;
        float distFromRight = uResolution.x - pixelPos.x;
        float distFromBottom = pixelPos.y;
        float distFromTop = uResolution.y - pixelPos.y;
        float minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
        
        if (minDist < uFrameThickness) {
            inFrame = true;
            edgeDist = minDist / uFrameThickness;
        }
    }
    
    if (!inFrame) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    // Smoke moves upward slowly
    vec2 smokePos = uv;
    smokePos.y += uTime * uSmokeSpeed * 0.1;
    smokePos.x += simplexNoise(vec2(uv.y * 3.0, uTime * 0.5)) * 0.1;
    
    // Create wispy smoke pattern
    float smoke = smokeFbm(smokePos * uDetailScale * 2.0);
    smoke = smoothstep(0.3, 0.8, smoke);
    
    // Dissipate as it rises
    float dissipation = 1.0 - edgeDist;
    dissipation = pow(dissipation, 2.0);
    
    smoke *= dissipation * uSmokeIntensity;
    
    // Apply smoke color with transparency
    vec4 smokeColor = vec4(uSmokeColor, smoke * 0.5);
    
    gl_FragColor = smokeColor;
}
`;
        
        this.programs.smoke = this.createProgram(vertexShaderSource, fragmentShaderSource);
    }
    
    setupParticleShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            
            varying vec2 vTexCoord;
            varying vec3 vPosition;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
                vPosition = aPosition;
            }
        `;
        
        const fragmentShaderSource = `
            precision highp float;
            
            uniform float uTime;
            uniform vec3 uFlameColor;
            uniform float uFlameSpeed;
            uniform float uFlameIntensity;
            uniform float uFlameBrightness;
            uniform vec2 uResolution;
            uniform float uFrameThickness;
            uniform int uFrameMode;
            
            varying vec2 vTexCoord;
            
            // Pseudo-random function
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }
            
            vec4 renderParticles(vec2 uv, vec2 pixelPos, float edgeDist) {
                vec4 color = vec4(0.0);
                
                // Create multiple layers of particles - optimized for performance
                for (int layer = 0; layer < 2; layer++) {
                    float layerOffset = float(layer) * 0.5;
                    float particleCount = 12.0 + float(layer) * 6.0;
                    
                    for (float i = 0.0; i < 18.0; i += 1.0) {
                        if (i >= particleCount) break;
                        
                        // Particle position
                        float particleTime = uTime * uFlameSpeed + i * 0.1 + layerOffset;
                        float x = fract(random(vec2(i, layerOffset)) + particleTime * 0.05);
                        float y = fract(random(vec2(i + 100.0, layerOffset)) + particleTime * 0.3);
                        
                        vec2 particlePos = vec2(x * uResolution.x, y * uFrameThickness);
                        
                        // Particle size based on intensity
                        float size = (5.0 + random(vec2(i, i)) * 15.0) * uFlameIntensity;
                        
                        // Distance to particle
                        float dist = length(pixelPos - particlePos);
                        
                        // Particle glow
                        if (dist < size) {
                            float alpha = 1.0 - (dist / size);
                            alpha = pow(alpha, 2.0);
                            
                            // Color variation
                            vec3 particleColor = mix(
                                uFlameColor * 0.8,
                                uFlameColor * 1.5,
                                random(vec2(i, particleTime))
                            );
                            
                            color.rgb += particleColor * alpha * 0.4;
                            color.a += alpha * 0.4;
                        }
                    }
                }
                
                return color * uFlameBrightness * 2.0;
            }
            
            void main() {
                vec2 pixelPos = gl_FragCoord.xy;
                
                bool inFrame = false;
                float edgeDist = 0.0;
                
                if (uFrameMode == 0) {
                    if (pixelPos.y < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.y / uFrameThickness;
                    }
                } else if (uFrameMode == 1) {
                    if (pixelPos.y > uResolution.y - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (uResolution.y - pixelPos.y) / uFrameThickness;
                        pixelPos.y = uResolution.y - pixelPos.y;
                    }
                } else if (uFrameMode == 2) {
                    if (pixelPos.x < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.x / uFrameThickness;
                        vec2 temp = pixelPos;
                        pixelPos.x = temp.y;
                        pixelPos.y = temp.x;
                    } else if (pixelPos.x > uResolution.x - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
                        vec2 temp = pixelPos;
                        pixelPos.x = temp.y;
                        pixelPos.y = uResolution.x - temp.x;
                    }
                } else {
                    float distFromLeft = pixelPos.x;
                    float distFromRight = uResolution.x - pixelPos.x;
                    float distFromBottom = pixelPos.y;
                    float distFromTop = uResolution.y - pixelPos.y;
                    
                    float minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
                    
                    if (minDist < uFrameThickness) {
                        inFrame = true;
                        edgeDist = minDist / uFrameThickness;
                    }
                }
                
                if (!inFrame) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    return;
                }
                
                gl_FragColor = renderParticles(vTexCoord, pixelPos, edgeDist);
                gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0);
            }
        `;
        
        this.programs.particles = this.createProgram(vertexShaderSource, fragmentShaderSource);
    }

    
    setupEnergyShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            
            varying vec2 vTexCoord;
            varying vec3 vPosition;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
                vPosition = aPosition;
            }
        `;
        
        const fragmentShaderSource = `
            precision highp float;
            
            uniform float uTime;
            uniform vec3 uFlameColor;
            uniform float uFlameSpeed;
            uniform float uFlameIntensity;
            uniform float uFlameBrightness;
            uniform vec2 uResolution;
            uniform float uFrameThickness;
            uniform int uFrameMode;
            
            varying vec2 vTexCoord;
            
            float noise(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            
            vec4 renderEnergyWaves(vec2 uv, vec2 pixelPos, float edgeDist) {
                vec4 color = vec4(0.0);
                
                // Multiple wave layers
                for (int i = 0; i < 4; i++) {
                    float offset = float(i) * 0.25;
                    float wave = sin(uv.x * 20.0 + uTime * uFlameSpeed * 2.0 + offset) * 
                                 cos(uv.x * 15.0 - uTime * uFlameSpeed * 1.5 + offset);
                    
                    wave *= uFlameIntensity * 0.5;
                    
                    // Wave pattern based on edge distance
                    float waveIntensity = abs(wave - edgeDist + 0.5);
                    waveIntensity = 1.0 - smoothstep(0.0, 0.2, waveIntensity);
                    
                    // Color based on wave layer
                    vec3 waveColor = mix(
                        uFlameColor * 0.5,
                        uFlameColor * 2.0,
                        float(i) / 3.0
                    );
                    
                    color.rgb += waveColor * waveIntensity * 0.3;
                    color.a += waveIntensity * 0.3;
                }
                
                // Add flowing energy effect
                float flow = sin(uv.x * 10.0 + uTime * uFlameSpeed * 3.0) * 
                            cos(uv.y * 8.0 - uTime * uFlameSpeed * 2.0);
                flow = (flow + 1.0) * 0.5;
                
                color.rgb += uFlameColor * flow * 0.2;
                color.a += flow * 0.1;
                
                return color * uFlameBrightness * 2.5;
            }
            
            void main() {
                vec2 pixelPos = gl_FragCoord.xy;
                
                bool inFrame = false;
                float edgeDist = 0.0;
                
                if (uFrameMode == 0) {
                    if (pixelPos.y < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.y / uFrameThickness;
                    }
                } else if (uFrameMode == 1) {
                    if (pixelPos.y > uResolution.y - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (uResolution.y - pixelPos.y) / uFrameThickness;
                    }
                } else if (uFrameMode == 2) {
                    if (pixelPos.x < uFrameThickness || pixelPos.x > uResolution.x - uFrameThickness) {
                        inFrame = true;
                        if (pixelPos.x < uFrameThickness) {
                            edgeDist = pixelPos.x / uFrameThickness;
                        } else {
                            edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
                        }
                    }
                } else {
                    float distFromLeft = pixelPos.x;
                    float distFromRight = uResolution.x - pixelPos.x;
                    float distFromBottom = pixelPos.y;
                    float distFromTop = uResolution.y - pixelPos.y;
                    
                    float minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
                    
                    if (minDist < uFrameThickness) {
                        inFrame = true;
                        edgeDist = minDist / uFrameThickness;
                    }
                }
                
                if (!inFrame) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    return;
                }
                
                gl_FragColor = renderEnergyWaves(vTexCoord, pixelPos, edgeDist);
                gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0);
            }
        `;
        
        this.programs.energy = this.createProgram(vertexShaderSource, fragmentShaderSource);
    }

    
    setupLightningShaders() {
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec2 aTexCoord;
            
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            
            varying vec2 vTexCoord;
            varying vec3 vPosition;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vTexCoord = aTexCoord;
                vPosition = aPosition;
            }
        `;
        
        const fragmentShaderSource = `
            precision highp float;
            
            uniform float uTime;
            uniform vec3 uFlameColor;
            uniform float uFlameSpeed;
            uniform float uFlameIntensity;
            uniform float uFlameBrightness;
            uniform vec2 uResolution;
            uniform float uFrameThickness;
            uniform int uFrameMode;
            
            varying vec2 vTexCoord;
            
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }
            
            vec4 renderLightning(vec2 uv, vec2 pixelPos, float edgeDist) {
                vec4 color = vec4(0.0);
                
                // Electric arc effect - optimized for performance
                float boltCount = 3.0 + floor(uFlameIntensity * 4.0);
                
                for (float i = 0.0; i < 7.0; i += 1.0) {
                    if (i >= boltCount) break;
                    
                    float boltTime = uTime * uFlameSpeed + i * 0.3;
                    float boltX = fract(random(vec2(i, floor(boltTime))) + boltTime * 0.1);
                    
                    // Lightning bolt path with jagged movement - reduced segments
                    float segments = 6.0;
                    
                    for (float s = 0.0; s < 6.0; s += 1.0) {
                        if (s >= segments) break;
                        
                        float segmentProgress = s / segments;
                        float nextSegmentProgress = (s + 1.0) / segments;
                        
                        if (uv.x >= boltX - 0.05 && uv.x <= boltX + 0.05) {
                            float zigzag = (random(vec2(i, s + floor(boltTime * 10.0))) - 0.5) * 0.1 * uFlameIntensity;
                            
                            float lineY = mix(segmentProgress, nextSegmentProgress, 
                                            fract((uv.x - boltX + 0.05) * 10.0)) + zigzag;
                            
                            float dist = abs(edgeDist - lineY);
                            
                            if (dist < 0.05) {
                                float intensity = 1.0 - (dist / 0.05);
                                intensity = pow(intensity, 2.0);
                                
                                // Flickering effect
                                float flicker = 0.7 + 0.3 * sin(uTime * 20.0 + i);
                                
                                color.rgb += uFlameColor * intensity * flicker * 0.6;
                                color.a += intensity * flicker * 0.6;
                                
                                // Glow around bolt
                                if (dist < 0.1) {
                                    float glow = 1.0 - (dist / 0.1);
                                    glow = pow(glow, 3.0);
                                    color.rgb += uFlameColor * glow * 0.25;
                                    color.a += glow * 0.15;
                                }
                            }
                        }
                    }
                }
                
                // Add ambient electric field
                float field = sin(uv.x * 30.0 + uTime * uFlameSpeed * 5.0) * 
                             cos(edgeDist * 20.0 - uTime * uFlameSpeed * 3.0);
                field = (field + 1.0) * 0.5;
                
                color.rgb += uFlameColor * field * 0.1;
                color.a += field * 0.05;
                
                return color * uFlameBrightness * 3.0;
            }
            
            void main() {
                vec2 pixelPos = gl_FragCoord.xy;
                
                bool inFrame = false;
                float edgeDist = 0.0;
                
                if (uFrameMode == 0) {
                    if (pixelPos.y < uFrameThickness) {
                        inFrame = true;
                        edgeDist = pixelPos.y / uFrameThickness;
                    }
                } else if (uFrameMode == 1) {
                    if (pixelPos.y > uResolution.y - uFrameThickness) {
                        inFrame = true;
                        edgeDist = (uResolution.y - pixelPos.y) / uFrameThickness;
                    }
                } else if (uFrameMode == 2) {
                    if (pixelPos.x < uFrameThickness || pixelPos.x > uResolution.x - uFrameThickness) {
                        inFrame = true;
                        if (pixelPos.x < uFrameThickness) {
                            edgeDist = pixelPos.x / uFrameThickness;
                        } else {
                            edgeDist = (uResolution.x - pixelPos.x) / uFrameThickness;
                        }
                    }
                } else {
                    float distFromLeft = pixelPos.x;
                    float distFromRight = uResolution.x - pixelPos.x;
                    float distFromBottom = pixelPos.y;
                    float distFromTop = uResolution.y - pixelPos.y;
                    
                    float minDist = min(min(distFromLeft, distFromRight), min(distFromBottom, distFromTop));
                    
                    if (minDist < uFrameThickness) {
                        inFrame = true;
                        edgeDist = minDist / uFrameThickness;
                    }
                }
                
                if (!inFrame) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    return;
                }
                
                gl_FragColor = renderLightning(vTexCoord, pixelPos, edgeDist);
                gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0);
            }
        `;
        
        this.programs.lightning = this.createProgram(vertexShaderSource, fragmentShaderSource);
    }

    
    createProgram(vertexSource, fragmentSource) {
        const vertexShader = this.compileShader(vertexSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(fragmentSource, this.gl.FRAGMENT_SHADER);
        
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Shader program link error:', this.gl.getProgramInfoLog(program));
            return null;
        }
        
        return program;
    }
    
    compileShader(source, type) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    switchEffect(effectType) {
        const effectMap = {
            'flames': 'flames',
            'particles': 'particles',
            'energy': 'energy',
            'lightning': 'lightning'
        };
        
        const programKey = effectMap[effectType] || 'flames';
        this.currentProgram = this.programs[programKey];
        
        if (this.currentProgram) {
            this.gl.useProgram(this.currentProgram);
            this.setupUniformsForProgram(this.currentProgram);
            this.updateUniforms();
        }
    }
    
    setupUniformsForProgram(program) {
        this.gl.useProgram(program);
        
        // Standard uniforms
        this.uniforms = {
            time: this.gl.getUniformLocation(program, 'uTime'),
            flameColor: this.gl.getUniformLocation(program, 'uFlameColor'),
            flameSpeed: this.gl.getUniformLocation(program, 'uFlameSpeed'),
            flameIntensity: this.gl.getUniformLocation(program, 'uFlameIntensity'),
            flameBrightness: this.gl.getUniformLocation(program, 'uFlameBrightness'),
            resolution: this.gl.getUniformLocation(program, 'uResolution'),
            frameThickness: this.gl.getUniformLocation(program, 'uFrameThickness'),
            frameMode: this.gl.getUniformLocation(program, 'uFrameMode'),
            maskEdges: this.gl.getUniformLocation(program, 'uMaskEdges'),
            projectionMatrix: this.gl.getUniformLocation(program, 'uProjectionMatrix'),
            modelViewMatrix: this.gl.getUniformLocation(program, 'uModelViewMatrix'),
            noiseTexture: this.gl.getUniformLocation(program, 'uNoiseTexture'),
            fireProfile: this.gl.getUniformLocation(program, 'uFireProfile'),
            // New v2.2.0 uniforms
            noiseOctaves: this.gl.getUniformLocation(program, 'uNoiseOctaves'),
            useHighQualityTextures: this.gl.getUniformLocation(program, 'uUseHighQualityTextures'),
            detailScale: this.gl.getUniformLocation(program, 'uDetailScale'),
            edgeFeather: this.gl.getUniformLocation(program, 'uEdgeFeather'),
            frameCurve: this.gl.getUniformLocation(program, 'uFrameCurve'),
            frameNoiseAmount: this.gl.getUniformLocation(program, 'uFrameNoiseAmount'),
            animationEasing: this.gl.getUniformLocation(program, 'uAnimationEasing'),
            pulseEnabled: this.gl.getUniformLocation(program, 'uPulseEnabled'),
            pulseAmount: this.gl.getUniformLocation(program, 'uPulseAmount'),
            pulseSpeed: this.gl.getUniformLocation(program, 'uPulseSpeed'),
            depthIntensity: this.gl.getUniformLocation(program, 'uDepthIntensity'),
            layersEnabled: this.gl.getUniformLocation(program, 'uLayersEnabled'),
            layerCount: this.gl.getUniformLocation(program, 'uLayerCount'),
            layerParallax: this.gl.getUniformLocation(program, 'uLayerParallax'),
            // Smoke uniforms
            smokeIntensity: this.gl.getUniformLocation(program, 'uSmokeIntensity'),
            smokeSpeed: this.gl.getUniformLocation(program, 'uSmokeSpeed'),
            smokeColor: this.gl.getUniformLocation(program, 'uSmokeColor')
        };
    }
    
    setupGeometry() {
        const vertices = new Float32Array([
            -1, -1, 0,
             1, -1, 0,
            -1,  1, 0,
             1,  1, 0
        ]);
        
        const texCoords = new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            1, 1
        ]);
        
        this.buffers.position = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        
        this.buffers.texCoord = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.texCoord);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
    }
    
    loadTextures() {
        this.loadTexture('/plugins/flame-overlay/textures/nzw.png', 'noise', this.gl.LINEAR, this.gl.REPEAT);
        this.loadTexture('/plugins/flame-overlay/textures/firetex.png', 'fireProfile', this.gl.LINEAR, this.gl.CLAMP_TO_EDGE);
    }
    
    loadTexture(url, name, filter, wrap) {
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        
        this.gl.texImage2D(
            this.gl.TEXTURE_2D, 0, this.gl.RGBA,
            1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE,
            new Uint8Array([255, 255, 255, 255])
        );
        
        const image = new Image();
        image.onload = () => {
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(
                this.gl.TEXTURE_2D, 0, this.gl.RGBA,
                this.gl.RGBA, this.gl.UNSIGNED_BYTE, image
            );
            
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, filter);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, filter);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, wrap);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, wrap);
        };
        image.src = url;
        
        this.textures[name] = texture;
    }
    
    initParticles() {
        this.particles = [];
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : { r: 1, g: 0.4, b: 0 };
    }
    
    getFrameMode() {
        const modes = {
            'bottom': 0,
            'top': 1,
            'sides': 2,
            'all': 3
        };
        return modes[this.config.frameMode] || 0;
    }
    
    getAnimationEasing() {
        const easings = {
            'linear': 0,
            'sine': 1,
            'quad': 2,
            'elastic': 3
        };
        return easings[this.config.animationEasing] || 0;
    }
    
    calculateDetailScale() {
        if (!this.config.detailScaleAuto) {
            return 1.0;
        }
        // Auto-calculate based on canvas resolution
        const avgRes = (this.canvas.width + this.canvas.height) / 2;
        return Math.max(0.5, avgRes / 1000.0);
    }
    
    updateUniforms() {
        if (!this.gl || !this.currentProgram) return;
        
        this.gl.useProgram(this.currentProgram);
        
        const color = this.hexToRgb(this.config.flameColor || '#ff6600');
        if (this.uniforms.flameColor) {
            this.gl.uniform3f(this.uniforms.flameColor, color.r, color.g, color.b);
        }
        
        if (this.uniforms.flameSpeed) {
            this.gl.uniform1f(this.uniforms.flameSpeed, this.config.flameSpeed || 0.5);
        }
        if (this.uniforms.flameIntensity) {
            this.gl.uniform1f(this.uniforms.flameIntensity, this.config.flameIntensity || 1.3);
        }
        if (this.uniforms.flameBrightness) {
            this.gl.uniform1f(this.uniforms.flameBrightness, this.config.flameBrightness || 0.25);
        }
        
        if (this.uniforms.frameThickness) {
            this.gl.uniform1f(this.uniforms.frameThickness, this.config.frameThickness || 150);
        }
        if (this.uniforms.frameMode) {
            this.gl.uniform1i(this.uniforms.frameMode, this.getFrameMode());
        }
        if (this.uniforms.maskEdges) {
            this.gl.uniform1i(this.uniforms.maskEdges, this.config.maskOnlyEdges ? 1 : 0);
        }
        
        if (this.uniforms.resolution) {
            this.gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        }
        
        // New v2.2.0 uniforms
        if (this.uniforms.noiseOctaves) {
            this.gl.uniform1i(this.uniforms.noiseOctaves, this.config.noiseOctaves || 8);
        }
        if (this.uniforms.useHighQualityTextures) {
            this.gl.uniform1i(this.uniforms.useHighQualityTextures, this.config.useHighQualityTextures ? 1 : 0);
        }
        if (this.uniforms.detailScale) {
            this.gl.uniform1f(this.uniforms.detailScale, this.calculateDetailScale());
        }
        if (this.uniforms.edgeFeather) {
            this.gl.uniform1f(this.uniforms.edgeFeather, this.config.edgeFeather || 0.0);
        }
        if (this.uniforms.frameCurve) {
            this.gl.uniform1f(this.uniforms.frameCurve, this.config.frameCurve || 0.0);
        }
        if (this.uniforms.frameNoiseAmount) {
            this.gl.uniform1f(this.uniforms.frameNoiseAmount, this.config.frameNoiseAmount || 0.0);
        }
        if (this.uniforms.animationEasing) {
            this.gl.uniform1i(this.uniforms.animationEasing, this.getAnimationEasing());
        }
        if (this.uniforms.pulseEnabled) {
            this.gl.uniform1i(this.uniforms.pulseEnabled, this.config.pulseEnabled ? 1 : 0);
        }
        if (this.uniforms.pulseAmount) {
            this.gl.uniform1f(this.uniforms.pulseAmount, this.config.pulseAmount || 0.0);
        }
        if (this.uniforms.pulseSpeed) {
            this.gl.uniform1f(this.uniforms.pulseSpeed, this.config.pulseSpeed || 1.0);
        }
        if (this.uniforms.depthIntensity) {
            this.gl.uniform1f(this.uniforms.depthIntensity, this.config.depthIntensity || 0.0);
        }
        if (this.uniforms.layersEnabled) {
            this.gl.uniform1i(this.uniforms.layersEnabled, this.config.layersEnabled ? 1 : 0);
        }
        if (this.uniforms.layerCount) {
            this.gl.uniform1i(this.uniforms.layerCount, this.config.layerCount || 1);
        }
        if (this.uniforms.layerParallax) {
            this.gl.uniform1f(this.uniforms.layerParallax, this.config.layerParallax || 0.0);
        }
        
        // Smoke uniforms
        if (this.uniforms.smokeIntensity) {
            this.gl.uniform1f(this.uniforms.smokeIntensity, this.config.smokeIntensity || 0.0);
        }
        if (this.uniforms.smokeSpeed) {
            this.gl.uniform1f(this.uniforms.smokeSpeed, this.config.smokeSpeed || 0.3);
        }
        if (this.uniforms.smokeColor) {
            const smokeRgb = this.hexToRgb(this.config.smokeColor || '#333333');
            this.gl.uniform3f(this.uniforms.smokeColor, smokeRgb.r, smokeRgb.g, smokeRgb.b);
        }
        
        if (this.uniforms.noiseTexture && this.textures.noise) {
            this.gl.uniform1i(this.uniforms.noiseTexture, 0);
        }
        if (this.uniforms.fireProfile && this.textures.fireProfile) {
            this.gl.uniform1i(this.uniforms.fireProfile, 1);
        }
    }
    
    handleResize() {
        const dpr = this.config.highDPI ? (window.devicePixelRatio || 1) : 1;
        
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.postProcessor) {
            this.postProcessor.resize(this.canvas.width, this.canvas.height);
        }
        
        this.updateUniforms();
    }
    
    renderScene() {
        const gl = this.gl;
        const time = (Date.now() - this.startTime) / 1000.0;
        
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        gl.useProgram(this.currentProgram);
        
        if (this.uniforms.time) {
            gl.uniform1f(this.uniforms.time, time);
        }
        
        // Bind textures
        if (this.textures.noise) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.textures.noise);
        }
        if (this.textures.fireProfile) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.textures.fireProfile);
        }
        
        // Set matrices
        const projectionMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        const modelViewMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        
        if (this.uniforms.projectionMatrix) {
            gl.uniformMatrix4fv(this.uniforms.projectionMatrix, false, projectionMatrix);
        }
        if (this.uniforms.modelViewMatrix) {
            gl.uniformMatrix4fv(this.uniforms.modelViewMatrix, false, modelViewMatrix);
        }
        
        // Bind geometry
        const aPosition = gl.getAttribLocation(this.currentProgram, 'aPosition');
        if (aPosition !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
            gl.enableVertexAttribArray(aPosition);
            gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
        }
        
        const aTexCoord = gl.getAttribLocation(this.currentProgram, 'aTexCoord');
        if (aTexCoord !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
            gl.enableVertexAttribArray(aTexCoord);
            gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
        }
        
        // Draw main effect
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Render smoke layer if enabled
        if (this.config.smokeEnabled && this.programs.smoke) {
            const prevProgram = this.currentProgram;
            const prevUniforms = this.uniforms;
            
            gl.useProgram(this.programs.smoke);
            
            // Cache smoke uniforms if not already cached
            if (!this.uniforms.smokeUniforms) {
                this.uniforms.smokeUniforms = {
                    time: gl.getUniformLocation(this.programs.smoke, 'uTime'),
                    resolution: gl.getUniformLocation(this.programs.smoke, 'uResolution'),
                    frameThickness: gl.getUniformLocation(this.programs.smoke, 'uFrameThickness'),
                    frameMode: gl.getUniformLocation(this.programs.smoke, 'uFrameMode'),
                    smokeIntensity: gl.getUniformLocation(this.programs.smoke, 'uSmokeIntensity'),
                    smokeSpeed: gl.getUniformLocation(this.programs.smoke, 'uSmokeSpeed'),
                    smokeColor: gl.getUniformLocation(this.programs.smoke, 'uSmokeColor'),
                    detailScale: gl.getUniformLocation(this.programs.smoke, 'uDetailScale'),
                    projectionMatrix: gl.getUniformLocation(this.programs.smoke, 'uProjectionMatrix'),
                    modelViewMatrix: gl.getUniformLocation(this.programs.smoke, 'uModelViewMatrix')
                };
            }
            
            // Set smoke-specific uniforms
            const smokeUniforms = this.uniforms.smokeUniforms;
            if (smokeUniforms.time) gl.uniform1f(smokeUniforms.time, time);
            if (smokeUniforms.resolution) gl.uniform2f(smokeUniforms.resolution, this.canvas.width, this.canvas.height);
            if (smokeUniforms.frameThickness) gl.uniform1f(smokeUniforms.frameThickness, this.config.frameThickness || 150);
            if (smokeUniforms.frameMode) gl.uniform1i(smokeUniforms.frameMode, this.getFrameMode());
            if (smokeUniforms.smokeIntensity) gl.uniform1f(smokeUniforms.smokeIntensity, this.config.smokeIntensity || 0.4);
            if (smokeUniforms.smokeSpeed) gl.uniform1f(smokeUniforms.smokeSpeed, this.config.smokeSpeed || 0.3);
            if (smokeUniforms.detailScale) gl.uniform1f(smokeUniforms.detailScale, this.calculateDetailScale());
            
            if (smokeUniforms.smokeColor) {
                const smokeRgb = this.hexToRgb(this.config.smokeColor || '#333333');
                gl.uniform3f(smokeUniforms.smokeColor, smokeRgb.r, smokeRgb.g, smokeRgb.b);
            }
            
            const projectionMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
            const modelViewMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
            if (smokeUniforms.projectionMatrix) gl.uniformMatrix4fv(smokeUniforms.projectionMatrix, false, projectionMatrix);
            if (smokeUniforms.modelViewMatrix) gl.uniformMatrix4fv(smokeUniforms.modelViewMatrix, false, modelViewMatrix);
            
            // Re-bind geometry for smoke
            const aSmokePosition = gl.getAttribLocation(this.programs.smoke, 'aPosition');
            if (aSmokePosition !== -1) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
                gl.enableVertexAttribArray(aSmokePosition);
                gl.vertexAttribPointer(aSmokePosition, 3, gl.FLOAT, false, 0, 0);
            }
            
            const aSmokeTexCoord = gl.getAttribLocation(this.programs.smoke, 'aTexCoord');
            if (aSmokeTexCoord !== -1) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
                gl.enableVertexAttribArray(aSmokeTexCoord);
                gl.vertexAttribPointer(aSmokeTexCoord, 2, gl.FLOAT, false, 0, 0);
            }
            
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            
            // Restore previous program and uniforms
            gl.useProgram(prevProgram);
            this.uniforms = prevUniforms;
        }
    }
    
    render() {
        if (!this.gl || !this.currentProgram) {
            requestAnimationFrame(() => this.render());
            return;
        }
        
        const time = (Date.now() - this.startTime) / 1000.0;
        
        // Multi-pass rendering with bloom
        if (this.config.bloomEnabled && this.postProcessor && this.postProcessor.isReady()) {
            // Render to framebuffer
            this.postProcessor.renderToFramebuffer('scene', () => {
                this.renderScene();
            });
            
            // Apply bloom
            const bloomTexture = this.postProcessor.applyBloom(
                this.postProcessor.textures.scene,
                {
                    bloomThreshold: this.config.bloomThreshold || 0.6,
                    bloomRadius: this.config.bloomRadius || 4
                }
            );
            
            // Composite to screen
            this.postProcessor.composite(
                this.postProcessor.textures.scene,
                bloomTexture,
                {
                    bloomIntensity: this.config.bloomIntensity || 0.8,
                    chromaticAberration: this.config.chromaticAberration || 0.005,
                    filmGrain: this.config.filmGrain || 0.03
                },
                time
            );
        } else {
            // Direct rendering without bloom
            this.renderScene();
        }
        
        requestAnimationFrame(() => this.render());
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.effectsEngine = new EffectsEngine('flameCanvas');
});
