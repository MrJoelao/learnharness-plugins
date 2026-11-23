#!/usr/bin/env node
/**
 * Install a built plugin into a target LearnHarness installation.
 * Usage:
 *   node scripts/install-plugin.mjs <plugin-folder-or-id> [target-plugins-directory]
 *
 * Example:
 *   node scripts/install-plugin.mjs os-simulator
 *   node scripts/install-plugin.mjs os-simulator /path/to/learnharness/data/plugins
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function findDefaultPluginsDirectories() {
  const dirs = [];
  if (process.env.LEARNHARNESS_PLUGINS_DIR && fs.existsSync(process.env.LEARNHARNESS_PLUGINS_DIR)) {
    dirs.push(process.env.LEARNHARNESS_PLUGINS_DIR);
  }
  const configDir = path.join(os.homedir(), ".config", "LearnHarness", "data", "plugins");
  if (fs.existsSync(configDir)) {
    dirs.push(configDir);
  }
  if (process.env.LEARNHARNESS_PATH) {
    const candidate = path.join(process.env.LEARNHARNESS_PATH, "data", "plugins");
    if (fs.existsSync(candidate) && !dirs.includes(candidate)) dirs.push(candidate);
  }
  const relativeSibling = path.resolve(repoRoot, "..", "learnharness", "data", "plugins");
  if (fs.existsSync(relativeSibling) && !dirs.includes(relativeSibling)) dirs.push(relativeSibling);

  const defaultJoel = "/home/joel/Documents/learnharness/data/plugins";
  if (fs.existsSync(defaultJoel) && !dirs.includes(defaultJoel)) dirs.push(defaultJoel);

  return dirs;
}

function resolvePluginDir(input) {
  const direct = path.resolve(input);
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
    return direct;
  }
  const inRepo = path.join(repoRoot, input);
  if (fs.existsSync(inRepo) && fs.statSync(inRepo).isDirectory()) {
    return inRepo;
  }
  throw new Error(`Plugin directory not found: '${input}' (checked '${direct}' and '${inRepo}')`);
}

function admit(root, filename, kind, optional = false) {
  const relative = path.relative(root, filename);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error(`Refusing path outside root: ${filename}`);
  }
  let current = root;
  const parts = relative ? ["", ...relative.split(path.sep)] : [""];
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat && optional) return false;
    if (!stat) throw new Error(`Missing package path: ${current}`);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink: ${current}`);
    const directory = index < parts.length - 1 || kind === "directory";
    if (directory ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error(`Refusing non-${directory ? "directory" : "file"}: ${current}`);
    }
  }
  return true;
}

function packageFiles(root, directory) {
  admit(root, directory, "directory");
  return fs.readdirSync(directory).sort().flatMap((name) => {
    const filename = path.join(directory, name);
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) throw new Error(`Refusing package symlink: ${filename}`);
    if (["data", "node_modules", ".git"].includes(name) || /^(?:\.env(?:\..*)?|auth\.json|.*-credentials\.json.*)$/.test(name)) {
      throw new Error(`Refusing non-distributable package entry: ${filename}`);
    }
    if (stat.isDirectory()) return packageFiles(root, filename);
    admit(root, filename, "file");
    return [filename];
  });
}

function readManifest(distDir) {
  const manifestFile = path.join(distDir, "manifest.json");
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`Missing dist/manifest.json in ${distDir}. Run 'npm run build' inside the plugin first.`);
  }
  const value = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string") {
    throw new Error("Invalid plugin manifest format or missing id.");
  }
  return value;
}

export function installPlugin(pluginTarget, targetPluginsDir) {
  const pluginDir = resolvePluginDir(pluginTarget);
  const distDir = path.join(pluginDir, "dist");
  if (!fs.existsSync(distDir)) {
    throw new Error(`Dist directory '${distDir}' does not exist. Please run 'npm run build' first.`);
  }

  const destinationRoot = path.resolve(targetPluginsDir);
  if (!fs.existsSync(destinationRoot) || !fs.statSync(destinationRoot).isDirectory()) {
    throw new Error(`Target plugins directory does not exist: ${destinationRoot}`);
  }

  const pkg = readManifest(distDir);
  const pluginDestDir = path.join(destinationRoot, pkg.id);
  const finalDist = path.join(pluginDestDir, "dist");

  fs.mkdirSync(pluginDestDir, { recursive: true });

  const stage = fs.mkdtempSync(path.join(pluginDestDir, ".install-"));
  const next = path.join(stage, "next");
  const previous = path.join(stage, "previous");
  let movedOld = false;
  let installed = false;
  let keepBackup = false;

  try {
    fs.mkdirSync(next);
    const entries = packageFiles(pluginDir, distDir);
    for (const filename of entries) {
      admit(pluginDir, filename, "file");
      const out = path.join(next, path.relative(distDir, filename));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(filename, out);
    }

    readManifest(next);

    if (fs.existsSync(finalDist)) {
      fs.renameSync(finalDist, previous);
      movedOld = true;
    }

    fs.renameSync(next, finalDist);
    installed = true;
    console.log(`✔ [install] Successfully installed plugin '${pkg.name}' (${pkg.id}) into: ${finalDist}`);
    return { ok: true, id: pkg.id, directory: finalDist };
  } catch (err) {
    if (movedOld && !installed) {
      try {
        fs.renameSync(previous, finalDist);
      } catch (rollbackErr) {
        keepBackup = true;
        throw new Error(`Installation failed and rollback failed. Preserved at ${previous}: ${rollbackErr.message}`, { cause: err });
      }
    }
    throw err;
  } finally {
    if (!keepBackup) fs.rmSync(stage, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.log("Usage: node scripts/install-plugin.mjs <plugin-id-or-path> [target-plugins-directory]");
  process.exit(args.length === 0 ? 1 : 0);
}

const pluginArg = args[0];
const targetDirs = args[1] ? [args[1]] : findDefaultPluginsDirectories();

if (targetDirs.length === 0) {
  console.error("Error: Could not automatically locate LearnHarness 'data/plugins' directory.");
  console.error("Please supply it as the second argument, e.g.:");
  console.error("  node scripts/install-plugin.mjs os-simulator /path/to/learnharness/data/plugins");
  process.exit(1);
}

try {
  for (const dir of targetDirs) {
    installPlugin(pluginArg, dir);
  }
} catch (err) {
  console.error(`✖ [install error] ${err.message}`);
  process.exit(1);
}
