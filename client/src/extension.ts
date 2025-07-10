import * as path from "path";
import * as fs from "fs";
import {
  workspace,
  ExtensionContext,
  window,
  commands,
  extensions,
} from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

// Check if the YAML extension is installed and prompt user to install if not
async function checkYamlExtensionDependency(): Promise<void> {
  const yamlExtension = extensions.getExtension("redhat.vscode-yaml");

  if (!yamlExtension) {
    // Check if user has chosen not to see this prompt
    const config = workspace.getConfiguration("rwx");
    const showPrompt = config.get("showYamlExtensionPrompt", true);

    if (!showPrompt) {
      return;
    }

    const choice = await window.showWarningMessage(
      "The RWX extension requires the YAML extension for schema validation and hover support. Would you like to install it?",
      "Install YAML Extension",
      "Not Now",
      "Don't Show Again"
    );

    if (choice === "Install YAML Extension") {
      // Open the extension marketplace for the YAML extension
      await commands.executeCommand("extension.open", "redhat.vscode-yaml");
    } else if (choice === "Don't Show Again") {
      // Store preference to not show this again
      await config.update("showYamlExtensionPrompt", false, true);
    }
  }
}

export function activate(context: ExtensionContext) {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("out", "server.js")
  );

  // Check if server file exists
  if (!fs.existsSync(serverModule)) {
    window.showErrorMessage(
      "RWX Language Server not found. Please compile the extension."
    );
    return;
  }

  // Check for vscode-yaml extension dependency
  checkYamlExtensionDependency();

  // Alternative: Register schema programmatically if yamlValidation doesn't work
  // registerYamlSchema();

  // TODO: If yamlValidation still causes conflicts, uncomment this:
  // registerSchemaManually();

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
    // Register the server for yaml files in mint/rwx directories only
    documentSelector: [
      { scheme: "file", language: "yaml", pattern: "**/.mint/**/*.{yml,yaml}" },
      { scheme: "file", language: "yaml", pattern: "**/.rwx/**/*.{yml,yaml}" },
    ],
    synchronize: {
      // Notify the server about file changes to yaml files in mint directories
      fileEvents: workspace.createFileSystemWatcher(
        "**/.{mint,rwx}/**/*.{yml,yaml}"
      ),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "rwxLanguageServer",
    "RWX Language Server",
    serverOptions,
    clientOptions
  );

  // Register the debug command
  const disposable = commands.registerCommand("rwx.dumpDebugData", async () => {
    const editor = window.activeTextEditor;
    if (!editor) {
      window.showErrorMessage("No active editor");
      return;
    }

    const document = editor.document;
    if (!document.fileName.match(/\.(yml|yaml)$/)) {
      window.showErrorMessage("Active file is not a YAML file");
      return;
    }

    // Check if the file is in a .mint or .rwx directory
    const filePath = document.fileName;
    const isInMintDir =
      filePath.includes("/.mint/") || filePath.includes("/.rwx/");

    if (!isInMintDir) {
      window.showErrorMessage(
        "Active file is not in a .mint or .rwx directory"
      );
      return;
    }

    try {
      const result = await client.sendRequest("rwx/dumpDebugData", {
        uri: document.uri.toString(),
      });

      // Create a new document to show the debug data
      const debugData = JSON.stringify(result, null, 2);
      const doc = await workspace.openTextDocument({
        content: debugData,
        language: "json",
      });
      await window.showTextDocument(doc);
    } catch (error) {
      window.showErrorMessage(
        `Failed to dump debug data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });

  context.subscriptions.push(disposable);

  // This will also launch the server
  return client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client.stop();
}
