import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repoRoot, 'tests', 'live', 'statusTest.ts');

let tsModule;
try {
  tsModule = await import('typescript');
} catch (error) {
  console.error('Unable to load TypeScript compiler. Make sure dev dependencies are installed.');
  throw error;
}

const ts = tsModule.default ?? tsModule;
const transpileModule = ts.transpileModule ?? ts.transpile;
if (!transpileModule) {
  throw new Error('TypeScript transpileModule API is unavailable.');
}

const moduleKind =
  ts.ModuleKind?.CommonJS ??
  ts.ModuleKind?.NodeNext ??
  ts.ModuleKind?.ESNext ??
  ts.ModuleKind?.ES2022 ??
  ts.ModuleKind?.ES2015;
const moduleResolution =
  ts.ModuleResolutionKind?.NodeNext ??
  ts.ModuleResolutionKind?.Node16 ??
  ts.ModuleResolutionKind?.NodeJs ??
  ts.ModuleResolutionKind?.Classic;
const scriptTarget =
  ts.ScriptTarget?.ES2022 ??
  ts.ScriptTarget?.ES2020 ??
  ts.ScriptTarget?.ESNext ??
  ts.ScriptTarget?.Latest ??
  ts.ScriptTarget?.ES2015;

const source = readFileSync(sourcePath, 'utf8');
const transpiled = transpileModule(source, {
  compilerOptions: {
    module: moduleKind,
    moduleResolution,
    target: scriptTarget,
    esModuleInterop: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    inlineSourceMap: true,
    inlineSources: true,
  },
  fileName: path.basename(sourcePath),
});

const loaderCompilerOptions = {
  module: ts.ModuleKind?.CommonJS ?? 1,
  moduleResolution: moduleResolution,
  target: ts.ScriptTarget?.ES2020 ?? ts.ScriptTarget?.ES2019 ?? ts.ScriptTarget?.ES2017 ?? 1,
  esModuleInterop: true,
  resolveJsonModule: true,
  skipLibCheck: true,
  inlineSourceMap: true,
  inlineSources: true,
};

const tsRuntimeLoader = `const Module = require("module");
const { readFileSync } = require("fs");
let tsRuntime;
try {
  tsRuntime = require("typescript");
} catch (error) {
  console.error("Unable to load TypeScript compiler at runtime. Make sure dev dependencies are installed.");
  throw error;
}
const transpileRuntime = tsRuntime.transpileModule ?? tsRuntime.transpile;
if (!transpileRuntime) {
  throw new Error("TypeScript transpileModule API is unavailable.");
}
const loaderCompilerOptions = ${JSON.stringify(loaderCompilerOptions)};
const register = (ext) => {
  const original = Module._extensions[ext];
  const handler = function (module, filename) {
    if (filename.endsWith('.d.ts')) {
      module._compile('', filename);
      return;
    }
    const sourceText = readFileSync(filename, 'utf8');
    const { outputText } = transpileRuntime(sourceText, {
      compilerOptions: loaderCompilerOptions,
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
  handler.__codexLive = true;
  Module._extensions[ext] = handler;
  return original;
};
register('.ts');
register('.mts');
register('.cts');
`;

const output = `${tsRuntimeLoader}\n${transpiled.outputText}`;

const tempFile = path.join(
  repoRoot,
  'tests',
  'live',
  `.statusTest-live-${process.pid}-${Date.now()}.cjs`,
);
writeFileSync(tempFile, output, 'utf8');

const result = spawnSync(process.execPath, ['--enable-source-maps', tempFile], {
  stdio: 'inherit',
  env: process.env,
  cwd: repoRoot,
});

try {
  rmSync(tempFile, { force: true });
} catch {
  // ignore cleanup errors
}

if (typeof result.status === 'number') {
  process.exit(result.status);
}
if (result.error) {
  throw result.error;
}
process.exit(1);
