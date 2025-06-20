import * as YAML from 'yaml';

export type Snippets = Map<string, { filePath: string; fileContents: string; yamlNode: YAML.ParsedNode }>;

export enum EnvironmentVariableCacheKey {
  Included = 'included',
  Excluded = 'excluded',
}

export enum ParallelismType {
  Matrix = 'matrix',
  Total = 'total',
  Values = 'values',
}

export enum TaskType {
  Command = 'command',
  Leaf = 'leaf',
  EmbeddedRun = 'embedded-run',
  Parallel = 'parallel',
}

export enum Severity {
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
}

export enum OnOverflow {
  CancelWaiting = 'cancel-waiting',
  CancelRunning = 'cancel-running',
  Queue = 'queue',
}

export const DEFAULT_FOREGROUND_TERM_GRACE_PERIOD_SECONDS = 0;
export const DEFAULT_BACKGROUND_TERM_GRACE_PERIOD_SECONDS = 10;

export type Source = {
  definition: string;
  start: number;
  end: number;
};

export enum DependencyType {
  Standard = 'standard',
}

export type StandardDependencies = {
  type: DependencyType;
  keys: string[];
};

export type Dependencies = {
  type: DependencyType;
  keys: string[];
};

export type EnvJoinMergeStrategy = {
  strategy: 'join';
  by: string;
};

export type EnvOverrideMergeStrategy = {
  strategy: 'override';
};

export type EnvMergeStrategy = EnvJoinMergeStrategy | EnvOverrideMergeStrategy;

export type EnvInherit = 'all-used-tasks' | string[];

export type EnvDescriptor = {
  value?: string;
  cacheKey: EnvironmentVariableCacheKey;
};

export type TaskDefinitionEnv = {
  inherit?: EnvInherit;
  envVars?: Record<string, EnvDescriptor>;
  merge?: Record<string, EnvMergeStrategy>;
};

export type ParallelismValue = Record<string, string | number | boolean>;

export enum AfterType {
  Task = 0,
  TaskList = 1,
  Template = 2,
}

export type AfterTask = {
  type: AfterType.Task;
  task: string;
};

export type AfterTaskList = {
  type: AfterType.TaskList;
  tasks: string[];
};

export type AfterTemplate = {
  type: AfterType.Template;
  template: string;
};

export type After = AfterTask | AfterTaskList | AfterTemplate;

export type CacheConfiguration = {
  enabled: boolean | string;
  ttl?: string;
};

export enum LeafIdentifierType {
  NameVersion = 'name-version',
  Digest = 'digest',
}

export type LeafName = {
  type: LeafIdentifierType.NameVersion;
  name: string;
  version: string;
};

export type LeafDigest = {
  type: LeafIdentifierType.Digest;
  digest: string;
};

export type LeafIdentifier = LeafName | LeafDigest;

export enum ToolCacheNameType {
  TaskKey = 'task-key',
  LiteralString = 'literal-string',
}

export type ToolCacheNameTaskKey = {
  type: ToolCacheNameType.TaskKey;
};

export type ToolCacheNameLiteralString = {
  type: ToolCacheNameType.LiteralString;
  value: string;
};

export type ToolCacheName = ToolCacheNameTaskKey | ToolCacheNameLiteralString;

export type BackgroundProcessReadyCheck = {
  run: string;
  timeoutSeconds?: number;
};

export type BackgroundProcess = {
  key: string;
  run: string;
  readyCheck?: BackgroundProcessReadyCheck;
  terminateGracePeriodSeconds?: number;
  after?: string[];
};

export type TotalParallelism = {
  type: ParallelismType.Total;
  total: string;
};

export type MatrixParallelism = {
  type: ParallelismType.Matrix;
  matrix: Record<string, string[] | string>;
};

export type ValuesParallelism = {
  type: ParallelismType.Values;
  values: string | Record<string, string>[];
};

export type Parallelism = TotalParallelism | MatrixParallelism | ValuesParallelism;

export type PartialParallelConfiguration = {
  key: string | null;
  tasksLimit?: number | null;
  parallelism: Parallelism;
};

export type PartialConcurrencyPool = {
  id: string;
  if?: string;
  capacity: number;
  onOverflow: OnOverflow;
};

export type PartialRunToolCache = {
  vault: string;
};

export type PartialBaseLayer = {
  os: string;
  tag: string;
  arch?: string;
};

export interface ScopedTaskDefinition {
  scope: string[];
  key: string;
}

export type ScopedTaskKey = string & {
  __scopedTaskKey: never;
};

export const KEY_PATTERN = '^[A-Za-z0-9_-]+$';
export const KEY_REGEXP: RegExp;
export const KEY_INVALID_CHARSET_REGEXP: RegExp;
export const SAFE_TASK_KEY_DELIMITER = '.';
export const RUN_SCOPE: ScopedTaskKey;

export function getScopedKey({ key, scope }: ScopedTaskDefinition): ScopedTaskKey;
export function unscopeKey(scopedKey: ScopedTaskKey): {
  scope: string[];
  key: string;
};
export function scopeEqual(lhs: string[], rhs: string[]): boolean;
export function taskScopeEquals(scopedKey: ScopedTaskKey, scope: string[]): boolean;
export function relativeScopedKey(currentScope: string[], scopedKey: ScopedTaskKey): ScopedTaskKey;

export type StackEntry = {
  fileName: string;
  line: number;
  column: number;
  name?: string;
  endLine?: number;
  endColumn?: number;
};

export type UserMessage = {
  type: string;
  message: string;
  advice?: string;
  fileName?: string;
  line?: number;
  column?: number;
  stackTrace?: StackEntry[];
};

export interface YamlParser {
  safelyParseRun(fileName: string, source: string, snippets: Snippets): Promise<{ partialRunDefinition: PartialRunDefinition; errors: UserMessage[] }>;
}

export namespace YamlParser {
  export function safelyParseRun(
    fileName: string,
    source: string,
    snippets: Snippets,
  ): Promise<{ partialRunDefinition: PartialRunDefinition; errors: UserMessage[] }>;
}

export type BaseTrigger = {
  init: Record<string, string>;
  if?: string;
  target?: string | string[];
  title?: string;
};

export type GithubPushTrigger = BaseTrigger & {
  statusChecks: Array<{
    tasks: string[];
    name?: string;
    status: 'success' | 'failure' | 'pending';
  }>;
};

export type GitHubPullRequestTrigger = BaseTrigger & {
  actions?: string[];
  statusChecks: Array<{
    tasks: string[];
    name?: string;
    status: 'success' | 'failure' | 'pending';
  }>;
};

export type GitHubMergeGroupTrigger = BaseTrigger & {
  actions?: string[];
  statusChecks: Array<{
    tasks: string[];
    name?: string;
    status: 'success' | 'failure' | 'pending';
  }>;
};

export type GitHubTriggers = {
  push: GithubPushTrigger[];
  pullRequest: GitHubPullRequestTrigger[];
  mergeGroup: GitHubMergeGroupTrigger[];
};

export type GitlabMergeRequestTrigger = BaseTrigger & {
  actions?: string[];
};

export type GitlabTriggers = {
  push: BaseTrigger[];
  tagPush: BaseTrigger[];
  mergeRequest: GitlabMergeRequestTrigger[];
};

export type CronTrigger = BaseTrigger & {
  key: string;
  schedule: string;
  branch?: string;
  resetToolCache?: boolean;
};

export type CliTrigger = {
  title?: string;
  init: Record<string, string>;
};

export type DispatchTrigger = BaseTrigger & {
  key: string;
  params: Array<{
    key: string;
    name?: string;
    description?: string;
    default?: string;
    required: boolean;
  }>;
};

export type Triggers = {
  github: GitHubTriggers;
  gitlab: GitlabTriggers;
  cron: CronTrigger[];
  cli: CliTrigger;
  dispatch: DispatchTrigger[];
};

export type SharedTaskDefinition = {
  key: string;
  filter?: {
    workspace?: string | (string | { path: string; cacheKey: 'included' | 'excluded' })[];
    artifacts?: Record<string, string | (string | { path: string; cacheKey: 'included' | 'excluded' })[]>;
  };
  dependencies: Dependencies;
  after?: After;
  if?: string;
  rawSource?: Source;
  cacheConfiguration?: CacheConfiguration;
  warningMessages: Array<{
    type: string;
    message: string;
    advice?: string;
    fileName?: string;
    line?: number;
    column?: number;
    stackTrace?: Array<{
      fileName: string;
      line: number;
      column: number;
      name?: string;
      endLine?: number;
      endColumn?: number;
    }>;
    frame?: string;
  }>;
};

export type CommandTaskDefinition = SharedTaskDefinition & {
  agent: {
    memory?: string;
    cpus?: string;
    disk: {
      size?: string;
    };
    staticIps?: string;
    tmpfs?: boolean;
  };
  type: TaskType.Command;
  command: string;
  backgroundProcesses: BackgroundProcess[];
  successExitCodes: number[];
  testResultsPaths: Array<{
    path: string;
    options?: {
      framework: string;
      language: string;
    };
  }>;
  artifactPaths: Array<{
    key: string;
    path: string;
  }>;
  problemMatchers: Array<{
    owner: string;
    severity?: Severity;
    pattern: Array<{
      regexp: string;
      file?: number;
      fromPath?: number;
      line?: number;
      column?: number;
      severity?: number;
      code?: number;
      message?: number;
      loop?: boolean;
    }>;
  }>;
  problemPaths: Array<{
    path: string;
    format: 'auto' | 'problem-json' | 'github-annotation-json' | 'github-annotations-action-json';
  }>;
  env?: TaskDefinitionEnv;
  timeoutMinutes?: number;
  terminateGracePeriodSeconds?: number;
  toolCache?: ToolCacheName;
  parallel?: PartialParallelConfiguration;
  docker?: boolean | 'preserve-data' | (string & {});
  outputFilesystemFilter: {
    workspace?: string[];
    system?: string[];
  };
};

export type LeafTaskDefinition = SharedTaskDefinition & {
  type: TaskType.Leaf;
  leaf: LeafIdentifier;
  parameters?: Record<string, string>;
  env?: TaskDefinitionEnv;
  parallel?: PartialParallelConfiguration;
};

export enum EmbeddedRunDefinitionSourceType {
  InMemoryMintDir = 'in-memory-mint-dir',
  TaskArtifact = 'task-artifact',
}

export type InMemoryMintDirEmbeddedRunDefinitionSource = {
  type: EmbeddedRunDefinitionSourceType.InMemoryMintDir;
  runDefinitionPath: string;
};

export type TaskArtifactEmbeddedRunDefinitionSource = {
  type: EmbeddedRunDefinitionSourceType.TaskArtifact;
  expression: string;
};

export type EmbeddedRunDefinitionSource = InMemoryMintDirEmbeddedRunDefinitionSource | TaskArtifactEmbeddedRunDefinitionSource;

export type EmbeddedRunTaskDefinition = {
  key: string;
  after?: After;
  if?: string;
  cacheConfiguration?: CacheConfiguration;
  warningMessages: Array<{
    type: string;
    message: string;
    advice?: string;
    fileName?: string;
    line?: number;
    column?: number;
    stackTrace?: Array<{
      fileName: string;
      line: number;
      column: number;
      name?: string;
      endLine?: number;
      endColumn?: number;
    }>;
    frame?: string;
  }>;
  rawSource?: Source;
  type: TaskType.EmbeddedRun;
  runDefinitionSource: EmbeddedRunDefinitionSource;
  parameters?: Record<string, string>;
  parallel?: PartialParallelConfiguration;
  targets?: string[];
};

export type PartialTaskDefinition = CommandTaskDefinition | LeafTaskDefinition | EmbeddedRunTaskDefinition;

export type PartialRunDefinition = {
  concurrencyPools?: PartialConcurrencyPool[];
  triggers?: Triggers;
  toolCache?: PartialRunToolCache;
  tasks: PartialTaskDefinition[];
  baseLayer?: PartialBaseLayer;
  warningMessages: Array<{
    type: string;
    message: string;
    advice?: string;
    fileName?: string;
    line?: number;
    column?: number;
    stackTrace?: Array<{
      fileName: string;
      line: number;
      column: number;
      name?: string;
      endLine?: number;
      endColumn?: number;
    }>;
    frame?: string;
  }>;
};

export const DEFAULT_PARALLEL_TASKS_LIMIT = 16;
export const MAXIMUM_PARALLEL_TASKS_LIMIT = 256;
