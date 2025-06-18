#!/usr/bin/env node

/**
 * Analyze parser output to understand task structure
 */

const { YamlParser } = require('../server/support/parser.js');

console.log('=== Parser Analysis for Task Dependencies ===\n');

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
  - key: cleanup
    use: deploy
    run: rm -rf dist
`;

console.log('Test YAML:');
console.log(testYaml);
console.log('\n' + '='.repeat(50) + '\n');

YamlParser.safelyParseRun('test.yml', testYaml, new Map())
  .then(result => {
    console.log('Parse Result Structure:');
    console.log('- Errors:', result.errors.length);
    console.log('- Has partial definition:', !!result.partialRunDefinition);
    
    if (result.partialRunDefinition) {
      console.log('\nPartial Run Definition:');
      console.log(JSON.stringify(result.partialRunDefinition, null, 2));
      
      // Look for tasks
      if (result.partialRunDefinition.tasks) {
        console.log('\nTasks found:');
        result.partialRunDefinition.tasks.forEach((task, index) => {
          console.log(`Task ${index + 1}:`);
          console.log(`  - key: ${task.key}`);
          console.log(`  - use: ${JSON.stringify(task.use)}`);
          console.log(`  - run: ${task.run}`);
        });
        
        console.log('\nAvailable task keys for autocomplete:');
        const taskKeys = result.partialRunDefinition.tasks
          .map(task => task.key)
          .filter(key => key); // Remove undefined/null keys
        console.log(taskKeys);
      }
    }
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(error => {
        console.log(`- ${error.message} (line ${error.line}, col ${error.column})`);
      });
    }
  })
  .catch(error => {
    console.log('Parse error:', error.message);
  });