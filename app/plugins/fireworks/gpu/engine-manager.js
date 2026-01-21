/**
 * Fireworks Engine Manager - Multi-Backend Selector
 * 
 * Manages backend selection with automatic fallback:
 * 1. WebGPU (best performance, Chrome 113+)
 * 2. WebGL 2 (good performance, wide support)
 * 3. Canvas 2D (fallback, universal support)
 * 
 * Features:
 * - Automatic backend detection
 * - Graceful fallback on errors
 * - Feature parity across all backends
 * - Performance monitoring and reporting
 * - Web Worker integration
 */

'use strict';

// Debug flag
const DEBUG = false;

class FireworksEngineManager {
    constructor(canvasId, config = {}) {
        this.canvasId = canvasId;
        this.config = {
            preferredBackend: config.preferredBackend || 'auto', // 'auto', 'webgpu', 'webgl', 'canvas2d'
            useWorker: config.useWorker !== false, // Default: true
            ...config
        };
        
        this.backend = null;
        this.backendType = null; // 'webgpu' | 'webgl' | 'canvas2d'
        this.worker = null;
        this.initError = null;
        
        // Performance tracking
        this.stats = {
            backend: null,
            workerEnabled: false,
            fps: 0,
            particles: 0,
            detectionTime: 0
        };
    }
    
    /**
     * Initialize the engine with best available backend
     */
    async init() {
        const startTime = performance.now();
        
        try {
            // Try to initialize Web Worker first if enabled
            if (this.config.useWorker && typeof Worker !== 'undefined') {
                await this.initWorker();
            }
            
            // Determine and initialize backend
            await this.selectBackend();
            
            // Initialize the selected backend
            if (this.backend) {
                await this.backend.init();
                
                this.stats.backend = this.backendType;
                this.stats.workerEnabled = this.worker !== null;
                this.stats.detectionTime = performance.now() - startTime;
                
                if (DEBUG) {
                    console.log(`[Engine Manager] Initialized ${this.backendType} backend in ${this.stats.detectionTime.toFixed(2)}ms`);
                    console.log(`[Engine Manager] Worker: ${this.stats.workerEnabled ? 'enabled' : 'disabled'}`);
                }
                
                // Update UI with backend info
                this.updateBackendInfo();
                
                return true;
            }
        } catch (error) {
            console.error('[Engine Manager] Initialization failed:', error);
            this.initError = error;
            
            // Last resort: try Canvas 2D without worker
            if (this.backendType !== 'canvas2d') {
                console.warn('[Engine Manager] Attempting Canvas 2D fallback...');
                return this.fallbackToCanvas2D();
            }
        }
        
        return false;
    }
    
    /**
     * Select the best available backend
     */
    async selectBackend() {
        const preferred = this.config.preferredBackend;
        
        if (preferred === 'auto') {
            // Auto-detect best available
            if (await this.checkWebGPU()) {
                await this.initWebGPU();
            } else if (this.checkWebGL2()) {
                await this.initWebGL();
            } else {
                await this.initCanvas2D();
            }
        } else if (preferred === 'webgpu') {
            if (await this.checkWebGPU()) {
                await this.initWebGPU();
            } else {
                console.warn('[Engine Manager] WebGPU requested but not available, falling back');
                await this.selectBackend(); // Re-run with auto
            }
        } else if (preferred === 'webgl') {
            if (this.checkWebGL2()) {
                await this.initWebGL();
            } else {
                console.warn('[Engine Manager] WebGL 2 requested but not available, falling back');
                await this.initCanvas2D();
            }
        } else {
            // Canvas 2D explicitly requested or unknown value
            await this.initCanvas2D();
        }
    }
    
    /**
     * Check if WebGPU is available
     */
    async checkWebGPU() {
        if (!navigator.gpu) {
            if (DEBUG) console.log('[Engine Manager] navigator.gpu not available');
            return false;
        }
        
        try {
            const adapter = await navigator.gpu.requestAdapter({
                powerPreference: 'high-performance'
            });
            
            if (!adapter) {
                if (DEBUG) console.log('[Engine Manager] WebGPU adapter request failed');
                return false;
            }
            
            if (DEBUG) console.log('[Engine Manager] WebGPU available:', adapter);
            return true;
        } catch (error) {
            if (DEBUG) console.log('[Engine Manager] WebGPU check failed:', error);
            return false;
        }
    }
    
    /**
     * Check if WebGL 2 is available
     */
    checkWebGL2() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        const available = gl !== null;
        
        if (DEBUG) console.log('[Engine Manager] WebGL 2 available:', available);
        
        if (gl) {
            // Check for required extensions
            const requiredExtensions = [
                'EXT_color_buffer_float', // For float textures
                'OES_texture_float_linear' // For texture filtering
            ];
            
            for (const ext of requiredExtensions) {
                if (!gl.getExtension(ext)) {
                    if (DEBUG) console.warn(`[Engine Manager] Missing WebGL extension: ${ext}`);
                }
            }
        }
        
        return available;
    }
    
    /**
     * Initialize WebGPU backend
     */
    async initWebGPU() {
        if (DEBUG) console.log('[Engine Manager] Initializing WebGPU backend...');
        
        // Dynamically import WebGPU backend
        const module = await import('./engine-webgpu.js');
        const WebGPUBackend = module.default || module.FireworksEngineWebGPU;
        
        this.backend = new WebGPUBackend(this.canvasId, this.config);
        this.backendType = 'webgpu';
    }
    
    /**
     * Initialize WebGL backend
     */
    async initWebGL() {
        if (DEBUG) console.log('[Engine Manager] Initializing WebGL backend...');
        
        // Dynamically import WebGL backend
        const module = await import('./engine-webgl.js');
        const WebGLBackend = module.default || module.FireworksEngineWebGL;
        
        this.backend = new WebGLBackend(this.canvasId, this.config);
        this.backendType = 'webgl';
    }
    
    /**
     * Initialize Canvas 2D backend
     */
    async initCanvas2D() {
        if (DEBUG) console.log('[Engine Manager] Initializing Canvas 2D backend...');
        
        // Import Canvas 2D backend (renamed from engine.js)
        // For now, we'll use the existing engine.js directly
        // In production, this would import from engine-canvas2d.js
        this.backend = new FireworksEngine(this.canvasId);
        
        // Apply config
        if (this.backend.config) {
            Object.assign(this.backend.config, this.config);
        }
        
        this.backendType = 'canvas2d';
    }
    
    /**
     * Fallback to Canvas 2D after error
     */
    async fallbackToCanvas2D() {
        try {
            this.config.useWorker = false; // Disable worker for safety
            await this.initCanvas2D();
            
            if (this.backend) {
                await this.backend.init();
                this.stats.backend = this.backendType;
                this.stats.workerEnabled = false;
                this.updateBackendInfo();
                
                console.log('[Engine Manager] Successfully fell back to Canvas 2D');
                return true;
            }
        } catch (error) {
            console.error('[Engine Manager] Canvas 2D fallback failed:', error);
            return false;
        }
    }
    
    /**
     * Initialize Web Worker
     */
    async initWorker() {
        try {
            const workerPath = '/plugins/fireworks/gpu/fireworks-worker.js';
            this.worker = new Worker(workerPath);
            
            this.worker.onmessage = (e) => this.handleWorkerMessage(e);
            this.worker.onerror = (e) => this.handleWorkerError(e);
            
            // Send initial config to worker
            this.worker.postMessage({
                type: 'init',
                data: { config: this.config }
            });
            
            if (DEBUG) console.log('[Engine Manager] Web Worker initialized');
        } catch (error) {
            console.warn('[Engine Manager] Failed to initialize worker:', error);
            this.worker = null;
        }
    }
    
    /**
     * Handle messages from Web Worker
     */
    handleWorkerMessage(e) {
        const { type, data } = e.data;
        
        switch (type) {
            case 'frame':
                // Worker sent particle data for rendering
                if (this.backend && this.backend.renderFromWorker) {
                    this.backend.renderFromWorker(data);
                }
                break;
                
            case 'stats':
                // Update performance stats
                this.stats.fps = data.fps;
                this.stats.particles = data.particles;
                break;
                
            case 'error':
                console.error('[Engine Manager] Worker error:', data);
                break;
        }
    }
    
    /**
     * Handle Web Worker errors
     */
    handleWorkerError(e) {
        console.error('[Engine Manager] Worker error event:', e);
        
        // Disable worker and continue with main thread
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.stats.workerEnabled = false;
            
            console.warn('[Engine Manager] Worker terminated, continuing on main thread');
        }
    }
    
    /**
     * Update UI with backend information
     */
    updateBackendInfo() {
        const rendererElement = document.getElementById('renderer-type');
        const workerStatusElement = document.getElementById('worker-status');
        const currentBackendElement = document.getElementById('current-backend');
        
        if (rendererElement) {
            const backendNames = {
                'webgpu': 'WebGPU',
                'webgl': 'WebGL 2',
                'canvas2d': 'Canvas 2D'
            };
            rendererElement.textContent = backendNames[this.backendType] || this.backendType;
        }
        
        if (workerStatusElement) {
            workerStatusElement.textContent = this.stats.workerEnabled ? 'Active' : 'Disabled';
        }
        
        if (currentBackendElement) {
            currentBackendElement.textContent = `${this.backendType.toUpperCase()} ${this.stats.workerEnabled ? '+ Worker' : '(Main Thread)'}`;
        }
    }
    
    /**
     * Trigger firework (delegates to backend or worker)
     */
    trigger(data) {
        if (this.worker) {
            // Send to worker thread
            this.worker.postMessage({
                type: 'trigger',
                data: data
            });
        } else if (this.backend && this.backend.handleTrigger) {
            // Direct backend call
            this.backend.handleTrigger(data);
        }
    }
    
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        
        if (this.worker) {
            this.worker.postMessage({
                type: 'config-update',
                data: newConfig
            });
        }
        
        if (this.backend && this.backend.config) {
            Object.assign(this.backend.config, newConfig);
            
            // Apply performance mode changes
            if (this.backend.applyPerformanceMode) {
                this.backend.applyPerformanceMode();
            }
        }
    }
    
    /**
     * Get current backend statistics
     */
    getStats() {
        if (this.backend) {
            return {
                ...this.stats,
                fps: this.backend.fps || 0,
                particles: this.backend.fireworks ? 
                    this.backend.fireworks.reduce((sum, fw) => sum + fw.particles.length, 0) : 0,
                fireworks: this.backend.fireworks ? this.backend.fireworks.length : 0,
                performanceMode: this.backend.performanceMode || 'normal'
            };
        }
        return this.stats;
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        
        if (this.backend && this.backend.destroy) {
            this.backend.destroy();
        }
        
        this.backend = null;
        this.backendType = null;
    }
}

// Export for use in overlay.html
if (typeof window !== 'undefined') {
    window.FireworksEngineManager = FireworksEngineManager;
}

// Export for ES6 modules
export default FireworksEngineManager;

// Export for CommonJS (Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FireworksEngineManager;
}
