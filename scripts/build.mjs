#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const libDir = join(rootDir, "lib");

mkdirSync(libDir, { recursive: true });

function stripModuleSyntax(code) {
  return code
    // Remove import blocks (single and multi-line)
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["']\s*;?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["']\s*;?\s*$/gm, "")
    // Convert export const/let/var/function/class/async function to plain declarations
    .replace(/^\s*export\s+(const|let|var|function|class|async\s+function)\s+/gm, "$1 ")
    // Remove export { ... } blocks
    .replace(/^\s*export\s*\{[\s\S]*?\}\s*;?\s*$/gm, "");
}

// 1. Build Server Bundle: lib/index.js
const engineCode = readFileSync(join(rootDir, "src/core/moss-engine.js"), "utf8");
const serverCode = readFileSync(join(rootDir, "src/server/index.js"), "utf8");

const serverImports = [
  'import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";',
  'import { join } from "node:path";',
  'import { homedir } from "node:os";',
].join("\n") + "\n";
const serverBody = [
  "// === Embedded Core: src/core/moss-engine.js ===",
  stripModuleSyntax(engineCode),
  "// === Server Entry: src/server/index.js ===",
  stripModuleSyntax(serverCode),
  "export { name, inject, apply, STATE_ROUTE, ACTION_ROUTE };",
].join("\n\n");

writeFileSync(join(libDir, "index.js"), serverImports + "\n" + serverBody + "\n", "utf8");

// 2. Build Client Bundle: lib/client.js
const stylesCode = readFileSync(join(rootDir, "src/client/styles.js"), "utf8");
const documentsCode = readFileSync(join(rootDir, "src/client/document-store.js"), "utf8");
const appCode = readFileSync(join(rootDir, "src/client/workbench-app.js"), "utf8");
const entryCode = readFileSync(join(rootDir, "src/client/entry.js"), "utf8");

const clientBundle = `window.__ModuleLoader__.load({
  id: "dsh-moss-workbench",
  factory(require) {
    const React = require("react");

    // === 1. Core MOSS Geometry & Compiler Engine ===
${stripModuleSyntax(engineCode)}

    // === 2. Scoped Styles ===
${stripModuleSyntax(stylesCode)}

    // === 3. Persistent Document Store ===
${stripModuleSyntax(documentsCode)}

    // === 4. Workbench React Application ===
${stripModuleSyntax(appCode)}

    // === 4. DSH Client Slot Registration ===
${stripModuleSyntax(entryCode)}

    return createClientPlugin(React);
  }
});
`;

writeFileSync(join(libDir, "client.js"), clientBundle, "utf8");
console.log("Built lib/index.js and lib/client.js successfully.");
