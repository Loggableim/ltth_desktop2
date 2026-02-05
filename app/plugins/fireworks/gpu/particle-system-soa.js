/**
 * Struct-of-Arrays Particle System - High-Performance Data Layout
 * 
 * Uses separate TypedArrays for each particle attribute for cache-friendly, SIMD-ready data access.
 * Achieves massive performance improvements over Array-of-Structs by improving cache locality.
 * 
 * Features:
 * - Cache-friendly memory layout (all x positions together, all y positions together, etc.)
 * - TypedArrays for CPU optimization and future SIMD possibilities
 * - Bulk update operations minimize pointer chasing
 * - In-place compaction removes dead particles without reallocation
 * - Zero garbage collection pressure during steady state
 * - Direct GPU buffer filling without intermediate transformations
 */

class ParticleSystemSOA {
    /**
     * Struct-of-Arrays particle system for high-performance GPU rendering
     * @param {number} maxParticles - Maximum particle capacity (default 100k = ~8MB memory, matches WebGL engine capacity)
     */
    constructor(maxParticles = 100000) {
        this.max = maxParticles;
        this.count = 0;
        
        // Separate TypedArrays for each attribute - cache-friendly
        // Position and velocity
        this.x = new Float32Array(maxParticles);
        this.y = new Float32Array(maxParticles);
        this.vx = new Float32Array(maxParticles);
        this.vy = new Float32Array(maxParticles);
        
        // Visual properties
        this.size = new Float32Array(maxParticles);
        this.alpha = new Float32Array(maxParticles);
        this.hue = new Float32Array(maxParticles);
        this.saturation = new Float32Array(maxParticles);
        this.brightness = new Float32Array(maxParticles);
        
        // Physics properties
        this.gravity = new Float32Array(maxParticles);
        this.drag = new Float32Array(maxParticles);
        this.decay = new Float32Array(maxParticles);
        
        // Rotation
        this.rotation = new Float32Array(maxParticles);
        this.rotationSpeed = new Float32Array(maxParticles);
        
        // State flags
        this.active = new Uint8Array(maxParticles);
        this.emitTrail = new Uint8Array(maxParticles); // Whether particle emits trail
        this.willExplode = new Uint8Array(maxParticles); // Whether particle will create secondary explosion
        this.isSparkle = new Uint8Array(maxParticles); // Whether particle is a sparkle (for flicker effect)
        
        // Firework association (for tracking which firework owns which particles)
        this.fireworkId = new Uint32Array(maxParticles);
        
        // Trail emission tracking
        this.trailTimer = new Float32Array(maxParticles); // Time since last trail emission
        this.trailInterval = 0.05; // Emit trail every 50ms
        
        // Secondary explosion tracking
        this.age = new Float32Array(maxParticles); // Particle age for explosion timing
        this.explosionDelay = new Float32Array(maxParticles); // Delay before explosion
        this.hasExploded = new Uint8Array(maxParticles); // Already triggered explosion
    }

    /**
     * Bulk position update - SIMD-friendly
     * Updates all particle positions based on velocity and physics
     */
    updatePositions(dt) {
        const count = this.count;
        for (let i = 0; i < count; i++) {
            if (!this.active[i]) continue;
            
            // Apply gravity
            this.vy[i] += this.gravity[i] * dt;
            
            // Apply drag
            const dragFactor = Math.pow(this.drag[i], dt);
            this.vx[i] *= dragFactor;
            this.vy[i] *= dragFactor;
            
            // Update position
            this.x[i] += this.vx[i] * dt;
            this.y[i] += this.vy[i] * dt;
            
            // Update age
            this.age[i] += dt;
        }
    }

    /**
     * Bulk alpha/lifespan update
     * Updates particle alpha values and marks dead particles
     */
    updateAlphas(dt) {
        for (let i = 0; i < this.count; i++) {
            if (!this.active[i]) continue;
            
            // Sparkle flicker effect
            if (this.isSparkle[i] && Math.random() < 0.3) {
                this.brightness[i] = 80 + Math.random() * 20;
            }
            
            // Decay alpha
            this.alpha[i] -= this.decay[i] * dt;
            
            // Mark as inactive if alpha depleted
            if (this.alpha[i] <= 0) {
                this.active[i] = 0;
            }
        }
    }

    /**
     * Bulk rotation update
     * Updates particle rotations
     */
    updateRotations(dt) {
        for (let i = 0; i < this.count; i++) {
            if (!this.active[i]) continue;
            this.rotation[i] += this.rotationSpeed[i] * dt;
        }
    }

    /**
     * Update trail emission and create trail particles
     * Should be called after updatePositions
     */
    updateTrails(dt) {
        const trailsToEmit = [];
        
        for (let i = 0; i < this.count; i++) {
            if (!this.active[i] || !this.emitTrail[i]) continue;
            
            // Update trail timer
            this.trailTimer[i] += dt;
            
            // Emit trail particle if interval reached
            if (this.trailTimer[i] >= this.trailInterval) {
                this.trailTimer[i] = 0;
                
                // Store trail data (emit after loop to avoid modifying array during iteration)
                trailsToEmit.push({
                    x: this.x[i],
                    y: this.y[i],
                    size: this.size[i] * 0.6,
                    alpha: this.alpha[i] * 0.5,
                    hue: this.hue[i],
                    saturation: this.saturation[i],
                    brightness: this.brightness[i] * 0.8,
                    decay: 0.02, // Trails fade faster
                    rotation: this.rotation[i],
                    rotationSpeed: 0,
                    gravity: 0,
                    drag: 1.0, // Trails don't move
                    fireworkId: this.fireworkId[i],
                    emitTrail: false
                });
            }
        }
        
        // Emit all collected trail particles
        for (const trail of trailsToEmit) {
            this.emit(trail);
        }
    }

    /**
     * Check for and trigger secondary explosions
     * Should be called after updatePositions
     * @returns {Array} List of explosion data for new particles
     */
    updateSecondaryExplosions() {
        const explosions = [];
        
        for (let i = 0; i < this.count; i++) {
            if (!this.active[i] || !this.willExplode[i] || this.hasExploded[i]) continue;
            
            // Check if enough time has passed
            if (this.age[i] >= this.explosionDelay[i]) {
                this.hasExploded[i] = 1;
                
                // Store explosion data
                explosions.push({
                    x: this.x[i],
                    y: this.y[i],
                    hue: this.hue[i],
                    fireworkId: this.fireworkId[i]
                });
            }
        }
        
        return explosions;
    }

    /**
     * Create secondary explosion particles
     * @param {Object} explosion - Explosion data from updateSecondaryExplosions
     */
    createSecondaryExplosion(explosion) {
        const count = 8 + Math.floor(Math.random() * 12);
        const baseGravity = 0.08; // Default gravity value
        
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 1 + Math.random() * 2;
            
            this.emit({
                x: explosion.x,
                y: explosion.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 1 + Math.random() * 2,
                alpha: 1,
                hue: explosion.hue + (Math.random() - 0.5) * 30,
                saturation: 100,
                brightness: 100,
                decay: 0.02,
                gravity: baseGravity * 0.6,
                drag: 0.96,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.2,
                fireworkId: explosion.fireworkId,
                emitTrail: false,
                willExplode: false
            });
        }
    }

    /**
     * Emit a new particle
     * @param {Object} props - Particle properties
     * @returns {number} Index of the particle, or -1 if pool is full
     */
    emit(props) {
        // Try to compact if at capacity
        if (this.count >= this.max) {
            this.compact();
        }
        
        // Still full after compaction
        if (this.count >= this.max) {
            return -1;
        }
        
        const i = this.count++;
        
        // Set all properties with defaults
        this.x[i] = props.x || 0;
        this.y[i] = props.y || 0;
        this.vx[i] = props.vx || 0;
        this.vy[i] = props.vy || 0;
        this.size[i] = props.size || 3;
        this.alpha[i] = props.alpha !== undefined ? props.alpha : 1;
        this.hue[i] = props.hue || 0;
        this.saturation[i] = props.saturation !== undefined ? props.saturation : 100;
        this.brightness[i] = props.brightness !== undefined ? props.brightness : 100;
        this.decay[i] = props.decay || 0.01;
        this.rotation[i] = props.rotation || 0;
        this.rotationSpeed[i] = props.rotationSpeed || 0;
        this.gravity[i] = props.gravity !== undefined ? props.gravity : 0.2;
        this.drag[i] = props.drag !== undefined ? props.drag : 0.98;
        this.active[i] = 1;
        this.fireworkId[i] = props.fireworkId || 0;
        this.emitTrail[i] = props.emitTrail ? 1 : 0;
        this.trailTimer[i] = 0;
        this.willExplode[i] = props.willExplode ? 1 : 0;
        this.age[i] = 0;
        this.explosionDelay[i] = props.explosionDelay || 0.5;
        this.hasExploded[i] = 0;
        this.isSparkle[i] = props.isSparkle ? 1 : 0;
        
        return i;
    }

    /**
     * Compact the arrays by removing inactive particles
     * Uses in-place compaction algorithm - O(n) time, O(1) space
     */
    compact() {
        let writeIdx = 0;
        
        for (let readIdx = 0; readIdx < this.count; readIdx++) {
            if (this.active[readIdx]) {
                if (writeIdx !== readIdx) {
                    // Copy all arrays
                    this.x[writeIdx] = this.x[readIdx];
                    this.y[writeIdx] = this.y[readIdx];
                    this.vx[writeIdx] = this.vx[readIdx];
                    this.vy[writeIdx] = this.vy[readIdx];
                    this.size[writeIdx] = this.size[readIdx];
                    this.alpha[writeIdx] = this.alpha[readIdx];
                    this.hue[writeIdx] = this.hue[readIdx];
                    this.saturation[writeIdx] = this.saturation[readIdx];
                    this.brightness[writeIdx] = this.brightness[readIdx];
                    this.decay[writeIdx] = this.decay[readIdx];
                    this.rotation[writeIdx] = this.rotation[readIdx];
                    this.rotationSpeed[writeIdx] = this.rotationSpeed[readIdx];
                    this.gravity[writeIdx] = this.gravity[readIdx];
                    this.drag[writeIdx] = this.drag[readIdx];
                    this.fireworkId[writeIdx] = this.fireworkId[readIdx];
                    this.emitTrail[writeIdx] = this.emitTrail[readIdx];
                    this.trailTimer[writeIdx] = this.trailTimer[readIdx];
                    this.willExplode[writeIdx] = this.willExplode[readIdx];
                    this.age[writeIdx] = this.age[readIdx];
                    this.explosionDelay[writeIdx] = this.explosionDelay[readIdx];
                    this.hasExploded[writeIdx] = this.hasExploded[readIdx];
                    this.isSparkle[writeIdx] = this.isSparkle[readIdx];
                    this.active[writeIdx] = 1;
                }
                writeIdx++;
            }
        }
        
        this.count = writeIdx;
    }

    /**
     * Count active particles for a specific firework
     * @param {number} id - Firework ID
     * @returns {number} Count of active particles
     */
    countByFirework(id) {
        let count = 0;
        for (let i = 0; i < this.count; i++) {
            if (this.active[i] && this.fireworkId[i] === id) {
                count++;
            }
        }
        return count;
    }

    /**
     * Fill GPU buffer with active particle data
     * Directly writes particle data in the format expected by WebGL
     * @param {Float32Array} buffer - Target buffer (must be large enough)
     * @returns {number} Number of active particles written
     */
    fillGPUBuffer(buffer) {
        let offset = 0;
        
        for (let i = 0; i < this.count; i++) {
            if (!this.active[i]) continue;
            
            // 8 floats per particle: x, y, size, alpha, hue, sat, bright, rotation
            buffer[offset++] = this.x[i];
            buffer[offset++] = this.y[i];
            buffer[offset++] = this.size[i];
            buffer[offset++] = this.alpha[i];
            buffer[offset++] = this.hue[i];
            buffer[offset++] = this.saturation[i];
            buffer[offset++] = this.brightness[i];
            buffer[offset++] = this.rotation[i];
        }
        
        // Return number of particles written
        return offset / 8;
    }

    /**
     * Clear all particles
     */
    clear() {
        this.count = 0;
        this.active.fill(0);
    }

    /**
     * Get statistics about the particle system
     */
    getStats() {
        let activeCount = 0;
        for (let i = 0; i < this.count; i++) {
            if (this.active[i]) activeCount++;
        }
        
        return {
            total: this.count,
            active: activeCount,
            inactive: this.count - activeCount,
            capacity: this.max,
            utilization: (this.count / this.max * 100).toFixed(1) + '%'
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParticleSystemSOA;
}
