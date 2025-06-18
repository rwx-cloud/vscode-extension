import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  DocumentDiagnosticReportKind,
  type DocumentDiagnosticReport,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import { YamlParser } from '../support/parser';

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
  hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
      },
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    void connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      // Handle workspace folder changes
    });
  }
});

interface MintSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
const defaultSettings: MintSettings = { maxNumberOfProblems: 1000 };
let globalSettings: MintSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<MintSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <MintSettings>((change.settings as { mintLanguageServer?: MintSettings }).mintLanguageServer || defaultSettings);
  }

  // Revalidate all open text documents
  documents.all().forEach((doc) => void validateTextDocument(doc));
});

function getDocumentSettings(resource: string): Thenable<MintSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace
      .getConfiguration({
        scopeUri: resource,
        section: 'mintLanguageServer',
      })
      .then((config: unknown) => {
        // Ensure we have valid settings with defaults
        const typedConfig = config as { maxNumberOfProblems?: number } | null;
        return {
          maxNumberOfProblems: typedConfig?.maxNumberOfProblems ?? defaultSettings.maxNumberOfProblems,
        };
      });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
});

// Check if document is in a .mint or .rwx directory
function isMintWorkflowFile(document: TextDocument): boolean {
  const filePath = document.uri.replace('file://', '');
  const normalizedPath = path.normalize(filePath);

  // Check if the file is in a .mint or .rwx directory anywhere in the path
  const pathParts = normalizedPath.split(path.sep);
  return pathParts.some((part) => part === '.mint' || part === '.rwx');
}

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
  void validateTextDocument(change.document);
});

documents.onDidOpen((event) => {
  void validateTextDocument(event.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // Only validate YAML files in .mint or .rwx directories
  if (!isMintWorkflowFile(textDocument)) {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    return;
  }

  let settings: MintSettings;
  try {
    settings = await getDocumentSettings(textDocument.uri);
  } catch (error) {
    connection.console.error(`Failed to get document settings: ${error instanceof Error ? error.message : String(error)}`);
    settings = defaultSettings;
  }
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  try {
    // Parse the document using the Mint parser
    const snippets = new Map();
    const fileName = textDocument.uri.replace('file://', '');
    const result = await YamlParser.safelyParseRun(fileName, text, snippets);

    // Convert parser errors to diagnostics
    for (const error of result.errors) {
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: {
          start: {
            line: (error.line ?? 1) - 1, // Convert to 0-based
            character: (error.column ?? 1) - 1, // Convert to 0-based
          },
          end: {
            line: (error.line ?? 1) - 1,
            character: (error.column ?? 1) + 10, // Approximate end position
          },
        },
        message: error.message,
        source: 'mint-parser',
      };

      if (error.advice) {
        diagnostic.message += `\n\nAdvice: ${error.advice}`;
      }

      diagnostics.push(diagnostic);
    }

    // Limit the number of problems reported
    const limitedDiagnostics = diagnostics.slice(0, settings.maxNumberOfProblems);

    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: limitedDiagnostics });
  } catch (error) {
    // If there's an error in parsing, create a generic diagnostic
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      },
      message: `Parser error: ${error instanceof Error ? error.message : String(error)}`,
      source: 'mint-parser',
    };

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [diagnostic] });
  }
}

connection.languages.diagnostics.on(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (document !== undefined) {
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: await validateTextDocumentForDiagnostics(document),
    } satisfies DocumentDiagnosticReport;
  } else {
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: [],
    } satisfies DocumentDiagnosticReport;
  }
});

async function validateTextDocumentForDiagnostics(textDocument: TextDocument): Promise<Diagnostic[]> {
  // Only validate YAML files in .mint or .rwx directories
  if (!isMintWorkflowFile(textDocument)) {
    return [];
  }

  let settings: MintSettings;
  try {
    settings = await getDocumentSettings(textDocument.uri);
  } catch (error) {
    connection.console.error(`Failed to get document settings: ${error instanceof Error ? error.message : String(error)}`);
    settings = defaultSettings;
  }
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  try {
    // Parse the document using the Mint parser
    const snippets = new Map();
    const fileName = textDocument.uri.replace('file://', '');
    const result = await YamlParser.safelyParseRun(fileName, text, snippets);

    // Convert parser errors to diagnostics
    for (const error of result.errors) {
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: {
          start: {
            line: (error.line ?? 1) - 1, // Convert to 0-based
            character: (error.column ?? 1) - 1, // Convert to 0-based
          },
          end: {
            line: (error.line ?? 1) - 1,
            character: (error.column ?? 1) + 10, // Approximate end position
          },
        },
        message: error.message,
        source: 'mint-parser',
      };

      if (error.advice) {
        diagnostic.message += `\n\nAdvice: ${error.advice}`;
      }

      diagnostics.push(diagnostic);
    }

    // Limit the number of problems reported
    return diagnostics.slice(0, settings.maxNumberOfProblems);
  } catch (error) {
    // If there's an error in parsing, create a generic diagnostic
    return [
      {
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
        message: `Parser error: ${error instanceof Error ? error.message : String(error)}`,
        source: 'mint-parser',
      },
    ];
  }
}

// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  // The pass parameter contains the position of the text document in
  // which code completion got requested.
  return [
    {
      label: 'tasks',
      kind: CompletionItemKind.Text,
      data: 1,
    },
    {
      label: 'triggers',
      kind: CompletionItemKind.Text,
      data: 2,
    },
  ];
});

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  if (item.data === 1) {
    item.detail = 'Task definition';
    item.documentation = 'Define tasks for your Mint workflow';
  } else if (item.data === 2) {
    item.detail = 'Trigger definition';
    item.documentation = 'Define triggers for your Mint workflow';
  }
  return item;
});

// Register debug command handler
connection.onRequest('mint/dumpDebugData', async (params: { uri: string }) => {
  try {
    const document = documents.get(params.uri);
    if (!document) {
      return {
        error: 'Document not found',
        requestedUri: params.uri,
        availableDocuments: Array.from(documents.keys()),
      };
    }

    if (!isMintWorkflowFile(document)) {
      return { error: 'Not a Mint workflow file' };
    }

    const text = document.getText();
    const snippets = new Map();
    const fileName = document.uri.replace('file://', '');
    const result = await YamlParser.safelyParseRun(fileName, text, snippets);

    return {
      fileName,
      isMintFile: true,
      parseResult: {
        partialRunDefinition: result.partialRunDefinition,
        errors: result.errors,
      },
    };
  } catch (error) {
    return {
      error: `Failed to parse: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
