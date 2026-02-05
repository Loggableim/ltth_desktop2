// Common GLSL utilities and functions
// Shared across all shader effects

// Easing functions
float easeLinear(float t) {
    return t;
}

float easeSine(float t) {
    return sin(t * 1.5707963); // PI/2
}

float easeQuad(float t) {
    return t * t;
}

float easeElastic(float t) {
    float p = 0.3;
    return pow(2.0, -10.0 * t) * sin((t - p / 4.0) * (6.283185 / p)) + 1.0;
}

float applyEasing(float t, int easingType) {
    if (easingType == 1) return easeSine(t);
    if (easingType == 2) return easeQuad(t);
    if (easingType == 3) return easeElastic(t);
    return easeLinear(t);
}

// Blackbody radiation color temperature conversion
vec3 blackbodyColor(float temp) {
    // Temperature in range 1000-40000K, normalized to 0-1
    temp = temp * 39000.0 + 1000.0;
    
    float r, g, b;
    temp /= 100.0;
    
    // Red
    if (temp <= 66.0) {
        r = 1.0;
    } else {
        r = temp - 60.0;
        r = 329.698727446 * pow(r, -0.1332047592);
        r /= 255.0;
        r = clamp(r, 0.0, 1.0);
    }
    
    // Green
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
    
    // Blue
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

// Hex color to RGB
vec3 hexToRgb(float hexValue) {
    float r = floor(hexValue / 65536.0) / 255.0;
    float g = floor(mod(hexValue / 256.0, 256.0)) / 255.0;
    float b = floor(mod(hexValue, 256.0)) / 255.0;
    return vec3(r, g, b);
}

// Fast hash function
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// 2D random
vec2 random2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// Smooth minimum for blending
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
