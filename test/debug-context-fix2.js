#!/usr/bin/env node

/**
 * Test the improved context detection logic for edge cases
 */

console.log('=== Testing Improved Context Detection (v2) ===\n');

// Updated context detection function
function isInUseContext(text, line, character) {
  const lines = text.split('\n');
  const currentLineIndex = line;
  const currentLine = lines[currentLineIndex] || '';
  const beforeCursor = currentLine.substring(0, character);
  
  console.log(`Line ${line + 1}: "${currentLine}"`);
  console.log(`Before cursor: "${beforeCursor}"`);
  
  // Check if we're in a use declaration without array
  // Pattern: "use: " (not followed by [)
  const simpleUsePattern = /\s*use:\s*$/;
  if (simpleUsePattern.test(beforeCursor)) {
    console.log(`Result: ✅ Simple use pattern matched`);
    return true;
  }
  
  // Check if we're in a use array context anywhere on the line
  // Look for "use:" followed by "[" somewhere before cursor, but no closing "]"
  if (beforeCursor.includes('use:') && beforeCursor.includes('[') && !beforeCursor.includes(']')) {
    console.log(`Result: ✅ Found incomplete use array`);
    return true;
  }
  
  // Additional check: if the line contains "use: [" but cursor is after comma or space
  const useArrayPattern = /use:\s*\[/;
  if (currentLine.includes('use:') && currentLine.includes('[') && !currentLine.includes(']')) {
    // Check if we're positioned after the opening bracket
    const useArrayMatch = currentLine.match(useArrayPattern);
    if (useArrayMatch) {
      const arrayStartPos = useArrayMatch.index + useArrayMatch[0].length;
      if (character >= arrayStartPos) {
        console.log(`Result: ✅ Cursor is within use array context (pos ${character} >= ${arrayStartPos})`);
        return true;
      } else {
        console.log(`Result: ❌ Cursor before array start (pos ${character} < ${arrayStartPos})`);
      }
    }
  }
  
  console.log(`Result: ❌ Not in use context`);
  return false;
}

// Test cases focusing on the problematic scenarios
const testCases = [
  {
    text: '    use: [code,',
    line: 0,
    char: 14,
    desc: 'Problematic case: "use: [code," (after comma, no space)'
  },
  {
    text: '    use: [code, ',
    line: 0,
    char: 15,
    desc: 'Working case: "use: [code, " (after comma with space)'
  },
  {
    text: '    use: [',
    line: 0,
    char: 10,
    desc: 'Array start: "use: [" (immediately after bracket)'
  },
  {
    text: '    use: [code',
    line: 0,
    char: 14,
    desc: 'Array with content: "use: [code" (after content, no comma)'
  },
  {
    text: '    use: [code,test',
    line: 0,
    char: 18,
    desc: 'Array with content: "use: [code,test" (after second item, no space)'
  }
];

console.log('Testing all cases:\n');
testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.desc}`);
  const result = isInUseContext(testCase.text, testCase.line, testCase.char);
  console.log('---');
});

console.log('\n=== Test Complete ===');