import * as path from 'path';
import * as fs from 'fs';
import { workspace, ExtensionContext, window, commands } from 'vscode';

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

  // Check if server file exists
  if (!fs.existsSync(serverModule)) {
    window.showErrorMessage('RWX Language Server not found. Please compile the extension.');
    return;
  }

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for rwx-run-yaml language and yaml files in mint/rwx directories
    documentSelector: [
      { scheme: 'file', language: 'rwx-run-yaml' },
      { scheme: 'file', language: 'yaml', pattern: '**/.mint/**/*.{yml,yaml}' },
      { scheme: 'file', language: 'yaml', pattern: '**/.rwx/**/*.{yml,yaml}' },
      { scheme: 'file', pattern: '**/.mint/**/*.{yml,yaml}' },
      { scheme: 'file', pattern: '**/.rwx/**/*.{yml,yaml}' },
    ],
    synchronize: {
      // Notify the server about file changes to yaml files in mint directories
      fileEvents: workspace.createFileSystemWatcher('**/.{mint,rwx}/**/*.{yml,yaml}'),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient('rwxLanguageServer', 'RWX Language Server', serverOptions, clientOptions);

  // Register the debug command
  const disposable = commands.registerCommand('rwx.dumpDebugData', async () => {
    const editor = window.activeTextEditor;
    if (!editor) {
      window.showErrorMessage('No active editor');
      return;
    }

    const document = editor.document;
    if (!document.fileName.match(/\.(yml|yaml)$/)) {
      window.showErrorMessage('Active file is not a YAML file');
      return;
    }

    // Check if the file is in a .mint or .rwx directory
    const filePath = document.fileName;
    const isInMintDir = filePath.includes('/.mint/') || filePath.includes('/.rwx/');

    if (!isInMintDir) {
      window.showErrorMessage('Active file is not in a .mint or .rwx directory');
      return;
    }

    try {
      const result = await client.sendRequest('rwx/dumpDebugData', {
        uri: document.uri.toString(),
      });

      // Create a new document to show the debug data
      const debugData = JSON.stringify(result, null, 2);
      const doc = await workspace.openTextDocument({
        content: debugData,
        language: 'json',
      });
      await window.showTextDocument(doc);
    } catch (error) {
      window.showErrorMessage(`Failed to dump debug data: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  context.subscriptions.push(disposable);

  // This will also launch the server
  return client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client.stop();
}
