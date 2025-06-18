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
  LocationLink,
  Range,
  Position,
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
        triggerCharacters: [' ', '[', ','],
      },
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
      definitionProvider: true,
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

  // Configuration changes will automatically trigger diagnostic refresh
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

// Helper function to extract task keys from parsed result
function extractTaskKeys(result: any): string[] {
  if (!result?.partialRunDefinition?.tasks) {
    return [];
  }
  
  return result.partialRunDefinition.tasks
    .map((task: any) => task.key)
    .filter((key: string) => key && typeof key === 'string');
}

// Helper function to find task definition location in document
function findTaskDefinition(document: TextDocument, taskKey: string): Position | null {
  const lines = document.getText().split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    // Look for "- key: taskKey" or "  key: taskKey" patterns
    const keyPattern = new RegExp(`^\\s*(?:-\\s+)?key:\\s*['"]?${escapeRegExp(taskKey)}['"]?\\s*$`);
    if (keyPattern.test(line)) {
      const keyIndex = line.indexOf(taskKey);
      if (keyIndex !== -1) {
        return Position.create(i, keyIndex);
      }
    }
  }
  
  return null;
}

// Helper function to escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}



// Helper function to check if position is in a 'use' context  
function isInUseContext(document: TextDocument, position: { line: number; character: number }): boolean {
  const lines = document.getText().split('\n');
  const currentLineIndex = position.line;
  const currentLine = lines[currentLineIndex] || '';
  const beforeCursor = currentLine.substring(0, position.character);
  
  // Check if we're in a simple use declaration: "use: value"
  const simpleUsePattern = /\s*use:\s*/;
  if (simpleUsePattern.test(beforeCursor)) {
    // Make sure we're not in an array context
    if (!beforeCursor.includes('[')) {
      return true;
    }
  }
  
  // Check if we're in a use array context anywhere on the line
  // Look for "use:" followed by "[" somewhere before cursor, but no closing "]"
  if (beforeCursor.includes('use:') && beforeCursor.includes('[') && !beforeCursor.includes(']')) {
    return true;
  }
  
  // Additional check: if the line contains "use: [" but cursor is after comma or space
  const useArrayPattern = /use:\s*\[/;
  if (currentLine.includes('use:') && currentLine.includes('[') && !currentLine.includes(']')) {
    // Check if we're positioned after the opening bracket
    const useArrayMatch = currentLine.match(useArrayPattern);
    if (useArrayMatch) {
      const arrayStartPos = useArrayMatch.index! + useArrayMatch[0].length;
      if (position.character >= arrayStartPos) {
        return true;
      }
    }
  }
  
  return false;
}

// This handler provides the initial list of the completion items.
connection.onCompletion(async (textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
  const document = documents.get(textDocumentPosition.textDocument.uri);
  if (!document) {
    return [];
  }

  // Only provide completions for Mint workflow files
  if (!isMintWorkflowFile(document)) {
    return [];
  }

  // Check if we're in a 'use' context - if not, return empty array to let other providers handle it
  if (isInUseContext(document, textDocumentPosition.position)) {
    try {
      // Parse the document to get available task keys
      const text = document.getText();
      const snippets = new Map();
      const fileName = document.uri.replace('file://', '');
      const result = await YamlParser.safelyParseRun(fileName, text, snippets);
      
      const taskKeys = extractTaskKeys(result);
      
      // Return completion items for task keys
      return taskKeys.map((key, index) => ({
        label: key,
        kind: CompletionItemKind.Reference,
        detail: 'Task dependency',
        documentation: `Reference to task "${key}"`,
        data: `task-${index}`,
        insertText: key,
      }));
    } catch (error) {
      connection.console.error(`Error getting task completions: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  // Don't provide any completions if we're not in use context - let other extensions handle it
  return [];
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

// Helper function to get the word and its range at a position
function getWordRangeAtPosition(document: TextDocument, position: Position): { word: string; range: Range } | null {
  const line = document.getText().split('\n')[position.line];
  if (!line) return null;
  
  const beforeCursor = line.substring(0, position.character);
  const afterCursor = line.substring(position.character);
  
  // Find task name boundaries - valid task names can contain letters, digits, hyphens, underscores
  // Pattern matches: word-word, word--word, word_word, etc.
  const wordStart = beforeCursor.search(/[a-zA-Z0-9_-]+$/);
  const wordEndMatch = afterCursor.match(/^[a-zA-Z0-9_-]*/);
  
  if (wordStart === -1 || !wordEndMatch) return null;
  
  const wordEnd = wordEndMatch[0].length;
  const fullWord = line.substring(wordStart, position.character + wordEnd);
  
  // Ensure we have a valid task name (not just hyphens or underscores)
  if (!/[a-zA-Z0-9]/.test(fullWord)) return null;
  
  const startPos = Position.create(position.line, wordStart);
  const endPos = Position.create(position.line, position.character + wordEnd);
  
  return {
    word: fullWord,
    range: Range.create(startPos, endPos)
  };
}

// Definition provider
connection.onDefinition(async (params: TextDocumentPositionParams): Promise<LocationLink[] | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isMintWorkflowFile(document)) {
    return null;
  }
  
  // Check if we're in a use context
  if (!isInUseContext(document, params.position)) {
    return null;
  }
  
  // Get the word and its range at the cursor position
  const wordInfo = getWordRangeAtPosition(document, params.position);
  if (!wordInfo) {
    return null;
  }
  
  // Find the task definition
  const definitionPosition = findTaskDefinition(document, wordInfo.word);
  if (!definitionPosition) {
    return null;
  }
  
  // Create a range that covers the entire task key at the definition
  const definitionEnd = Position.create(
    definitionPosition.line,
    definitionPosition.character + wordInfo.word.length
  );
  const definitionRange = Range.create(definitionPosition, definitionEnd);
  
  // Return a LocationLink with both source and target ranges
  const locationLink: LocationLink = {
    originSelectionRange: wordInfo.range, // Highlights the source word
    targetUri: document.uri,
    targetRange: definitionRange,
    targetSelectionRange: definitionRange
  };
  
  return [locationLink];
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
