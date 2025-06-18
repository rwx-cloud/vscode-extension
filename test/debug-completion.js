#!/usr/bin/env node

/**
 * Debug completion functionality
 */

const fs = require('fs');
const path = require('path');

console.log('=== Debug Completion ===\n');

// Test the context detection function directly
function isInUseContext(text, line, character) {
  const lines = text.split('\n');
  const currentLine = lines[line] || '';
  const beforeCursor = currentLine.substring(0, character);
  
  console.log(`Line ${line}: "${currentLine}"`);
  console.log(`Before cursor: "${beforeCursor}"`);
  
  // Check if we're in a use declaration
  const usePattern = /\s*use:\s*(\[.*)?$/;
  const useMatch = usePattern.test(beforeCursor);
  console.log(`Use pattern match: ${useMatch}`);
  
  // Check if we're continuing a use array
  const arrayPattern = /\s*use:\s*\[[^\]]*$/;
  const arrayMatch = arrayPattern.test(beforeCursor);
  console.log(`Array pattern match: ${arrayMatch}`);
  
  return useMatch || arrayMatch;
}

const testContent = fs.readFileSync('./test/fixtures/.mint/test-autocomplete.yml', 'utf8');
console.log('Test file content:');
console.log(testContent);
console.log('\n' + '='.repeat(50));

// Test different cursor positions
const testPositions = [
  { line: 8, char: 9, desc: 'After "use: " on incomplete line' },
  { line: 8, char: 8, desc: 'After "use:" on incomplete line' },
  { line: 2, char: 15, desc: 'After "use: build"' },
  { line: 5, char: 10, desc: 'After "use: [" in array' },
];

console.log('\nTesting cursor positions:');
testPositions.forEach((pos, i) => {
  console.log(`\nTest ${i + 1}: ${pos.desc}`);
  const result = isInUseContext(testContent, pos.line, pos.char);
  console.log(`Result: ${result ? '✅ Should show completions' : '❌ No completions'}`);
});

// Test if extension manifest is correct
console.log('\n' + '='.repeat(50));
console.log('Checking extension configuration...');

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
console.log('Activation events:', pkg.activationEvents);
console.log('Languages:', pkg.contributes?.languages?.map(l => ({
  id: l.id,
  patterns: l.filenamePatterns
})));

// Test if the test file matches the patterns
const testFilePath = './test/fixtures/.mint/test-autocomplete.yml';
const patterns = pkg.contributes?.languages?.[0]?.filenamePatterns || [];
console.log('\nFile pattern matching:');
patterns.forEach(pattern => {
  const match = path.posix.join(...testFilePath.split(path.sep)).match(new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')));
  console.log(`Pattern "${pattern}": ${match ? '✅ Match' : '❌ No match'}`);
});

console.log('\n=== Debug Complete ===');