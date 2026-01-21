#version 300 es
precision highp float;

// Inputs from vertex shader
in vec3 v_color;
in float v_alpha;
in vec2 v_texCoord;
in float v_rotation;

// Output
out vec4 fragColor;

void main() {
    // Create circular particle with soft edges
    // Distance from center (0.5, 0.5)
    float dist = length(v_texCoord - vec2(0.5, 0.5)) * 2.0;
    
    // Smooth alpha falloff for soft edges
    // smoothstep(edge0, edge1, x) returns 0 if x < edge0, 1 if x > edge1
    // We want alpha = 1 at dist < 0.8, alpha = 0 at dist > 1.0
    float alpha = smoothstep(1.0, 0.8, dist) * v_alpha;
    
    // Discard fully transparent fragments for performance
    if (alpha < 0.01) {
        discard;
    }
    
    // Apply glow effect at the center
    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    vec3 glowColor = v_color + vec3(glow * 0.3); // Add brightness at center
    
    // Output final color with alpha blending
    fragColor = vec4(glowColor, alpha);
}
