#!/usr/bin/env node

/**
 * Test completion functionality for task dependencies
 */

const fs = require('fs');
const path = require('path');

console.log('=== Completion Test ===\n');

// Test YAML content
const testYaml = `
tasks:
  - key: build
    run: npm run build
  - key: test
    use: build
    run: npm test
  - key: deploy
    use: [build, test]
    run: npm run deploy
  - key: incomplete
    use: 
`;

console.log('Test YAML:');
console.log(testYaml);
console.log('\n' + '='.repeat(50) + '\n');

// Write test file
const testFile = path.join(__dirname, 'fixtures', 'test-completion.yml');
fs.mkdirSync(path.dirname(testFile), { recursive: true });
fs.writeFileSync(testFile, testYaml);

console.log(`Test file created at: ${testFile}`);

// Test context detection function
function isInUseContext(text, line, character) {
  const lines = text.split('\n');
  const currentLine = lines[line] || '';
  const beforeCursor = currentLine.substring(0, character);
  
  // Check if we're in a use declaration
  const usePattern = /\s*use:\s*(\[.*)?$/;
  if (usePattern.test(beforeCursor)) {
    return true;
  }
  
  // Check if we're continuing a use array
  const arrayPattern = /\s*use:\s*\[[^\]]*$/;
  if (arrayPattern.test(beforeCursor)) {
    return true;
  }
  
  return false;
}

// Test cases
const testCases = [
  { line: 8, char: 9, expected: true, description: 'After "use: "' },
  { line: 8, char: 10, expected: true, description: 'After "use: ["' },
  { line: 11, char: 9, expected: true, description: 'After "use: " on incomplete line' },
  { line: 2, char: 5, expected: false, description: 'In key declaration' },
  { line: 3, char: 5, expected: false, description: 'In run declaration' },
];

console.log('Testing context detection:');
testCases.forEach((testCase, index) => {
  const result = isInUseContext(testYaml, testCase.line, testCase.char);
  const status = result === testCase.expected ? '✅' : '❌';
  console.log(`${status} Test ${index + 1}: ${testCase.description} - Expected: ${testCase.expected}, Got: ${result}`);
});

console.log('\n' + '='.repeat(50) + '\n');

// Test task key extraction
const { YamlParser } = require('../server/support/parser.js');

YamlParser.safelyParseRun('test.yml', testYaml, new Map())
  .then(result => {
    console.log('Testing task key extraction:');
    
    if (result.partialRunDefinition?.tasks) {
      const taskKeys = result.partialRunDefinition.tasks
        .map(task => task.key)
        .filter(key => key && typeof key === 'string');
      
      console.log('✅ Extracted task keys:', taskKeys);
      console.log('✅ Expected completions for "use: " context:', taskKeys);
      
      if (taskKeys.includes('build') && taskKeys.includes('test') && taskKeys.includes('deploy')) {
        console.log('✅ All expected task keys found');
      } else {
        console.log('❌ Missing expected task keys');
      }
    } else {
      console.log('❌ No tasks found in parsed result');
    }
  })
  .catch(error => {
    console.log('❌ Parse error:', error.message);
  });

console.log('\n=== Test Complete ===');