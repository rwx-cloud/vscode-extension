#!/usr/bin/env node

/**
 * Simple test to debug VSCode extension issues
 */

const fs = require('fs');
const path = require('path');

console.log('=== VSCode Extension Debug Test ===\n');

// Test 1: Check if all required files exist
console.log('1. Checking file structure...');
const files = [
  'package.json',
  'client/package.json',
  'server/package.json',
  'client/out/extension.js',
  'server/out/server.js',
  'server/support/parser.js',
  'server/support/parser.d.ts',
];

for (const file of files) {
  const exists = fs.existsSync(file);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
}

// Test 2: Check parser availability
console.log('\n2. Testing parser...');
try {
  const { YamlParser } = require('../server/support/parser.js');
  console.log('   ✅ Parser module loaded');
  console.log('   ✅ YamlParser available:', typeof YamlParser);
  console.log('   ✅ safelyParseRun method:', typeof YamlParser.safelyParseRun);
} catch (error) {
  console.log('   ❌ Parser error:', error.message);
}

// Test 3: Test basic parsing
console.log('\n3. Testing basic parsing...');
try {
  const { YamlParser } = require('../server/support/parser.js');

  const testYaml = `
tasks:
  - key: test-task
    run: echo "Hello World"
`;

  YamlParser.safelyParseRun('test.yml', testYaml, new Map())
    .then((result) => {
      console.log('   ✅ Parse successful');
      console.log('   ✅ Errors:', result.errors.length);
      console.log('   ✅ Has definition:', !!result.partialRunDefinition);

      if (result.errors.length > 0) {
        console.log('   📝 Sample error:', result.errors[0].message);
      }
    })
    .catch((error) => {
      console.log('   ❌ Parse failed:', error.message);
    });
} catch (error) {
  console.log('   ❌ Parse test error:', error.message);
}

// Test 4: Check VSCode extension manifest
console.log('\n4. Checking extension manifest...');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log('   ✅ Package name:', pkg.name);
  console.log('   ✅ Main entry:', pkg.main);
  console.log('   ✅ Activation events:', pkg.activationEvents);
  console.log('   ✅ Commands:', pkg.contributes?.commands?.length || 0);

  if (pkg.contributes?.commands) {
    pkg.contributes.commands.forEach((cmd) => {
      console.log(`     - ${cmd.command}: ${cmd.title}`);
    });
  }
} catch (error) {
  console.log('   ❌ Manifest error:', error.message);
}

// Test 5: Check compiled client code
console.log('\n5. Checking compiled client...');
try {
  const clientCode = fs.readFileSync('client/out/extension.js', 'utf8');
  console.log('   ✅ Client compiled size:', clientCode.length, 'bytes');
  console.log('   ✅ Has activate function:', clientCode.includes('function activate'));
  console.log('   ✅ Has LanguageClient:', clientCode.includes('LanguageClient'));
  console.log('   ✅ Has debug command:', clientCode.includes('mint.dumpDebugData'));
} catch (error) {
  console.log('   ❌ Client check error:', error.message);
}

// Test 6: Check compiled server code
console.log('\n6. Checking compiled server...');
try {
  const serverCode = fs.readFileSync('server/out/server.js', 'utf8');
  console.log('   ✅ Server compiled size:', serverCode.length, 'bytes');
  console.log('   ✅ Has connection:', serverCode.includes('createConnection'));
  console.log('   ✅ Has onInitialize:', serverCode.includes('onInitialize'));
  console.log('   ✅ Has debug handler:', serverCode.includes('rwx/dumpDebugData'));
} catch (error) {
  console.log('   ❌ Server check error:', error.message);
}

console.log('\n=== Test Complete ===');
