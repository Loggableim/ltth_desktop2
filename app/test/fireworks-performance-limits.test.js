/**
 * Fireworks Performance Limits Test
 * Tests the new performance limit features including concurrent fireworks limits,
 * particle limits, emergency cleanup, and adaptive frame skip
 */

describe('Fireworks Performance Limits', () => {
    let mainCode;
    let engineCode;

    // Load the plugin code once before all tests
    beforeAll(() => {
        const fs = require('fs');
        mainCode = fs.readFileSync('./plugins/fireworks/main.js', 'utf-8');
        engineCode = fs.readFileSync('./plugins/fireworks/gpu/engine.js', 'utf-8');
    });

    describe('Configuration Properties', () => {
        test('should define maxConcurrentFireworks in config', () => {
            expect(mainCode).toContain('maxConcurrentFireworks: 5');
            expect(mainCode).toContain('Maximum gleichzeitige Fireworks');
        });

        test('should define maxTotalParticles in config', () => {
            expect(mainCode).toContain('maxTotalParticles: 800');
            expect(mainCode).toContain('Maximum Partikel global');
        });

        test('should define emergencyCleanupThreshold in config', () => {
            expect(mainCode).toContain('emergencyCleanupThreshold: 1000');
            expect(mainCode).toContain('Emergency Cleanup');
        });

        test('should define adaptivePerformance in config', () => {
            expect(mainCode).toContain('adaptivePerformance: true');
            expect(mainCode).toContain('Aktiviere Adaptive Performance');
        });

        test('should define minTargetFps in config', () => {
            expect(mainCode).toContain('minTargetFps: 30');
            expect(mainCode).toContain('Minimum FPS bevor Frame Skip');
        });

        test('should define frameSkipEnabled in config', () => {
            expect(mainCode).toContain('frameSkipEnabled: true');
            expect(mainCode).toContain('Aktiviere Frame Skip');
        });
    });

    describe('Hard Firework Limits in main.js', () => {
        test('should check concurrent firework limit in handleGiftEvent', () => {
            expect(mainCode).toContain('getActiveFireworkCount()');
            expect(mainCode).toContain('activeFireworks >= this.config.maxConcurrentFireworks');
            expect(mainCode).toContain('Limit erreicht');
        });

        test('should skip low-value gifts at 60% threshold', () => {
            expect(mainCode).toContain('Math.floor(this.config.maxConcurrentFireworks * 0.6)');
            expect(mainCode).toContain('coins < 500');
            expect(mainCode).toContain('Hohe Last');
        });

        test('should have getActiveFireworkCount method', () => {
            expect(mainCode).toContain('getActiveFireworkCount()');
            expect(mainCode).toContain('cachedActiveFireworkCount');
            expect(mainCode).toContain('fireworks:get-active-count');
        });

        test('should handle active-count-response socket event', () => {
            expect(mainCode).toContain('fireworks:active-count-response');
            expect(mainCode).toContain('cachedActiveFireworkCount = data.count');
        });
    });

    describe('Aggressive Particle Limits in engine.js', () => {
        test('should initialize MAX_FIREWORKS, MAX_PARTICLES, EMERGENCY_CLEANUP_THRESHOLD', () => {
            expect(engineCode).toContain('this.MAX_FIREWORKS = 5');
            expect(engineCode).toContain('this.MAX_PARTICLES = 800');
            expect(engineCode).toContain('this.EMERGENCY_CLEANUP_THRESHOLD = 1000');
        });

        test('should update limits from config in config-update handler', () => {
            expect(engineCode).toContain('data.config.maxConcurrentFireworks');
            expect(engineCode).toContain('this.MAX_FIREWORKS = data.config.maxConcurrentFireworks');
            expect(engineCode).toContain('data.config.maxTotalParticles');
            expect(engineCode).toContain('this.MAX_PARTICLES = data.config.maxTotalParticles');
            expect(engineCode).toContain('data.config.emergencyCleanupThreshold');
            expect(engineCode).toContain('this.EMERGENCY_CLEANUP_THRESHOLD');
        });

        test('should reject fireworks when MAX_FIREWORKS limit reached', () => {
            expect(engineCode).toContain('this.fireworks.length >= this.MAX_FIREWORKS');
            expect(engineCode).toContain('MAX_FIREWORKS limit reached');
        });

        test('should reject fireworks when particles exceed 80% threshold', () => {
            expect(engineCode).toContain('currentParticles > this.MAX_PARTICLES * 0.8');
            expect(engineCode).toContain('Particle limit approaching');
        });

        test('should reduce intensity at 60% particle threshold', () => {
            expect(engineCode).toContain('currentParticles > this.MAX_PARTICLES * 0.6');
            expect(engineCode).toContain('adjustedIntensity = intensity * 0.5');
            expect(engineCode).toContain('reducing intensity by 50%');
        });

        test('should use adjusted intensity for firework creation', () => {
            expect(engineCode).toContain('intensity: adjustedIntensity');
        });

        test('should respond to get-active-count socket event', () => {
            expect(engineCode).toContain('fireworks:get-active-count');
            expect(engineCode).toContain('fireworks:active-count-response');
            expect(engineCode).toContain('count: this.fireworks.length');
            expect(engineCode).toContain('particles: this.getTotalParticles()');
        });
    });

    describe('Emergency Particle Cleanup', () => {
        test('should check particles at start of render loop', () => {
            expect(engineCode).toContain('const totalParticles = this.getTotalParticles()');
            expect(engineCode).toContain('totalParticles > this.EMERGENCY_CLEANUP_THRESHOLD');
        });

        test('should trigger emergency cleanup when threshold exceeded', () => {
            expect(engineCode).toContain('EMERGENCY:');
            expect(engineCode).toContain('particles! Force cleanup');
        });

        test('should remove 50% of exploded fireworks', () => {
            expect(engineCode).toContain('explodedFW = this.fireworks.filter(fw => fw.exploded)');
            expect(engineCode).toContain('Math.ceil(explodedFW.length * 0.5)');
        });

        test('should release particles to pool during cleanup', () => {
            expect(engineCode).toContain('this.particlePool.releaseAll(fw.particles)');
            expect(engineCode).toContain('fw.particles = []');
        });

        test('should log cleanup completion', () => {
            expect(engineCode).toContain('Emergency cleanup: Removed');
        });
    });

    describe('Adaptive Frame Skip', () => {
        test('should initialize frame skip state variables', () => {
            expect(engineCode).toContain('this.adaptivePerformance = true');
            expect(engineCode).toContain('this.minTargetFps = 30');
            expect(engineCode).toContain('this.frameSkipEnabled = true');
            expect(engineCode).toContain('this.frameSkip = 0');
            expect(engineCode).toContain('this.adaptiveFpsHistory = []');
        });

        test('should update adaptive performance settings from config', () => {
            expect(engineCode).toContain('data.config.adaptivePerformance');
            expect(engineCode).toContain('this.adaptivePerformance = data.config.adaptivePerformance');
            expect(engineCode).toContain('data.config.minTargetFps');
            expect(engineCode).toContain('this.minTargetFps = data.config.minTargetFps');
            expect(engineCode).toContain('data.config.frameSkipEnabled');
            expect(engineCode).toContain('this.frameSkipEnabled = data.config.frameSkipEnabled');
        });

        test('should track FPS history (30 frames)', () => {
            expect(engineCode).toContain('this.adaptiveFpsHistory.push(currentFPS)');
            expect(engineCode).toContain('this.adaptiveFpsHistory.length > 30');
            expect(engineCode).toContain('this.adaptiveFpsHistory.shift()');
        });

        test('should calculate average FPS', () => {
            expect(engineCode).toContain('const avgFPS = this.adaptiveFpsHistory.reduce((a, b) => a + b, 0) / this.adaptiveFpsHistory.length');
        });

        test('should skip every 2nd frame when FPS below minTargetFps', () => {
            expect(engineCode).toContain('avgFPS < this.minTargetFps');
            expect(engineCode).toContain('this.frameSkip++');
            expect(engineCode).toContain('this.frameSkip % 2 === 0');
        });

        test('should reset frame skip counter when FPS recovers', () => {
            expect(engineCode).toContain('this.frameSkip = 0');
        });
    });

    describe('UI Controls', () => {
        let settingsHtml;
        let settingsJs;

        beforeAll(() => {
            const fs = require('fs');
            settingsHtml = fs.readFileSync('./plugins/fireworks/ui/settings.html', 'utf-8');
            settingsJs = fs.readFileSync('./plugins/fireworks/ui/settings.js', 'utf-8');
        });

        test('should have Performance Limits card in HTML', () => {
            expect(settingsHtml).toContain('Performance Limits');
            expect(settingsHtml).toContain('data-i18n="fireworks.performance_limits"');
        });

        test('should have max-fireworks slider', () => {
            expect(settingsHtml).toContain('id="max-fireworks"');
            expect(settingsHtml).toContain('min="1"');
            expect(settingsHtml).toContain('max="20"');
            expect(settingsHtml).toContain('id="max-fireworks-value"');
        });

        test('should have max-particles-limit slider', () => {
            expect(settingsHtml).toContain('id="max-particles-limit"');
            expect(settingsHtml).toContain('min="200"');
            expect(settingsHtml).toContain('max="2000"');
            expect(settingsHtml).toContain('step="100"');
        });

        test('should have emergency-threshold slider', () => {
            expect(settingsHtml).toContain('id="emergency-threshold"');
            expect(settingsHtml).toContain('min="500"');
            expect(settingsHtml).toContain('max="3000"');
        });

        test('should have adaptive-toggle', () => {
            expect(settingsHtml).toContain('id="adaptive-toggle"');
            expect(settingsHtml).toContain('data-config="adaptivePerformance"');
        });

        test('should have min-target-fps slider', () => {
            expect(settingsHtml).toContain('id="min-target-fps"');
            expect(settingsHtml).toContain('min="20"');
            expect(settingsHtml).toContain('max="50"');
        });

        test('should have frame-skip-toggle', () => {
            expect(settingsHtml).toContain('id="frame-skip-toggle"');
            expect(settingsHtml).toContain('data-config="frameSkipEnabled"');
        });

        test('should load performance limits in updateUI', () => {
            expect(settingsJs).toContain('config.maxConcurrentFireworks');
            expect(settingsJs).toContain('config.maxTotalParticles');
            expect(settingsJs).toContain('config.emergencyCleanupThreshold');
            expect(settingsJs).toContain('config.minTargetFps');
            expect(settingsJs).toContain('config.adaptivePerformance');
            expect(settingsJs).toContain('config.frameSkipEnabled');
        });

        test('should setup event listeners for performance sliders', () => {
            expect(settingsJs).toContain("setupRangeSlider('max-fireworks'");
            expect(settingsJs).toContain("setupRangeSlider('max-particles-limit'");
            expect(settingsJs).toContain("setupRangeSlider('emergency-threshold'");
            expect(settingsJs).toContain("setupRangeSlider('min-target-fps'");
        });

        test('should setup event listeners for performance toggles', () => {
            expect(settingsJs).toContain("document.getElementById('adaptive-toggle')");
            expect(settingsJs).toContain("document.getElementById('frame-skip-toggle')");
        });
    });

    describe('Localization', () => {
        test('should have German translations', () => {
            const fs = require('fs');
            const de = JSON.parse(fs.readFileSync('./plugins/fireworks/locales/de.json', 'utf-8'));
            
            expect(de.fireworks.performance_limits).toBeDefined();
            expect(de.fireworks.performance_info).toBeDefined();
            expect(de.fireworks.max_concurrent_fireworks).toBeDefined();
            expect(de.fireworks.max_total_particles).toBeDefined();
            expect(de.fireworks.emergency_cleanup_threshold).toBeDefined();
            expect(de.fireworks.adaptive_performance).toBeDefined();
            expect(de.fireworks.min_target_fps).toBeDefined();
            expect(de.fireworks.frame_skip_info).toBeDefined();
            expect(de.fireworks.enable_frame_skip).toBeDefined();
        });

        test('should have English translations', () => {
            const fs = require('fs');
            const en = JSON.parse(fs.readFileSync('./plugins/fireworks/locales/en.json', 'utf-8'));
            
            expect(en.fireworks.performance_limits).toBeDefined();
            expect(en.fireworks.performance_info).toBeDefined();
            expect(en.fireworks.max_concurrent_fireworks).toBeDefined();
            expect(en.fireworks.max_total_particles).toBeDefined();
            expect(en.fireworks.emergency_cleanup_threshold).toBeDefined();
            expect(en.fireworks.adaptive_performance).toBeDefined();
            expect(en.fireworks.min_target_fps).toBeDefined();
            expect(en.fireworks.frame_skip_info).toBeDefined();
            expect(en.fireworks.enable_frame_skip).toBeDefined();
        });

        test('should have French translations', () => {
            const fs = require('fs');
            const fr = JSON.parse(fs.readFileSync('./plugins/fireworks/locales/fr.json', 'utf-8'));
            
            expect(fr.fireworks.performance_limits).toBeDefined();
            expect(fr.fireworks.performance_info).toBeDefined();
        });

        test('should have Spanish translations', () => {
            const fs = require('fs');
            const es = JSON.parse(fs.readFileSync('./plugins/fireworks/locales/es.json', 'utf-8'));
            
            expect(es.fireworks.performance_limits).toBeDefined();
            expect(es.fireworks.performance_info).toBeDefined();
        });
    });
});
