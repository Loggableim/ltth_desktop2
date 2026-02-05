precision highp float;

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
