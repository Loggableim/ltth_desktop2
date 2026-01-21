#version 300 es
precision highp float;

// Instance attributes (per-particle data from vertex buffer)
in vec2 a_position;      // Particle position (x, y) in pixels
in vec2 a_velocity;      // Particle velocity (vx, vy)
in float a_size;         // Particle size in pixels
in float a_hue;          // HSL hue (0-360)
in float a_saturation;   // HSL saturation (0-100)
in float a_brightness;   // HSL brightness (0-100)
in float a_alpha;        // Alpha (0-1)
in float a_rotation;     // Rotation angle in radians

// Vertex attributes (quad corners, shared by all instances)
in vec2 a_corner;        // Corner positions: (-1,-1), (1,-1), (1,1), (-1,1)

// Uniforms
uniform vec2 u_resolution;  // Canvas resolution (width, height)

// Outputs to fragment shader
out vec3 v_color;        // RGB color (converted from HSL)
out float v_alpha;       // Alpha for blending
out vec2 v_texCoord;     // Texture coordinates (0-1 range for circle shape)
out float v_rotation;    // Pass rotation for advanced effects

// HSL to RGB conversion
vec3 hslToRgb(float h, float s, float l) {
    h /= 360.0;
    s /= 100.0;
    l /= 100.0;
    
    vec3 rgb;
    
    if (s == 0.0) {
        rgb = vec3(l, l, l);
    } else {
        float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
        float p = 2.0 * l - q;
        
        float hue2rgb(float p, float q, float t) {
            if (t < 0.0) t += 1.0;
            if (t > 1.0) t -= 1.0;
            if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
            if (t < 1.0/2.0) return q;
            if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
            return p;
        }
        
        rgb.r = hue2rgb(p, q, h + 1.0/3.0);
        rgb.g = hue2rgb(p, q, h);
        rgb.b = hue2rgb(p, q, h - 1.0/3.0);
    }
    
    return rgb;
}

void main() {
    // Rotate corner around origin
    float c = cos(a_rotation);
    float s = sin(a_rotation);
    vec2 rotated = vec2(
        a_corner.x * c - a_corner.y * s,
        a_corner.x * s + a_corner.y * c
    );
    
    // Scale by particle size
    vec2 offset = rotated * a_size;
    
    // Calculate final position in pixels
    vec2 pixelPos = a_position + offset;
    
    // Convert to normalized device coordinates (NDC)
    // NDC range is [-1, 1] for both x and y
    vec2 ndcPos = (pixelPos / u_resolution) * 2.0 - 1.0;
    ndcPos.y *= -1.0; // Flip Y axis (canvas Y goes down, NDC Y goes up)
    
    gl_Position = vec4(ndcPos, 0.0, 1.0);
    
    // Pass data to fragment shader
    v_color = hslToRgb(a_hue, a_saturation, a_brightness);
    v_alpha = a_alpha;
    v_texCoord = a_corner * 0.5 + 0.5; // Convert from [-1,1] to [0,1]
    v_rotation = a_rotation;
}
