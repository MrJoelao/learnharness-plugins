#!/usr/bin/env node
/**
 * Generates registry.json from workspace plugins defined in package.json.
 *
 * Usage:
 *   node scripts/generate-registry.mjs
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const ALLOWED_ICONS = new Set([
  "BookOpen",
  "Brain",
  "Calculator",
  "Code",
  "FlaskConical",
  "GraduationCap",
  "LayoutGrid",
  "Lightbulb",
  "Network",
  "Puzzle",
  "Target"
]);

const REQUIRED_MANIFEST_FIELDS = ["id", "name", "version", "description"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateManifest(manifest, workspace) {
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (typeof manifest[field] !== "string" || manifest[field].trim() === "") {
      throw new Error(`${workspace}/manifest.json missing required string field '${field}'`);
    }
  }
}

function readAndValidateModes(pluginDir, workspace) {
  const modesPath = path.join(pluginDir, "modes.json");
  if (!fs.existsSync(modesPath)) {
    return [];
  }

  const data = readJson(modesPath);
  if (!data || !Array.isArray(data.modes)) {
    throw new Error(`${workspace}/modes.json must contain a 'modes' array`);
  }

  for (const mode of data.modes) {
    if (!mode || typeof mode.id !== "string" || mode.id.trim() === "") {
      throw new Error(`${workspace}/modes.json contains a mode without a valid 'id'`);
    }
    if (typeof mode.name !== "string" || mode.name.trim() === "") {
      throw new Error(`${workspace}/modes.json mode '${mode.id}' missing a valid 'name'`);
    }
    if (typeof mode.icon !== "string" || !ALLOWED_ICONS.has(mode.icon)) {
      throw new Error(
        `${workspace}/modes.json mode '${mode.id}' has invalid icon '${mode.icon}'. Allowed: ${[...ALLOWED_ICONS].join(", ")}`
      );
    }
  }

  return data.modes;
}

function main() {
  const pkgPath = path.join(repoRoot, "package.json");
  const pkg = readJson(pkgPath);
  const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : [];

  const plugins = [];

  for (const workspace of workspaces) {
    const pluginDir = path.join(repoRoot, workspace);
    if (!fs.existsSync(pluginDir) || !fs.statSync(pluginDir).isDirectory()) {
      console.warn(`Skipping missing workspace: ${workspace}`);
      continue;
    }

    const manifestPath = path.join(pluginDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Missing manifest.json in workspace '${workspace}'`);
    }

    const manifest = readJson(manifestPath);
    validateManifest(manifest, workspace);

    const modes = readAndValidateModes(pluginDir, workspace);
    const readmeExists = fs.existsSync(path.join(pluginDir, "README.md"));

    const entry = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      ...(typeof manifest.author === "string" ? { author: manifest.author } : {}),
      ...(typeof manifest.minAppVersion === "string" ? { minAppVersion: manifest.minAppVersion } : {}),
      ...(typeof manifest.apiVersion === "number" ? { apiVersion: manifest.apiVersion } : {}),
      path: workspace,
      ...(readmeExists ? { readmePath: `${workspace}/README.md` } : {}),
      modes
    };

    plugins.push(entry);
  }

  const registry = {
    version: 1,
    name: "LearnHarness Community Plugins",
    plugins
  };

  const outPath = path.join(repoRoot, "registry.json");
  fs.writeFileSync(outPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(`Generated ${outPath} with ${plugins.length} plugin(s).`);
}

main();
