#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('fs');
const { resolve } = require('path');

const outputDir = resolve(__dirname, '..', 'dist', 'cjs');
mkdirSync(outputDir, { recursive: true });

const packageJsonPath = resolve(outputDir, 'package.json');
const contents = `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`;

writeFileSync(packageJsonPath, contents);
