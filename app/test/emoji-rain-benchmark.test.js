/**
 * Emoji Rain Benchmark Feature Tests
 * 
 * Tests the FPS benchmarking and auto-optimization functionality
 */

const assert = require('assert');

describe('Emoji Rain Benchmark', () => {
    describe('Benchmark Configuration', () => {
        it('should have 5 benchmark test configurations', () => {
            // Load the engine file to access BENCHMARK_TESTS
            const fs = require('fs');
            const path = require('path');
            const enginePath = path.join(__dirname, '..', 'public', 'js', 'emoji-rain-engine.js');
            const engineCode = fs.readFileSync(enginePath, 'utf8');
            
            // Check if BENCHMARK_TESTS exists and has correct structure
            assert(engineCode.includes('const BENCHMARK_TESTS'), 'BENCHMARK_TESTS should be defined');
            assert(engineCode.includes('Maximum Quality'), 'Should have Maximum Quality preset');
            assert(engineCode.includes('High Quality'), 'Should have High Quality preset');
            assert(engineCode.includes('Medium Quality'), 'Should have Medium Quality preset');
            assert(engineCode.includes('Low Quality'), 'Should have Low Quality preset');
            assert(engineCode.includes('Minimal Quality'), 'Should have Minimal Quality preset');
        });

        it('should have benchmark functions defined', () => {
            const fs = require('fs');
            const path = require('path');
            const enginePath = path.join(__dirname, '..', 'public', 'js', 'emoji-rain-engine.js');
            const engineCode = fs.readFileSync(enginePath, 'utf8');
            
            // Check if key benchmark functions exist
            assert(engineCode.includes('function startBenchmark'), 'startBenchmark function should exist');
            assert(engineCode.includes('function runBenchmarkTest'), 'runBenchmarkTest function should exist');
            assert(engineCode.includes('function recordBenchmarkResult'), 'recordBenchmarkResult function should exist');
            assert(engineCode.includes('function completeBenchmark'), 'completeBenchmark function should exist');
            assert(engineCode.includes('function stopBenchmark'), 'stopBenchmark function should exist');
            assert(engineCode.includes('function applyOptimizedSettings'), 'applyOptimizedSettings function should exist');
        });
    });

    describe('API Endpoints', () => {
        it('should have benchmark API endpoints registered', () => {
            const fs = require('fs');
            const path = require('path');
            const mainPath = path.join(__dirname, '..', 'plugins', 'emoji-rain', 'main.js');
            const mainCode = fs.readFileSync(mainPath, 'utf8');
            
            // Check if benchmark routes are registered
            assert(mainCode.includes('/api/emoji-rain/benchmark/start'), 'Benchmark start endpoint should be registered');
            assert(mainCode.includes('/api/emoji-rain/benchmark/stop'), 'Benchmark stop endpoint should be registered');
            assert(mainCode.includes('/api/emoji-rain/benchmark/apply'), 'Benchmark apply endpoint should be registered');
        });

        it('should have socket event handlers for benchmark', () => {
            const fs = require('fs');
            const path = require('path');
            const mainPath = path.join(__dirname, '..', 'plugins', 'emoji-rain', 'main.js');
            const mainCode = fs.readFileSync(mainPath, 'utf8');
            
            // Check if socket handlers are registered
            assert(mainCode.includes('emoji-rain:benchmark-status'), 'Benchmark status socket handler should exist');
            assert(mainCode.includes('registerSocketHandlers'), 'registerSocketHandlers method should exist');
        });
    });

    describe('UI Integration', () => {
        it('should have benchmark UI elements', () => {
            const fs = require('fs');
            const path = require('path');
            const uiPath = path.join(__dirname, '..', 'plugins', 'emoji-rain', 'ui.html');
            const uiCode = fs.readFileSync(uiPath, 'utf8');
            
            // Check if UI elements exist
            assert(uiCode.includes('target_fps'), 'Target FPS input should exist');
            assert(uiCode.includes('start-benchmark-btn'), 'Start benchmark button should exist');
            assert(uiCode.includes('stop-benchmark-btn'), 'Stop benchmark button should exist');
            assert(uiCode.includes('apply-optimal-btn'), 'Apply optimal button should exist');
            assert(uiCode.includes('benchmark-progress'), 'Benchmark progress element should exist');
            assert(uiCode.includes('benchmark-results'), 'Benchmark results element should exist');
        });

        it('should have benchmark UI JavaScript functions', () => {
            const fs = require('fs');
            const path = require('path');
            const uiJsPath = path.join(__dirname, '..', 'public', 'js', 'emoji-rain-ui.js');
            const uiJsCode = fs.readFileSync(uiJsPath, 'utf8');
            
            // Check if UI functions exist
            assert(uiJsCode.includes('async function startBenchmark'), 'startBenchmark UI function should exist');
            assert(uiJsCode.includes('async function stopBenchmark'), 'stopBenchmark UI function should exist');
            assert(uiJsCode.includes('async function applyOptimizedSettings'), 'applyOptimizedSettings UI function should exist');
            assert(uiJsCode.includes('function updateBenchmarkProgress'), 'updateBenchmarkProgress function should exist');
            assert(uiJsCode.includes('function displayBenchmarkResults'), 'displayBenchmarkResults function should exist');
        });

        it('should have event listeners for benchmark buttons', () => {
            const fs = require('fs');
            const path = require('path');
            const uiJsPath = path.join(__dirname, '..', 'public', 'js', 'emoji-rain-ui.js');
            const uiJsCode = fs.readFileSync(uiJsPath, 'utf8');
            
            // Check if event listeners are registered
            assert(uiJsCode.includes("getElementById('start-benchmark-btn').addEventListener"), 'Start benchmark button listener should exist');
            assert(uiJsCode.includes("getElementById('stop-benchmark-btn').addEventListener"), 'Stop benchmark button listener should exist');
            assert(uiJsCode.includes("getElementById('apply-optimal-btn').addEventListener"), 'Apply optimal button listener should exist');
        });
    });

    describe('Socket Communication', () => {
        it('should have socket event handlers in engine', () => {
            const fs = require('fs');
            const path = require('path');
            const enginePath = path.join(__dirname, '..', 'public', 'js', 'emoji-rain-engine.js');
            const engineCode = fs.readFileSync(enginePath, 'utf8');
            
            // Check if socket listeners exist
            assert(engineCode.includes("socket.on('emoji-rain:benchmark-start'"), 'Benchmark start socket listener should exist');
            assert(engineCode.includes("socket.on('emoji-rain:benchmark-stop'"), 'Benchmark stop socket listener should exist');
            assert(engineCode.includes("socket.on('emoji-rain:benchmark-apply'"), 'Benchmark apply socket listener should exist');
        });

        it('should have socket event handlers in UI', () => {
            const fs = require('fs');
            const path = require('path');
            const uiJsPath = path.join(__dirname, '..', 'public', 'js', 'emoji-rain-ui.js');
            const uiJsCode = fs.readFileSync(uiJsPath, 'utf8');
            
            // Check if socket listeners exist
            assert(uiJsCode.includes("socket.on('emoji-rain:benchmark-update'"), 'Benchmark update socket listener should exist');
        });
    });

    describe('Benchmark Quality Presets', () => {
        it('should have decreasing emoji counts across presets', () => {
            const fs = require('fs');
            const path = require('path');
            const enginePath = path.join(__dirname, '..', 'public', 'js', 'emoji-rain-engine.js');
            const engineCode = fs.readFileSync(enginePath, 'utf8');
            
            // Extract BENCHMARK_TESTS array
            const testsMatch = engineCode.match(/const BENCHMARK_TESTS = \[([\s\S]*?)\];/);
            assert(testsMatch, 'BENCHMARK_TESTS should be extractable');
            
            // Check that max_emojis_on_screen decreases from Maximum to Minimal
            const testsText = testsMatch[0];
            const maxEmojiValues = testsText.match(/max_emojis_on_screen: (\d+)/g);
            assert(maxEmojiValues && maxEmojiValues.length === 5, 'Should have 5 max_emojis_on_screen values');
            
            const values = maxEmojiValues.map(v => parseInt(v.match(/\d+/)[0]));
            // Values should be: 200, 150, 100, 75, 50 (decreasing)
            for (let i = 0; i < values.length - 1; i++) {
                assert(values[i] > values[i + 1], `Emoji count should decrease: ${values[i]} > ${values[i + 1]}`);
            }
        });
    });

    describe('Code Quality', () => {
        it('should have no syntax errors in main.js', () => {
            const { execSync } = require('child_process');
            const path = require('path');
            const mainPath = path.join(__dirname, '..', 'plugins', 'emoji-rain', 'main.js');
            
            try {
                execSync(`node -c "${mainPath}"`, { encoding: 'utf8' });
                assert(true, 'No syntax errors');
            } catch (error) {
                assert.fail('Syntax error in main.js: ' + error.message);
            }
        });

        it('should have no syntax errors in emoji-rain-engine.js', () => {
            const { execSync } = require('child_process');
            const path = require('path');
            const enginePath = path.join(__dirname, '..', 'public', 'js', 'emoji-rain-engine.js');
            
            try {
                execSync(`node -c "${enginePath}"`, { encoding: 'utf8' });
                assert(true, 'No syntax errors');
            } catch (error) {
                assert.fail('Syntax error in emoji-rain-engine.js: ' + error.message);
            }
        });

        it('should have no syntax errors in emoji-rain-ui.js', () => {
            const { execSync } = require('child_process');
            const path = require('path');
            const uiJsPath = path.join(__dirname, '..', 'public', 'js', 'emoji-rain-ui.js');
            
            try {
                execSync(`node -c "${uiJsPath}"`, { encoding: 'utf8' });
                assert(true, 'No syntax errors');
            } catch (error) {
                assert.fail('Syntax error in emoji-rain-ui.js: ' + error.message);
            }
        });
    });
});
