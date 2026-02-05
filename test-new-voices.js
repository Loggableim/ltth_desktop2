/**
 * Test to verify new Fish Audio voices are accessible
 */
const FishSpeechEngine = require('./app/plugins/tts/engines/fishspeech-engine');

console.log('Testing Fish Audio voice integration...\n');

// Get all voices
const voices = FishSpeechEngine.getVoices();

// Test for the 6 new voices
const newVoices = {
    'fish-kermit': '93d75b99763f4f10a0756d85c59cfcca',
    'fish-zug-ostdeutschland': '63338a153446436db1b18fe92d58c6f0',
    'fish-zug-allgemein': '2e2259a37979416882b78165735cc7a0',
    'fish-chibbiserker': 'e49a69c4528a4fc4bd6bf620227ab575',
    'fish-blucher': 'a355dda8cc904e4fb2590f1a598e89e2',
    'fish-funtime-freddy': '4540a261de68409396afc3a8e86255ad'
};

let allFound = true;

console.log('Checking for new voices:');
console.log('='.repeat(70));

for (const [voiceId, expectedRefId] of Object.entries(newVoices)) {
    const voice = voices[voiceId];
    
    if (!voice) {
        console.log(`❌ FAILED: Voice "${voiceId}" not found!`);
        allFound = false;
    } else if (voice.reference_id !== expectedRefId) {
        console.log(`❌ FAILED: Voice "${voiceId}" has wrong reference_id!`);
        console.log(`   Expected: ${expectedRefId}`);
        console.log(`   Got:      ${voice.reference_id}`);
        allFound = false;
    } else {
        console.log(`✓ Voice "${voiceId}" found: ${voice.name} (${voice.lang})`);
    }
}

console.log('='.repeat(70));

if (allFound) {
    console.log('\n✅ All 6 new voices successfully integrated!');
    console.log(`\nTotal Fish Audio voices: ${Object.keys(voices).length}`);
    process.exit(0);
} else {
    console.log('\n❌ Some voices are missing or incorrect!');
    process.exit(1);
}
