#!/usr/bin/env node
/**
 * Scaffold a new LearnHarness plugin with standard archetypes and $unslop design system.
 *
 * Usage:
 *   node scripts/create-plugin.mjs <plugin-id> [Plugin Display Name] [--template=lab|library|tool]
 *
 * Templates:
 *   - lab (default): Interactive Study Hub simulator (top toolbar, split workbench/telemetry, copilot AI pill)
 *   - library: Resource collection (search/filter bar, card grid, creation dialog)
 *   - tool: Single surface workbench
 *
 * Example:
 *   node scripts/create-plugin.mjs logic-circuits "Logic Circuits Lab" --template=lab
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0 || rawArgs.includes("--help") || rawArgs.includes("-h")) {
  console.log("Usage: node scripts/create-plugin.mjs <plugin-id> [Plugin Name] [--template=lab|library|tool]");
  console.log("Templates:");
  console.log("  --template=lab      (default) Interactive Study Hub simulator with toolbar, telemetry, and Copilot AI");
  console.log("  --template=library  Card/resource collection with search bar, grid, and modal dialog");
  console.log("  --template=tool     Single-surface custom tool");
  process.exit(rawArgs.length === 0 ? 1 : 0);
}

let template = "lab";
const filteredArgs = [];
for (const arg of rawArgs) {
  if (arg.startsWith("--template=")) {
    template = arg.slice("--template=".length).toLowerCase();
  } else {
    filteredArgs.push(arg);
  }
}

if (!["lab", "library", "tool"].includes(template)) {
  console.error(`Error: Unknown template '${template}'. Choose from: lab, library, tool.`);
  process.exit(1);
}

const pluginId = filteredArgs[0]?.trim().toLowerCase();
if (!pluginId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pluginId)) {
  console.error(`Error: Invalid plugin id '${pluginId}'. Must be lowercase letters, digits, and hyphens (e.g. 'logic-circuits').`);
  process.exit(1);
}

const targetDir = path.join(repoRoot, pluginId);
if (fs.existsSync(targetDir)) {
  console.error(`Error: Plugin directory already exists: ${targetDir}`);
  process.exit(1);
}

const pluginName = filteredArgs[1]?.trim() || pluginId.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

console.log(`Scaffolding '${pluginName}' (${pluginId}) using archetype: '${template}'...`);

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

// 5. scripts/build.mjs (bundles TS and CSS with esbuild, flattening shared/plugin-base.css)
const buildScript = `import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist");

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const common = { absWorkingDir: root, bundle: true, target: "es2022", minify: true, legalComments: "eof" };
await build({ ...common, entryPoints: ["src/main.ts"], outfile: path.join(output, "main.js"), format: "esm", platform: "browser" });
await build({ ...common, entryPoints: ["src/backend.ts"], outfile: path.join(output, "backend.cjs"), format: "cjs", platform: "node" });

// Bundle styles.css with esbuild so @import "../../shared/plugin-base.css" is inlined
if (fs.existsSync(path.join(root, "src/styles.css"))) {
  await build({
    entryPoints: [path.join(root, "src/styles.css")],
    outfile: path.join(output, "styles.css"),
    bundle: true,
    minify: true
  });
}

for (const file of ["manifest.json", "README.md", "LICENSE"]) {
  if (fs.existsSync(path.join(root, file))) {
    fs.copyFileSync(path.join(root, file), path.join(output, file));
  }
}

const presetsSrc = path.join(root, "presets");
if (fs.existsSync(presetsSrc)) {
  fs.cpSync(presetsSrc, path.join(output, "presets"), { recursive: true });
}

console.log(\`Built \${root}: \${output}\`);
`;
fs.writeFileSync(path.join(targetDir, "scripts", "build.mjs"), buildScript);

// 6. Template specific files
let mainTs = "";
let backendTs = "";
let stylesCss = `@import "../../shared/plugin-base.css";\n\n`;
let testTs = "";

if (template === "lab") {
  stylesCss += `/* ${pluginName} Lab Styles */
.${pluginId}-canvas {
  min-height: 400px;
  border-radius: var(--radius-lg, 12px);
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--card) 40%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}
`;

  mainTs = `import type { PluginFrontendContext, PluginWorkspaceRendererContext } from "learnharness-plugin-api";

export function activate(ctx: PluginFrontendContext): () => void {
  const unregisterMode = ctx.registerModeRenderer("${pluginId}", "${pluginId}-mode", {
    mount(container: HTMLElement, context: PluginWorkspaceRendererContext) {
      const root = document.createElement("div");
      root.className = "lh-root ${pluginId}-root";

      // 1. Action Toolbar (Notice: host TopBar already shows the main workspace title)
      const toolbar = document.createElement("header");
      toolbar.className = "lh-toolbar";
      toolbar.innerHTML = \`
        <div class="lh-toolbar-group">
          <span class="lh-dot lh-dot-success" title="Stato simulazione: Pronto"></span>
          <span class="lh-badge">Simulazione</span>
        </div>
        <div class="lh-actions">
          <button type="button" class="lh-btn lh-btn-secondary" id="btn-reset">Reset</button>
          <button type="button" class="lh-btn lh-btn-secondary" id="btn-step">Step</button>
          <button type="button" class="lh-btn lh-btn-primary" id="btn-run">Run</button>
        </div>
      \`;

      // 2. Main Workbench
      const workbench = document.createElement("main");
      workbench.className = "lh-workbench";

      const canvasContainer = document.createElement("section");
      canvasContainer.className = "lh-canvas-container";
      canvasContainer.innerHTML = \`
        <div class="${pluginId}-canvas">
          <span class="lh-mono lh-text-muted">Simulatore pronto. Premi Run o Step.</span>
        </div>
      \`;

      const telemetryPanel = document.createElement("aside");
      telemetryPanel.className = "lh-telemetry-panel";
      telemetryPanel.innerHTML = \`
        <div class="lh-card-header">
          <h3 class="lh-card-title">Telemetria & Parametri</h3>
        </div>
        <div class="lh-card">
          <span class="lh-text-muted" style="font-size: var(--lh-text-xs, 11px);">Stato Simulazione</span>
          <strong class="lh-mono">IDLE</strong>
        </div>
      \`;

      workbench.append(canvasContainer, telemetryPanel);

      // 3. Copilot AI Pill (.lh-copilot-container)
      const copilotContainer = document.createElement("div");
      copilotContainer.className = "lh-copilot-container";
      copilotContainer.innerHTML = \`
        <div class="lh-copilot-chips">
          <button type="button" class="lh-copilot-chip">Spiega lo stato</button>
          <button type="button" class="lh-copilot-chip">Suggerisci esperimento</button>
        </div>
        <div class="lh-copilot-pill">
          <input type="text" class="lh-copilot-input" placeholder="Chiedi all'Assistente sul laboratorio..." />
        </div>
      \`;

      root.append(toolbar, workbench, copilotContainer);
      container.appendChild(root);

      const cleanup = () => {
        root.remove();
      };

      context.signal.addEventListener("abort", cleanup, { once: true });
      return cleanup;
    }
  });

  return () => {
    unregisterMode();
  };
}
`;

  backendTs = `import type { PluginBackendContext } from "learnharness-plugin-api";

export function activate(ctx: PluginBackendContext): () => void {
  const unregisterMode = ctx.registerMode({
    id: "${pluginId}-mode",
    name: "${pluginName}",
    description: "Laboratorio interattivo ${pluginName}.",
    category: "Simulation",
    icon: "Brain",
    capabilities: ["simulation", "step-by-step"],
    initializeWorkspace({ workspace, storage }) {
      storage.set("state", {
        workspaceId: workspace.id,
        currentStep: 0,
        running: false,
        updatedAt: new Date().toISOString()
      });
    }
  });

  return () => {
    unregisterMode();
  };
}
`;

  testTs = `import { test } from "node:test";
import assert from "node:assert/strict";
import { activate as activateBackend } from "../src/backend.ts";

test("${pluginName}: backend registers simulation mode correctly", () => {
  let registeredMode: any = null;
  const dummyCtx: any = {
    registerMode(def: any) {
      registeredMode = def;
      return () => { registeredMode = null; };
    }
  };

  const cleanup = activateBackend(dummyCtx);
  assert.ok(registeredMode);
  assert.equal(registeredMode.id, "${pluginId}-mode");
  assert.equal(registeredMode.category, "Simulation");

  cleanup();
  assert.equal(registeredMode, null);
});
`;
} else if (template === "library") {
  stylesCss += `/* ${pluginName} Library Styles */
.${pluginId}-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 16px;
}
`;

  mainTs = `import type { PluginFrontendContext } from "learnharness-plugin-api";

export function activate(ctx: PluginFrontendContext): () => void {
  const unregisterView = ctx.registerView({
    id: "${pluginId}-library",
    name: "${pluginName}",
    mount(container: HTMLElement, signal: AbortSignal) {
      const root = document.createElement("div");
      root.className = "lh-root ${pluginId}-root";

      const toolbar = document.createElement("header");
      toolbar.className = "lh-toolbar";
      toolbar.innerHTML = \`
        <div class="lh-toolbar-title-group">
          <h2 class="lh-toolbar-title">${pluginName}</h2>
          <span class="lh-badge">Collezione</span>
        </div>
        <div class="lh-actions">
          <input type="search" class="lh-input" placeholder="Cerca elementi..." style="width: 200px;" />
          <button type="button" class="lh-btn lh-btn-primary">+ Nuovo elemento</button>
        </div>
      \`;

      const content = document.createElement("main");
      content.className = "${pluginId}-grid";
      content.innerHTML = \`
        <div class="lh-card">
          <div class="lh-card-header">
            <h3 class="lh-card-title">Elemento Esempio #1</h3>
            <span class="lh-badge">Attivo</span>
          </div>
          <p class="lh-text-muted" style="margin: 0; font-size: 13px;">Descrizione risorsa.</p>
        </div>
      \`;

      root.append(toolbar, content);
      container.appendChild(root);

      const cleanup = () => {
        root.remove();
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

  backendTs = `import type { PluginBackendContext } from "learnharness-plugin-api";

export function activate(ctx: PluginBackendContext): () => void {
  return () => {};
}
`;

  testTs = `import { test } from "node:test";
import assert from "node:assert/strict";
import { activate as activateBackend } from "../src/backend.ts";

test("${pluginName}: backend initializes cleanly", () => {
  const dummyCtx: any = {};
  const cleanup = activateBackend(dummyCtx);
  assert.equal(typeof cleanup, "function");
  cleanup();
});
`;
} else {
  // Tool template
  mainTs = `import type { PluginFrontendContext } from "learnharness-plugin-api";

export function activate(ctx: PluginFrontendContext): () => void {
  const unregisterView = ctx.registerView({
    id: "${pluginId}-view",
    name: "${pluginName}",
    mount(container: HTMLElement, signal: AbortSignal) {
      const root = document.createElement("div");
      root.className = "lh-root ${pluginId}-root p-4";
      root.innerHTML = \`
        <div class="lh-toolbar">
          <h2 class="lh-toolbar-title">${pluginName}</h2>
          <div class="lh-actions">
            <button type="button" class="lh-btn lh-btn-secondary">Azione</button>
          </div>
        </div>
        <div class="lh-card mt-4">
          <p class="lh-text-muted">Vista strumento pronta.</p>
        </div>
      \`;
      container.appendChild(root);

      const cleanup = () => root.remove();
      signal.addEventListener("abort", cleanup, { once: true });
      return cleanup;
    }
  });

  return () => {
    unregisterView();
  };
}
`;

  backendTs = `import type { PluginBackendContext } from "learnharness-plugin-api";

export function activate(ctx: PluginBackendContext): () => void {
  return () => {};
}
`;

  testTs = `import { test } from "node:test";
import assert from "node:assert/strict";
import { activate as activateBackend } from "../src/backend.ts";

test("${pluginName}: backend initializes cleanly", () => {
  const dummyCtx: any = {};
  const cleanup = activateBackend(dummyCtx);
  assert.equal(typeof cleanup, "function");
  cleanup();
});
`;
}

fs.writeFileSync(path.join(targetDir, "src", "styles.css"), stylesCss);
fs.writeFileSync(path.join(targetDir, "src", "main.ts"), mainTs);
fs.writeFileSync(path.join(targetDir, "src", "backend.ts"), backendTs);
fs.writeFileSync(path.join(targetDir, "tests", "index.test.ts"), testTs);

// 7. README.md
const readmeMd = `# ${pluginName}

Plugin per [LearnHarness](https://github.com/MrJoelao/learnharness) basato su archetype **${template}** e design system $unslop.

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
      try {
        execSync("npm install", { cwd: repoRoot, stdio: "ignore" });
        console.log(`✔ Linked workspace dependencies via npm install.`);
      } catch {}
    }
  } catch {}
}

console.log(`✔ Plugin '${pluginName}' scaffolded successfully at: ${targetDir}`);
console.log(`  cd ${pluginId} && npm install && npm test && npm run build`);
