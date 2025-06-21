#!/bin/bash

# VS Code Extension End-to-End Test Script

set -e

echo "=== VS Code Extension Test Suite ==="
echo ""

# Ensure we're in the right directory
cd "$(dirname "$0")/.."

# Step 1: Compile the extension
echo "1. Compiling extension..."
npm run compile
echo "   ✅ Compilation complete"
echo ""

# Step 2: Run basic structure tests
echo "2. Running basic extension tests..."
node test/extension-test.js
echo ""

# Step 3: Run server tests 
echo "3. Running server-specific tests..."
if [ -f test/server-test.js ]; then
    node test/server-test.js
else
    echo "   ⚠️  server-test.js not found, skipping"
fi
echo ""

# Step 4: Run completion tests
echo "4. Running completion tests..."
if [ -f test/completion-test.js ]; then
    node test/completion-test.js
else
    echo "   ⚠️  completion-test.js not found, skipping"
fi
echo ""

# Step 5: Run goto definition tests (if they exist)
echo "5. Running go-to-definition tests..."
if [ -f test/goto-definition-test.js ]; then
    echo "   ⚠️  goto-definition-test.js found but requires VS Code runtime"
    echo "   💡 To test go-to-definition manually:"
    echo "      1. Install extension: npm run install-local"
    echo "      2. Open test/manual-test-aliases.yml in VS Code"
    echo "      3. Ctrl+Click or F12 on any *alias_name"
else
    echo "   ⚠️  goto-definition-test.js not found, skipping"
fi
echo ""

# Step 6: Package the extension
echo "6. Testing packaging..."
npm run package > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Extension packages successfully"
else
    echo "   ❌ Extension packaging failed"
    exit 1
fi
echo ""

echo "=== All Tests Complete ==="
echo ""
echo "🎉 Extension is ready to use!"
echo ""
echo "Next steps:"
echo "  • Install locally: npm run install-local"
echo "  • Test YAML aliases: Open any .mint/*.yml file and use Ctrl+Click on *alias"
echo "  • Test completion: Type in .mint/*.yml files for auto-completion"
echo ""