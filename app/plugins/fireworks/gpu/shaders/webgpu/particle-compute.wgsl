// WebGPU Compute Shader - Particle Physics Simulation
// Runs on GPU to update particle positions, velocities, and lifespans

struct Particle {
    position: vec2<f32>,      // X, Y position in pixels
    velocity: vec2<f32>,      // VX, VY velocity
    size: f32,                // Particle size in pixels
    hue: f32,                 // HSL hue (0-360)
    saturation: f32,          // HSL saturation (0-100)
    brightness: f32,          // HSL brightness (0-100)
    alpha: f32,               // Alpha transparency (0-1)
    lifespan: f32,            // Remaining life (0-1, 1=full life, 0=dead)
    decay: f32,               // Decay rate per second
    rotation: f32,            // Current rotation in radians
    rotationSpeed: f32,       // Rotation speed in radians/second
    mass: f32,                // Particle mass for physics
    // Extended fields for advanced features
    willBurst: u32,           // Boolean: will this particle burst into secondary explosion
    burstDelay: f32,          // Delay before burst (seconds)
    burstTime: f32,           // Time when particle was created (for burst timing)
    willSpiral: u32,          // Boolean: spiral motion effect
    spiralDelay: f32,         // Delay before spiral starts
    imageIndex: u32,          // Texture index for gift images (0 = no image)
    shapeType: u32,           // 0=circle, 1=heart, 2=star, 3=paw, 4=spiral
    padding: vec3<f32>,       // Padding for alignment (WGSL requires 16-byte alignment)
}

struct Uniforms {
    deltaTime: f32,           // Time since last frame (seconds)
    gravity: f32,             // Gravity force (pixels/second²)
    airResistance: f32,       // Air resistance factor (0-1)
    currentTime: f32,         // Current simulation time (seconds)
    canvasWidth: f32,         // Canvas width in pixels
    canvasHeight: f32,        // Canvas height in pixels
    padding: vec2<f32>,       // Padding for alignment
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

// Helper function: HSL to RGB conversion (for debugging/visualization)
fn hslToRgb(h: f32, s: f32, l: f32) -> vec3<f32> {
    let hNorm = h / 360.0;
    let sNorm = s / 100.0;
    let lNorm = l / 100.0;
    
    if (sNorm == 0.0) {
        return vec3<f32>(lNorm, lNorm, lNorm);
    }
    
    let q = select(lNorm + sNorm - lNorm * sNorm, lNorm * (1.0 + sNorm), lNorm < 0.5);
    let p = 2.0 * lNorm - q;
    
    // Helper for hue to RGB component
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

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    
    // Bounds check
    if (index >= arrayLength(&particles)) {
        return;
    }
    
    var particle = particles[index];
    
    // Skip dead particles
    if (particle.lifespan <= 0.0) {
        return;
    }
    
    // Apply gravity
    particle.velocity.y += uniforms.gravity * uniforms.deltaTime;
    
    // Apply air resistance
    let resistanceFactor = pow(uniforms.airResistance, uniforms.deltaTime);
    particle.velocity *= resistanceFactor;
    
    // Update position based on velocity
    particle.position += particle.velocity * uniforms.deltaTime;
    
    // Update rotation
    particle.rotation += particle.rotationSpeed * uniforms.deltaTime;
    
    // Wrap rotation to 0-2π range (optional optimization)
    if (particle.rotation > 6.28318530718) {
        particle.rotation -= 6.28318530718;
    } else if (particle.rotation < 0.0) {
        particle.rotation += 6.28318530718;
    }
    
    // Update lifespan
    particle.lifespan -= particle.decay * uniforms.deltaTime;
    
    // Update alpha based on lifespan
    particle.alpha = max(0.0, particle.lifespan);
    
    // Clamp alpha to valid range
    particle.alpha = clamp(particle.alpha, 0.0, 1.0);
    
    // Check for secondary burst trigger
    if (particle.willBurst == 1u) {
        let elapsed = uniforms.currentTime - particle.burstTime;
        if (elapsed >= particle.burstDelay) {
            // Mark as "triggered" - CPU will handle spawning new particles
            particle.willBurst = 2u;
        }
    }
    
    // Spiral effect (optional advanced feature)
    if (particle.willSpiral == 1u) {
        let elapsed = uniforms.currentTime - particle.burstTime;
        if (elapsed >= particle.spiralDelay) {
            // Apply spiral force
            let angle = particle.rotation;
            let spiralForce = 50.0; // Adjust strength
            particle.velocity.x += cos(angle) * spiralForce * uniforms.deltaTime;
            particle.velocity.y += sin(angle) * spiralForce * uniforms.deltaTime;
        }
    }
    
    // Boundary checking (optional - wrap or bounce)
    // Uncomment to enable wrapping:
    /*
    if (particle.position.x < 0.0) {
        particle.position.x += uniforms.canvasWidth;
    } else if (particle.position.x > uniforms.canvasWidth) {
        particle.position.x -= uniforms.canvasWidth;
    }
    
    if (particle.position.y < 0.0) {
        particle.position.y += uniforms.canvasHeight;
    } else if (particle.position.y > uniforms.canvasHeight) {
        particle.position.y -= uniforms.canvasHeight;
    }
    */
    
    // Write updated particle back to storage
    particles[index] = particle;
}
