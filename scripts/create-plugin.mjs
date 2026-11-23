#!/usr/bin/env node
/**
 * Scaffold a new LearnHarness plugin.
 * Usage:
 *   node scripts/create-plugin.mjs <plugin-id> [Plugin Display Name]
 *
 * Example:
 *   node scripts/create-plugin.mjs math-grapher "Math Grapher"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.log("Usage: node scripts/create-plugin.mjs <plugin-id> [Plugin Name]");
  console.log("Example: node scripts/create-plugin.mjs math-grapher 'Math Grapher'");
  process.exit(args.length === 0 ? 1 : 0);
}

const pluginId = args[0].trim().toLowerCase();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pluginId)) {
  console.error(`Error: Invalid plugin id '${pluginId}'. Must be lowercase letters, digits, and hyphens (e.g. 'math-grapher').`);
  process.exit(1);
}

const targetDir = path.join(repoRoot, pluginId);
if (fs.existsSync(targetDir)) {
  console.error(`Error: Plugin directory already exists: ${targetDir}`);
  process.exit(1);
}

const pluginName = args[1] ? args[1].trim() : pluginId.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

console.log(`Scaffolding new LearnHarness plugin '${pluginName}' (${pluginId})...`);

fs.mkdirSync(targetDir, { recursive: true });
fs.mkdirSync(path.join(targetDir, "src"), { recursive: true });
fs.mkdirSync(path.join(targetDir, "scripts"), { recursive: true });
fs.mkdirSync(path.join(targetDir, "tests"), { recursive: true });

// Copy .sdk from os-simulator/.sdk
const sdkSource = path.join(repoRoot, "os-simulator", ".sdk");
const sdkDest = path.join(targetDir, ".sdk");
if (fs.existsSync(sdkSource)) {
  fs.cpSync(sdkSource, sdkDest, { recursive: true });
} else {
  console.warn("Warning: os-simulator/.sdk not found. Make sure to generate .sdk before building.");
}

// 1. manifest.json
const manifest = {
  apiVersion: 1,
  id: pluginId,
  name: pluginName,
  version: "1.0.0",
  minAppVersion: "0.7.0",
  description: `Plugin ${pluginName} per LearnHarness.`,
  author: "Joel",
  main: "main.js",
  backend: "backend.cjs",
  styles: "styles.css"
};
fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// 2. package.json
const packageJson = {
  name: `learnharness-${pluginId}`,
  version: "1.0.0",
  private: true,
  type: "module",
  license: "AGPL-3.0-only",
  scripts: {
    build: "node scripts/build.mjs",
    typecheck: "tsc --noEmit",
    test: "tsx --test tests/*.test.ts"
  },
  devDependencies: {
    "@types/node": "24.13.3",
    esbuild: "0.28.2",
    "learnharness-plugin-api": "file:.sdk",
    tsx: "4.23.12",
    typescript: "5.9.3"
  }
};
fs.writeFileSync(path.join(targetDir, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");

// 3. tsconfig.json
const tsconfig = {
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    lib: ["ES2023", "DOM", "DOM.Iterable"],
    types: ["node"],
    strict: true,
    noUncheckedIndexedAccess: true,
    verbatimModuleSyntax: true,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true
  },
  include: ["src/**/*.ts", "tests/**/*.ts"]
};
fs.writeFileSync(path.join(targetDir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2) + "\n");

// 4. .gitignore
const gitignore = `node_modules/
dist/
`;
fs.writeFileSync(path.join(targetDir, ".gitignore"), gitignore);

// 5. scripts/build.mjs
const buildScript = `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist");

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const common = { absWorkingDir: root, bundle: true, target: "es2022", minify: true, legalComments: "eof" };
await build({ ...common, entryPoints: ["src/main.ts"], outfile: path.join(output, "main.js"), format: "esm", platform: "browser" });
await build({ ...common, entryPoints: ["src/backend.ts"], outfile: path.join(output, "backend.cjs"), format: "cjs", platform: "node" });

for (const file of ["manifest.json", "README.md", "LICENSE"]) {
  if (fs.existsSync(path.join(root, file))) {
    fs.copyFileSync(path.join(root, file), path.join(output, file));
  }
}
if (fs.existsSync(path.join(root, "src/styles.css"))) {
  fs.copyFileSync(path.join(root, "src/styles.css"), path.join(output, "styles.css"));
}

console.log(\`Built \${root}: \${output}\`);
`;
fs.writeFileSync(path.join(targetDir, "scripts", "build.mjs"), buildScript);

// 6. src/main.ts
const mainTs = `import type { PluginFrontendContext, PluginWorkspaceRendererContext } from "learnharness-plugin-api";

export function activate(ctx: PluginFrontendContext): () => void {
  const unregisterView = ctx.registerView({
    id: "${pluginId}-view",
    name: "${pluginName}",
    mount(container: HTMLElement, signal: AbortSignal) {
      const el = document.createElement("div");
      el.className = "${pluginId}-root p-4";
      el.innerHTML = \`<h2 class="text-lg font-semibold">${pluginName}</h2><p class="text-sm text-muted-foreground mt-2">Plugin inizializzato correttamente.</p>\`;
      container.appendChild(el);

      const cleanup = () => {
        el.remove();
      };

      signal.addEventListener("abort", cleanup, { once: true });
      return cleanup;
    }
  });

  return () => {
    unregisterView();
  };
}
`;
fs.writeFileSync(path.join(targetDir, "src", "main.ts"), mainTs);

// 7. src/backend.ts
const backendTs = `import type { PluginBackendContext } from "learnharness-plugin-api";

export function activate(ctx: PluginBackendContext): () => void {
  const unregisterHandler = typeof ctx.handle === "function"
    ? ctx.handle("ping", () => ({ status: "ok", timestamp: Date.now() }))
    : () => {};

  return () => {
    unregisterHandler();
  };
}
`;
fs.writeFileSync(path.join(targetDir, "src", "backend.ts"), backendTs);

// 8. src/styles.css
const stylesCss = `.${pluginId}-root {
  color: var(--foreground);
  background-color: var(--background);
}
`;
fs.writeFileSync(path.join(targetDir, "src", "styles.css"), stylesCss);

// 9. tests/index.test.ts
const testTs = `import { test } from "node:test";
import assert from "node:assert/strict";
import { activate as activateBackend } from "../src/backend.ts";

test("${pluginName}: backend registers ping handler", () => {
  const handlers = new Map<string, Function>();
  const dummyCtx: any = {
    handle(name: string, fn: Function) {
      handlers.set(name, fn);
      return () => handlers.delete(name);
    }
  };

  const cleanup = activateBackend(dummyCtx);
  assert.ok(handlers.has("ping"));
  const res = handlers.get("ping")!();
  assert.equal(res.status, "ok");

  cleanup();
  assert.equal(handlers.size, 0);
});
`;
fs.writeFileSync(path.join(targetDir, "tests", "index.test.ts"), testTs);

// 10. README.md
const readmeMd = `# ${pluginName}

Plugin per [LearnHarness](https://github.com/MrJoelao/learnharness).

## Sviluppo

\`\`\`bash
npm install
npm run typecheck
npm test
npm run build
\`\`\`
`;
fs.writeFileSync(path.join(targetDir, "README.md"), readmeMd);

// Update root package.json workspaces if exists
const rootPkgPath = path.join(repoRoot, "package.json");
if (fs.existsSync(rootPkgPath)) {
  try {
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
    if (Array.isArray(rootPkg.workspaces) && !rootPkg.workspaces.includes(pluginId)) {
      rootPkg.workspaces.push(pluginId);
      rootPkg.workspaces.sort();
      fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
      console.log(`✔ Added '${pluginId}' to root package.json workspaces.`);
    }
  } catch {}
}

console.log(`✔ Plugin '${pluginName}' scaffolded successfully at: ${targetDir}`);
console.log(`  cd ${pluginId} && npm install && npm test`);
