// WebGPU Fragment Shader - Particle Rendering
// Renders particles with soft circular shape and glow

struct FragmentInput {
    @location(0) color: vec3<f32>,
    @location(1) alpha: f32,
    @location(2) texCoord: vec2<f32>,
    @location(3) shapeType: u32,
}

// Heart shape SDF (Signed Distance Function)
fn renderHeart(uv: vec2<f32>) -> f32 {
    let x = uv.x;
    let y = uv.y;
    
    // Heart equation
    let heartShape = pow(x * x + pow(y - pow(abs(x), 0.666), 2.0), 0.5) - 1.0;
    return smoothstep(0.1, 0.0, heartShape);
}

// 5-pointed star SDF
fn renderStar(uv: vec2<f32>) -> f32 {
    let pi = 3.14159265359;
    let angle = atan2(uv.y, uv.x);
    let dist = length(uv);
    
    // Create 5-pointed star pattern
    let starAngle = fract((angle / (2.0 * pi)) * 5.0);
    let starDist = cos(starAngle * pi) * 0.5 + 0.5;
    
    let shape = dist - (0.5 * starDist);
    return smoothstep(0.1, 0.0, shape);
}

// Paw print SDF
fn renderPaw(uv: vec2<f32>) -> f32 {
    // Central pad (large circle at bottom)
    let centerDist = length(uv - vec2<f32>(0.0, 0.2)) - 0.4;
    var alpha = smoothstep(0.1, 0.0, centerDist);
    
    // Four toe pads (small circles)
    let toes = array<vec2<f32>, 4>(
        vec2<f32>(-0.35, -0.3),  // Top left
        vec2<f32>(-0.15, -0.45), // Bottom left
        vec2<f32>(0.15, -0.45),  // Bottom right
        vec2<f32>(0.35, -0.3)    // Top right
    );
    
    for (var i = 0u; i < 4u; i++) {
        let toeDist = length(uv - toes[i]) - 0.2;
        alpha = max(alpha, smoothstep(0.1, 0.0, toeDist));
    }
    
    return alpha;
}

// Spiral pattern
fn renderSpiral(uv: vec2<f32>) -> f32 {
    let pi = 3.14159265359;
    let angle = atan2(uv.y, uv.x);
    let dist = length(uv);
    
    // Spiral equation
    let spiral = sin(angle * 3.0 + dist * 10.0) * 0.5 + 0.5;
    let shape = abs(dist - spiral * 0.5) - 0.1;
    
    return smoothstep(0.1, 0.0, shape);
}

@fragment
fn fragmentMain(input: FragmentInput) -> @location(0) vec4<f32> {
    var alpha: f32;
    
    // Render based on shape type
    if (input.shapeType == 0u) {
        // Circle (default)
        let dist = length(input.texCoord - vec2<f32>(0.5, 0.5)) * 2.0;
        alpha = smoothstep(1.0, 0.8, dist);
    } else if (input.shapeType == 1u) {
        // Heart
        let uv = input.texCoord * 2.0 - 1.0;
        alpha = renderHeart(uv);
    } else if (input.shapeType == 2u) {
        // Star
        let uv = input.texCoord * 2.0 - 1.0;
        alpha = renderStar(uv);
    } else if (input.shapeType == 3u) {
        // Paw
        let uv = input.texCoord * 2.0 - 1.0;
        alpha = renderPaw(uv);
    } else if (input.shapeType == 4u) {
        // Spiral
        let uv = input.texCoord * 2.0 - 1.0;
        alpha = renderSpiral(uv);
    } else {
        // Fallback to circle
        let dist = length(input.texCoord - vec2<f32>(0.5, 0.5)) * 2.0;
        alpha = smoothstep(1.0, 0.8, dist);
    }
    
    // Apply particle alpha
    alpha *= input.alpha;
    
    // Discard fully transparent fragments
    if (alpha < 0.01) {
        discard;
    }
    
    // Add glow effect at center
    let dist = length(input.texCoord - vec2<f32>(0.5, 0.5)) * 2.0;
    let glow = 1.0 - smoothstep(0.0, 0.5, dist);
    let glowColor = input.color + vec3<f32>(glow * 0.3);
    
    // Output final color with alpha blending
    return vec4<f32>(glowColor, alpha);
}
