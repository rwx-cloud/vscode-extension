#!/usr/bin/env node

/**
 * Basic unit tests for YAML alias goto definition functionality
 * Note: These are structural tests - full integration tests require VS Code runtime
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('=== YAML Alias Go-to-Definition Tests ===\n');

// Test 1: Verify the server contains our new YAML alias functions
console.log('1. Testing server contains YAML alias functionality...');
try {
  const serverPath = path.join(__dirname, '../server/out/server.js');
  if (!fs.existsSync(serverPath)) {
    throw new Error('Server output file not found. Run npm run compile first.');
  }
  
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  
  const checks = [
    ['getYamlAliasAtPosition', serverCode.includes('getYamlAliasAtPosition')],
    ['findYamlAnchor', serverCode.includes('findYamlAnchor')],
    ['getYamlAnchorContent', serverCode.includes('getYamlAnchorContent')],
    ['YAML alias regex', serverCode.includes('\\*([a-zA-Z0-9_-]+)')],
    ['Anchor regex', serverCode.includes('&${escapeRegExp(anchorName)}')],
    ['Hover support', serverCode.includes('Check if we\'re hovering over a YAML alias')],
  ];
  
  let allPassed = true;
  checks.forEach(([name, passed]) => {
    if (passed) {
      console.log(`   ✅ ${name}`);
    } else {
      console.log(`   ❌ ${name}`);
      allPassed = false;
    }
  });
  
  if (allPassed) {
    console.log('   ✅ All YAML alias functions present in server');
  } else {
    throw new Error('Missing YAML alias functionality in server');
  }
} catch (error) {
  console.log('   ❌ Server check failed:', error.message);
}

// Test 2: Verify test fixtures exist
console.log('\n2. Testing YAML alias fixtures...');
try {
  const fixturesPath = path.join(__dirname, 'fixtures/test-yaml-aliases.yml');
  const manualTestPath = path.join(__dirname, 'manual-test-aliases.yml');
  
  if (fs.existsSync(fixturesPath)) {
    const content = fs.readFileSync(fixturesPath, 'utf8');
    if (content.includes('&shared_run') && content.includes('*shared_run')) {
      console.log('   ✅ Test fixtures contain anchors and aliases');
    } else {
      console.log('   ❌ Test fixtures missing anchor/alias patterns');
    }
  } else {
    console.log('   ❌ Test fixtures file not found');
  }
  
  if (fs.existsSync(manualTestPath)) {
    console.log('   ✅ Manual test file available');
  } else {
    console.log('   ❌ Manual test file not found');
  }
} catch (error) {
  console.log('   ❌ Fixture check failed:', error.message);
}

// Test 3: Basic regex pattern tests (simulate the functionality)
console.log('\n3. Testing YAML alias detection patterns...');
try {
  // Simulate the regex patterns used in our implementation
  const aliasPattern = /\*([a-zA-Z0-9_-]+)$/;
  const anchorPattern = (name) => new RegExp(`&${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9_-])`);
  
  // Test alias detection
  const testCases = [
    ['run: *shared_run', 'shared_run'],
    ['env: *shared_env', 'shared_env'],
    ['parallel: *shared_parallel', 'shared_parallel'],
    ['<<: *shared_env', 'shared_env']
  ];
  
  let allTestsPassed = true;
  testCases.forEach(([input, expected]) => {
    const beforeCursor = input;
    const match = beforeCursor.match(aliasPattern);
    if (match && match[1] === expected) {
      console.log(`   ✅ Alias detection: "${input}" -> "${expected}"`);
    } else {
      console.log(`   ❌ Alias detection failed: "${input}"`);
      allTestsPassed = false;
    }
  });
  
  // Test anchor detection
  const anchorTestCases = [
    ['  - &shared_run echo "hello"', 'shared_run'],
    ['  - &shared_env', 'shared_env'],
    ['    parallel: &shared_parallel', 'shared_parallel']
  ];
  
  anchorTestCases.forEach(([input, anchorName]) => {
    const pattern = anchorPattern(anchorName);
    if (pattern.test(input)) {
      console.log(`   ✅ Anchor detection: "${input}" -> "${anchorName}"`);
    } else {
      console.log(`   ❌ Anchor detection failed: "${input}"`);
      allTestsPassed = false;
    }
  });
  
  if (allTestsPassed) {
    console.log('   ✅ All pattern tests passed');
  }
} catch (error) {
  console.log('   ❌ Pattern test failed:', error.message);
}

console.log('\n=== YAML Alias Tests Complete ===\n');

console.log('💡 To test full integration:');
console.log('   1. Run: npm run install-local');
console.log('   2. Open test/manual-test-aliases.yml in VS Code');
console.log('   3. Use Ctrl+Click or F12 on any *alias_name to jump to anchor');
console.log('   4. Hover over any *alias_name to see its definition content');
console.log('   5. Verify both go-to-definition and hover work correctly');
console.log('');