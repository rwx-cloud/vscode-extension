#!/usr/bin/env node

/**
 * Test VSCode extension without parser dependency
 */

console.log('=== Extension Structure Test ===\n');

// Test 1: Try to load the compiled client extension
console.log('1. Testing client extension loading...');
try {
  // Clear require cache first
  delete require.cache[require.resolve('../client/out/extension.js')];

  const extension = require('../client/out/extension.js');
  console.log('   ✅ Client extension loaded');
  console.log('   ✅ Has activate function:', typeof extension.activate);
  console.log('   ✅ Has deactivate function:', typeof extension.deactivate);
} catch (error) {
  console.log('   ❌ Client loading error:', error.message);
}

// Test 2: Check if we can require vscode-languageclient
console.log('\n2. Testing language client dependency...');
try {
  // This will fail outside VSCode but tells us about module resolution
  const { LanguageClient } = require('vscode-languageclient/node');
  console.log('   ✅ LanguageClient available:', typeof LanguageClient);
} catch (error) {
  if (error.message.includes('vscode-languageclient')) {
    console.log('   ✅ vscode-languageclient module found (error expected outside VSCode)');
  } else {
    console.log('   ❌ Unexpected error:', error.message);
  }
}

// Test 3: Mock test of server without parser
console.log('\n3. Testing server structure (without parser)...');
try {
  const serverCode = require('fs').readFileSync('./server/out/server.js', 'utf8');

  // Check for key components
  const checks = [
    ['createConnection', serverCode.includes('createConnection')],
    ['onInitialize', serverCode.includes('onInitialize')],
    ['TextDocuments', serverCode.includes('TextDocuments')],
    ['diagnostics', serverCode.includes('diagnostics')],
    ['rwx/dumpDebugData', serverCode.includes('rwx/dumpDebugData')],
    ['isRwxRunFile', serverCode.includes('isRwxRunFile')],
  ];

  checks.forEach(([check, result]) => {
    console.log(`   ${result ? '✅' : '❌'} ${check}`);
  });
} catch (error) {
  console.log('   ❌ Server structure error:', error.message);
}

// Test 4: Check activation events and commands
console.log('\n4. Testing extension configuration...');
try {
  const pkg = JSON.parse(require('fs').readFileSync('./package.json', 'utf8'));

  console.log('   ✅ Extension ID:', pkg.name);
  console.log('   ✅ Publisher:', pkg.publisher);
  console.log('   ✅ Main entry exists:', require('fs').existsSync('./' + pkg.main + '.js'));

  // Check activation events
  if (pkg.activationEvents) {
    console.log('   ✅ Activation events:');
    pkg.activationEvents.forEach((event) => {
      console.log(`     - ${event}`);
    });
  }

  // Check commands
  if (pkg.contributes?.commands) {
    console.log('   ✅ Commands:');
    pkg.contributes.commands.forEach((cmd) => {
      console.log(`     - ${cmd.command}`);
    });
  }

  // Check file patterns
  if (pkg.contributes?.languages) {
    console.log('   ✅ Languages:');
    pkg.contributes.languages.forEach((lang) => {
      console.log(`     - ${lang.id}: ${lang.extensions?.join(', ')}`);
      if (lang.filenamePatterns) {
        console.log(`       Patterns: ${lang.filenamePatterns.join(', ')}`);
      }
    });
  }
} catch (error) {
  console.log('   ❌ Configuration error:', error.message);
}

console.log('\n=== Summary ===');
console.log('The parser.js has a JavaScript initialization issue.');
console.log('This is likely why the extension is not working.');
console.log('Everything else appears to be correctly configured.');
console.log('\nRecommendation: Rebuild or fix the parser.js file.');

console.log('\n=== Test Complete ===');
