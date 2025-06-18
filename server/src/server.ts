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
  Hover,
  MarkupKind,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import { YamlParser } from '../support/parser';

// RWX Package types
interface RWXPackage {
  version: string;
  description: string;
}

interface RWXPackagesResponse {
  [packageName: string]: RWXPackage;
}

// Detailed package info from version endpoint
interface RWXPackageParameter {
  name: string;
  required: boolean | null;
  default: string;
  description: string;
}

interface RWXPackageDetails {
  name: string;
  version: string;
  readme: string;
  digest: string;
  published: boolean;
  description: string;
  source_code_url: string;
  issue_tracker_url: string;
  parameters: RWXPackageParameter[];
}

// Package cache - cache for 1 hour
const packageCache: { data: RWXPackagesResponse | null; timestamp: number } = {
  data: null,
  timestamp: 0
};

// Package details cache - cache indefinitely
const packageDetailsCache: Map<string, RWXPackageDetails> = new Map();

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// Fetch RWX packages from the API
async function fetchRWXPackages(): Promise<RWXPackagesResponse | null> {
  const now = Date.now();
  
  // Return cached data if it's still valid
  if (packageCache.data && (now - packageCache.timestamp) < CACHE_DURATION) {
    return packageCache.data;
  }
  
  try {
    const response = await fetch('https://cloud.rwx.com/mint/api/leaves/documented', {
      headers: {
        Accept: 'application/json,*/*',
        'User-Agent': 'rwx-docs-leaves-index/1',
      },
    });
    
    if (!response.ok) {
      console.error('Failed to fetch RWX packages:', response.status, response.statusText);
      return packageCache.data; // Return cached data if available
    }
    
    const data = await response.json() as RWXPackagesResponse;
    
    // Update cache
    packageCache.data = data;
    packageCache.timestamp = now;
    
    return data;
  } catch (error) {
    console.error('Error fetching RWX packages:', error);
    return packageCache.data; // Return cached data if available
  }
}

// Fetch detailed package information for a specific version
async function fetchPackageDetails(packageName: string, version: string): Promise<RWXPackageDetails | null> {
  const cacheKey = `${packageName}@${version}`;
  
  // Return cached data if available
  if (packageDetailsCache.has(cacheKey)) {
    return packageDetailsCache.get(cacheKey)!;
  }
  
  try {
    const url = `https://cloud.rwx.com/mint/api/leaves/${packageName}/${encodeURIComponent(version)}/documentation`;
    console.log('Fetching package details from:', url); // Debug logging
    
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json,*/*',
        'User-Agent': 'rwx-docs-leaves-index/1',
      },
    });
    
    if (!response.ok) {
      console.error('Failed to fetch package details:', response.status, response.statusText, 'URL:', url);
      return null;
    }
    
    const data = await response.json() as RWXPackageDetails;
    
    // Cache the result indefinitely
    packageDetailsCache.set(cacheKey, data);
    
    return data;
  } catch (error) {
    console.error('Error fetching package details:', error);
    return null;
  }
}

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
      hoverProvider: true,
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

// Helper function to extract package name and version from a call line
function extractPackageAndVersionFromCallLine(line: string): { packageName: string; version: string } | null {
  // Match pattern: "call: package-name version" or "  call: package-name version"
  const callPattern = /^\s*call:\s*([^\s]+)\s+([^\s]+)/;
  const match = line.match(callPattern);
  return match && match[1] && match[2] ? { packageName: match[1], version: match[2] } : null;
}




// Helper function to check if position is in a 'call' context
function isInCallContext(document: TextDocument, position: { line: number; character: number }): boolean {
  const lines = document.getText().split('\n');
  const currentLineIndex = position.line;
  const currentLine = lines[currentLineIndex] || '';
  const beforeCursor = currentLine.substring(0, position.character);
  
  // Check if we're in a call declaration: "call: value"
  const callPattern = /\s*call:\s*/;
  if (callPattern.test(beforeCursor)) {
    return true;
  }
  
  return false;
}

// Helper function to check if position is in a 'with:' parameter context
function isInWithContext(document: TextDocument, position: { line: number; character: number }): boolean {
  const lines = document.getText().split('\n');
  const currentLineIndex = position.line;
  const currentLine = lines[currentLineIndex] || '';
  const beforeCursor = currentLine.substring(0, position.character);
  
  // Check if we're directly on a 'with:' line after the colon (for empty with blocks)
  const withPattern = /^\s*with:\s*$/;
  if (withPattern.test(beforeCursor)) {
    return true;
  }
  
  // Check if we're on an indented line under 'with:' at the beginning of the line
  // This handles both empty lines and lines where we're typing a new parameter name
  if (/^\s*$/.test(beforeCursor) || /^\s+[a-zA-Z0-9_-]*$/.test(beforeCursor)) {
    // Look backwards to find the 'with:' declaration
    for (let i = currentLineIndex - 1; i >= 0; i--) {
      const prevLine = lines[i];
      if (!prevLine || prevLine.trim() === '') continue;
      
      // If we hit a line with equal or less indentation that's not 'with:', we're not in a with block
      const currentIndent = currentLine.match(/^\s*/)?.[0].length || 0;
      const prevIndent = prevLine.match(/^\s*/)?.[0].length || 0;
      
      if (prevIndent < currentIndent) {
        // Check if this is a 'with:' line
        if (/^\s*with:\s*$/.test(prevLine)) {
          return true;
        }
        break;
      }
    }
  }
  
  return false;
}

// Helper function to find the call package for a with block
function findCallPackageForWithBlock(document: TextDocument, withLineIndex: number): { packageName: string; version: string } | null {
  const lines = document.getText().split('\n');
  
  // Look backwards from the with: line to find the call: line in the same task
  for (let i = withLineIndex - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    
    // Check if this is a call: line
    const packageInfo = extractPackageAndVersionFromCallLine(line);
    if (packageInfo) {
      return packageInfo;
    }
    
    // If we hit a line that starts a new task (- key:), stop looking
    if (/^\s*-\s+key:/.test(line)) {
      break;
    }
  }
  
  return null;
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

  // Check if we're in a 'use' context for task completions
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

  // Check if we're in a 'call' context for RWX package completions
  if (isInCallContext(document, textDocumentPosition.position)) {
    try {
      const packages = await fetchRWXPackages();
      if (!packages) {
        return [];
      }

      // Convert packages to completion items
      return Object.entries(packages).map(([packageName, packageInfo], index) => ({
        label: packageName,
        kind: CompletionItemKind.Module,
        detail: `v${packageInfo.version}`,
        documentation: packageInfo.description,
        data: `package-${index}`,
        insertText: `${packageName} ${packageInfo.version}`,
      }));
    } catch (error) {
      connection.console.error(`Error getting package completions: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  // Check if we're in a 'with' context for parameter completions
  if (isInWithContext(document, textDocumentPosition.position)) {
    try {
      // Find the associated call package
      const packageInfo = findCallPackageForWithBlock(document, textDocumentPosition.position.line);
      if (!packageInfo) {
        return [];
      }

      // Fetch detailed package information to get parameters
      const packageDetails = await fetchPackageDetails(packageInfo.packageName, packageInfo.version);
      if (!packageDetails || !packageDetails.parameters) {
        return [];
      }

      // Convert parameters to completion items
      return packageDetails.parameters.map((param, index) => {
        let detail = '';
        if (param.required) {
          detail = 'required';
        } else if (param.default) {
          detail = `default: "${param.default}"`;
        }

        return {
          label: param.name,
          kind: CompletionItemKind.Property,
          detail: detail,
          documentation: param.description,
          data: `param-${index}`,
          insertText: `${param.name}: `,
        };
      });
    } catch (error) {
      connection.console.error(`Error getting parameter completions: ${error instanceof Error ? error.message : String(error)}`);
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

// Hover provider
connection.onHover(async (params: TextDocumentPositionParams): Promise<Hover | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !isMintWorkflowFile(document)) {
    return null;
  }
  
  const lines = document.getText().split('\n');
  const currentLine = lines[params.position.line];
  
  if (!currentLine) {
    return null;
  }
  
  // Check if this line contains a call declaration with package and version
  const packageInfo = extractPackageAndVersionFromCallLine(currentLine);
  if (packageInfo) {
    try {
      // Fetch detailed package information for the specific version
      const packageDetails = await fetchPackageDetails(packageInfo.packageName, packageInfo.version);
      if (!packageDetails) {
        return null;
      }
      
      // Build hover content with detailed information
      const hoverParts = [
        `**${packageDetails.name}** v${packageDetails.version}`,
        '',
        packageDetails.description,
        ''
      ];

      // Add source code URL if available
      if (packageDetails.source_code_url) {
        hoverParts.push(`**Source Code:** ${packageDetails.source_code_url}`);
      }

      // Add issue tracker URL if available
      if (packageDetails.issue_tracker_url) {
        hoverParts.push('', `**Issues:** ${packageDetails.issue_tracker_url}`);
      }

      // Add parameters if available
      if (packageDetails.parameters && packageDetails.parameters.length > 0) {
        hoverParts.push('', '**Parameters:**');
        
        // Sort parameters: required first, then by name
        const sortedParams = [...packageDetails.parameters].sort((a, b) => {
          // Required parameters come first
          if (a.required && !b.required) return -1;
          if (!a.required && b.required) return 1;
          
          // Within same required status, sort alphabetically by name
          return a.name.localeCompare(b.name);
        });
        
        sortedParams.forEach(param => {
          let paramInfo = `- \`${param.name}\``;
          
          if (param.required) {
            paramInfo += ' **(required)**';
          } else if (param.default) {
            paramInfo += ` *(default: "${param.default}")*`;
          }
          
          paramInfo += `: ${param.description}`;
          hoverParts.push(paramInfo);
        });
      }

      const hoverContent = {
        kind: MarkupKind.Markdown,
        value: hoverParts.join('\n')
      };
      
      return {
        contents: hoverContent
      };
    } catch (error) {
      connection.console.error(`Error getting hover info: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  // Check if we're hovering over a parameter name in a with block
  const paramMatch = currentLine.match(/^\s*([a-zA-Z0-9_-]+):/);
  if (paramMatch) {
    const paramName = paramMatch[1];
    
    try {
      // Find the associated call package
      const packageInfo = findCallPackageForWithBlock(document, params.position.line);
      if (!packageInfo) {
        return null;
      }

      // Fetch detailed package information to get parameter details
      const packageDetails = await fetchPackageDetails(packageInfo.packageName, packageInfo.version);
      if (!packageDetails || !packageDetails.parameters) {
        return null;
      }

      // Find the specific parameter
      const parameter = packageDetails.parameters.find(p => p.name === paramName);
      if (!parameter) {
        return null;
      }

      // Build hover content for the parameter
      const hoverParts = [
        `**${parameter.name}**`
      ];

      if (parameter.required) {
        hoverParts.push('*Required parameter*');
      } else if (parameter.default) {
        hoverParts.push(`*Default: "${parameter.default}"*`);
      }

      hoverParts.push('', parameter.description);

      const hoverContent = {
        kind: MarkupKind.Markdown,
        value: hoverParts.join('\n')
      };
      
      return {
        contents: hoverContent
      };
    } catch (error) {
      connection.console.error(`Error getting parameter hover info: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  return null;
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
