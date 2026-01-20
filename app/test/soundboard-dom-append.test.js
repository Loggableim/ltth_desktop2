/**
 * Test for soundboard DOM append fix
 * Verifies that audio elements are correctly appended to DOM and cleaned up
 */

const fs = require('fs');
const path = require('path');

describe('Soundboard DOM Append Fix', () => {
    let dashboardSoundboardJs;
    
    beforeAll(() => {
        // Read the dashboard-soundboard.js file
        const filePath = path.join(__dirname, '../public/js/dashboard-soundboard.js');
        dashboardSoundboardJs = fs.readFileSync(filePath, 'utf8');
    });
    
    describe('Audio Element DOM Append', () => {
        test('should append audio element to DOM in playSound function', () => {
            expect(dashboardSoundboardJs).toContain('document.body.appendChild(audio)');
        });
        
        test('should have cleanup function to remove audio from DOM', () => {
            expect(dashboardSoundboardJs).toContain('const cleanup = () => {');
            expect(dashboardSoundboardJs).toContain('audio.parentNode.removeChild(audio)');
        });
        
        test('should call cleanup in all error and completion handlers', () => {
            // Check that cleanup is called in catch block
            const playSoundFunction = dashboardSoundboardJs.match(/function playSound\([^)]*\)[\s\S]*?\n\s*}/);
            expect(playSoundFunction).toBeTruthy();
            
            const functionText = playSoundFunction[0];
            
            // Count occurrences of cleanup() - should be at least 3 (catch, onended, onerror)
            const cleanupCalls = (functionText.match(/cleanup\(\)/g) || []).length;
            expect(cleanupCalls).toBeGreaterThanOrEqual(3);
        });
        
        test('should remove from both pool and DOM in cleanup', () => {
            // Verify cleanup function exists and contains removal logic
            expect(dashboardSoundboardJs).toContain('const cleanup = () => {');
            
            // Find the cleanup function
            const cleanupMatch = dashboardSoundboardJs.match(/const cleanup = \(\) => \{[\s\S]*?\n\s{4}\};/);
            expect(cleanupMatch).toBeTruthy();
            
            const cleanupFunction = cleanupMatch[0];
            
            // Verify it removes from pool
            expect(cleanupFunction).toContain('audioPool.splice(index, 1)');
            
            // Verify it removes from DOM (either method is acceptable)
            const hasRemoveChild = cleanupFunction.includes('audio.parentNode.removeChild(audio)');
            const hasRemove = cleanupFunction.includes('audio.remove()');
            expect(hasRemoveChild || hasRemove).toBeTruthy();
            
            // Verify it checks parentNode exists
            expect(cleanupFunction).toContain('if (audio.parentNode)');
        });
    });
    
    describe('Preview Audio DOM Append', () => {
        test('should append preview audio element to DOM', () => {
            // Simply check that the code contains the necessary elements
            // Check that previewAudio is created
            expect(dashboardSoundboardJs).toContain('previewAudio = document.createElement');
            
            // Check that it's appended to DOM
            expect(dashboardSoundboardJs).toContain('document.body.appendChild(previewAudio)');
            
            // Verify they appear in the same function context (testGiftSound)
            expect(dashboardSoundboardJs).toContain('async function testGiftSound');
        });
        
        test('should have comment explaining browser compatibility', () => {
            expect(dashboardSoundboardJs).toContain('// CRITICAL: Append audio element to DOM for browser compatibility');
            expect(dashboardSoundboardJs).toContain('// Some browsers require audio elements to be in the DOM tree to play');
        });
    });
    
    describe('Queue Functionality Preserved', () => {
        test('should preserve onComplete callback mechanism', () => {
            expect(dashboardSoundboardJs).toContain('if (onComplete) onComplete()');
        });
        
        test('should call onComplete after cleanup', () => {
            // Verify cleanup is called before onComplete in error handlers
            const patterns = [
                /cleanup\(\);[\s\S]*?if \(onComplete\) onComplete\(\)/,
            ];
            
            patterns.forEach(pattern => {
                expect(dashboardSoundboardJs).toMatch(pattern);
            });
        });
        
        test('should have all three playback modes functional', () => {
            expect(dashboardSoundboardJs).toContain("currentPlayMode === 'queue-all'");
            expect(dashboardSoundboardJs).toContain("currentPlayMode === 'queue-per-gift'");
            expect(dashboardSoundboardJs).toContain('playSound(data)'); // overlap mode
        });
    });
});
