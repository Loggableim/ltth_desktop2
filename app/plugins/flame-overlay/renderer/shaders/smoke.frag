precision highp float;

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
