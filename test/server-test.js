#!/usr/bin/env node

/**
 * Test the language server independently
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('=== Language Server Test ===\n');

// Test server startup
console.log('1. Testing server startup...');

const serverPath = path.join(__dirname, '../server/out/server.js');
console.log('   Server path:', serverPath);

try {
  const serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let output = '';
  let errorOutput = '';

  serverProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  serverProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  // Send a simple LSP initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      processId: process.pid,
      rootUri: null,
      capabilities: {}
    }
  };

  const message = JSON.stringify(initRequest);
  const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;
  
  setTimeout(() => {
    console.log('   📤 Sending initialize request...');
    serverProcess.stdin.write(header + message);
  }, 100);

  setTimeout(() => {
    console.log('   📥 Server output:', output || '(none)');
    console.log('   📥 Server errors:', errorOutput || '(none)');
    
    if (output.includes('result') || output.includes('capabilities')) {
      console.log('   ✅ Server appears to be responding');
    } else {
      console.log('   ❌ Server may not be responding correctly');
    }
    
    serverProcess.kill();
    console.log('   🛑 Server process terminated');
  }, 1000);

} catch (error) {
  console.log('   ❌ Server startup error:', error.message);
}

console.log('\n2. Testing parser integration...');

// Test if server can load the parser
try {
  // This simulates what the server does
  const { YamlParser } = require('../server/support/parser.js');
  
  console.log('   ✅ Parser loaded successfully');
  
  // Test parsing a simple file
  const testContent = `
tasks:
  - key: hello
    run: echo "test"
`;

  YamlParser.safelyParseRun('test.yml', testContent, new Map())
    .then(result => {
      console.log('   ✅ Parse result - errors:', result.errors.length);
      console.log('   ✅ Parse result - has definition:', !!result.partialRunDefinition);
    })
    .catch(err => {
      console.log('   ❌ Parse error:', err.message);
    });

} catch (error) {
  console.log('   ❌ Parser integration error:', error.message);
}