#!/usr/bin/env node

/**
 * Test the improved context detection logic
 */

console.log('=== Testing Improved Context Detection ===\n');

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
  const simpleMatch = simpleUsePattern.test(beforeCursor);
  console.log(`Simple use pattern match: ${simpleMatch}`);
  
  // Check if we're in a use array context
  // Look for "use: [" followed by any content but no closing ]
  const useArrayStartPattern = /\s*use:\s*\[/;
  const arrayStartMatch = useArrayStartPattern.test(beforeCursor);
  const hasClosingBracket = beforeCursor.includes(']');
  console.log(`Array start pattern match: ${arrayStartMatch}`);
  console.log(`Has closing bracket: ${hasClosingBracket}`);
  
  if (useArrayStartPattern.test(beforeCursor)) {
    // Make sure there's no closing ] before our cursor position
    if (!beforeCursor.includes(']')) {
      console.log(`Result: ✅ In array context`);
      return true;
    }
  }
  
  if (simpleMatch) {
    console.log(`Result: ✅ In simple use context`);
    return true;
  }
  
  console.log(`Result: ❌ Not in use context`);
  return false;
}

// Test cases
const testCases = [
  {
    text: '    use: ',
    line: 0,
    char: 9,
    desc: 'Simple use case: "use: "'
  },
  {
    text: '    use: [',
    line: 0,
    char: 10,
    desc: 'Array start: "use: ["'
  },
  {
    text: '    use: [code',
    line: 0,
    char: 14,
    desc: 'Array with content: "use: [code"'
  },
  {
    text: '    use: [code, ',
    line: 0,
    char: 15,
    desc: 'Array with content and comma: "use: [code, "'
  },
  {
    text: '    use: [code, test',
    line: 0,
    char: 19,
    desc: 'Array with multiple items: "use: [code, test"'
  },
  {
    text: '    use: [code, test]',
    line: 0,
    char: 20,
    desc: 'Complete array: "use: [code, test]"'
  },
  {
    text: '    run: npm test',
    line: 0,
    char: 16,
    desc: 'Different key: "run: npm test"'
  }
];

console.log('Testing all cases:\n');
testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.desc}`);
  const result = isInUseContext(testCase.text, testCase.line, testCase.char);
  console.log(`Expected: Should show completions for use contexts`);
  console.log('---');
});

console.log('\n=== Test Complete ===');