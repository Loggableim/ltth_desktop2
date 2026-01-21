// WebGPU Vertex Shader - Particle Rendering
// Transforms particles from screen space to clip space

struct Particle {
    @location(0) position: vec2<f32>,
    @location(1) velocity: vec2<f32>,
    @location(2) size: f32,
    @location(3) hue: f32,
    @location(4) saturation: f32,
    @location(5) brightness: f32,
    @location(6) alpha: f32,
    @location(7) rotation: f32,
}

struct VertexInput {
    @location(8) corner: vec2<f32>,  // Quad corner: (-1,-1), (1,-1), (1,1), (-1,1)
    @builtin(instance_index) instanceIndex: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
    @location(1) alpha: f32,
    @location(2) texCoord: vec2<f32>,
    @location(3) shapeType: u32,
}

struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    padding: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// HSL to RGB conversion
fn hslToRgb(h: f32, s: f32, l: f32) -> vec3<f32> {
    let hNorm = h / 360.0;
    let sNorm = s / 100.0;
    let lNorm = l / 100.0;
    
    if (sNorm == 0.0) {
        return vec3<f32>(lNorm, lNorm, lNorm);
    }
    
    let q = select(lNorm + sNorm - lNorm * sNorm, lNorm * (1.0 + sNorm), lNorm < 0.5);
    let p = 2.0 * lNorm - q;
    
    fn hue2rgb(p: f32, q: f32, t: f32) -> f32 {
        var tMod = t;
        if (tMod < 0.0) { tMod += 1.0; }
        if (tMod > 1.0) { tMod -= 1.0; }
        if (tMod < 1.0/6.0) { return p + (q - p) * 6.0 * tMod; }
        if (tMod < 1.0/2.0) { return q; }
        if (tMod < 2.0/3.0) { return p + (q - p) * (2.0/3.0 - tMod) * 6.0; }
        return p;
    }
    
    return vec3<f32>(
        hue2rgb(p, q, hNorm + 1.0/3.0),
        hue2rgb(p, q, hNorm),
        hue2rgb(p, q, hNorm - 1.0/3.0)
    );
}

@vertex
fn vertexMain(
    particle: Particle,
    input: VertexInput
) -> VertexOutput {
    var output: VertexOutput;
    
    // Rotate corner around origin
    let c = cos(particle.rotation);
    let s = sin(particle.rotation);
    let rotated = vec2<f32>(
        input.corner.x * c - input.corner.y * s,
        input.corner.x * s + input.corner.y * c
    );
    
    // Scale by particle size
    let offset = rotated * particle.size;
    
    // Calculate final position in pixels
    let pixelPos = particle.position + offset;
    
    // Convert to normalized device coordinates (NDC)
    var ndcPos = (pixelPos / uniforms.resolution) * 2.0 - 1.0;
    ndcPos.y *= -1.0; // Flip Y axis
    
    output.position = vec4<f32>(ndcPos, 0.0, 1.0);
    
    // Convert HSL to RGB
    output.color = hslToRgb(particle.hue, particle.saturation, particle.brightness);
    output.alpha = particle.alpha;
    
    // Texture coordinates for circle shape
    output.texCoord = input.corner * 0.5 + 0.5; // Convert from [-1,1] to [0,1]
    
    // Shape type (for future extension)
    output.shapeType = 0u; // 0 = circle
    
    return output;
}
