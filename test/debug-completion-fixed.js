#!/usr/bin/env node

/**
 * Debug completion functionality with correct line numbers
 */

const fs = require('fs');
const path = require('path');

console.log('=== Debug Completion (Fixed) ===\n');

// Test the context detection function directly
function isInUseContext(text, line, character) {
  const lines = text.split('\n');
  const currentLine = lines[line] || '';
  const beforeCursor = currentLine.substring(0, character);
  
  console.log(`Line ${line + 1}: "${currentLine}"`);
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
console.log('Test file content with line numbers:');
testContent.split('\n').forEach((line, i) => {
  console.log(`${(i + 1).toString().padStart(2)}: ${line}`);
});
console.log('\n' + '='.repeat(50));

// Test different cursor positions (0-based indexing)
const testPositions = [
  { line: 10, char: 8, desc: 'After "use:" on line 11 (incomplete)' },
  { line: 10, char: 9, desc: 'After "use: " on line 11 (if there was a space)' },
  { line: 4, char: 8, desc: 'After "use:" on line 5' },
  { line: 4, char: 9, desc: 'After "use: " on line 5' },
  { line: 7, char: 8, desc: 'After "use:" on line 8' },
  { line: 7, char: 10, desc: 'After "use: [" on line 8' },
];

console.log('\nTesting cursor positions:');
testPositions.forEach((pos, i) => {
  console.log(`\nTest ${i + 1}: ${pos.desc}`);
  const result = isInUseContext(testContent, pos.line, pos.char);
  console.log(`Result: ${result ? '✅ Should show completions' : '❌ No completions'}`);
});

console.log('\n=== Debug Complete ===');