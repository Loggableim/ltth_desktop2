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
    constructor(maxParticles = 50000) {
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
        
        // Firework association (for tracking which firework owns which particles)
        this.fireworkId = new Uint32Array(maxParticles);
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
        }
    }

    /**
     * Bulk alpha/lifespan update
     * Updates particle alpha values and marks dead particles
     */
    updateAlphas(dt) {
        for (let i = 0; i < this.count; i++) {
            if (!this.active[i]) continue;
            
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
