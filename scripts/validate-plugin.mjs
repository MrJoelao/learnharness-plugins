#!/usr/bin/env node
/**
 * LearnHarness Plugin Validator ($unslop & Experience First)
 *
 * Validates a plugin against:
 * 1. Manifest specifications and file boundaries
 * 2. Host security boundaries (no forbidden imports from host internals)
 * 3. $unslop UI/UX standards (no hardcoded hex colors, no glowing neon shadows, no purple AI gradients, no emojis)
 * 4. Experience First lifecycle rules (abort signal cleanup, font roles)
 *
 * Usage:
 *   node scripts/validate-plugin.mjs <plugin-id-or-path>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const ALLOWED_ICONS = new Set([
  "BookOpen", "Brain", "Calculator", "Code", "FlaskConical",
  "GraduationCap", "Lightbulb", "Network", "Puzzle", "Target"
]);

const FORBIDDEN_IMPORT_PATTERNS = [
  { pattern: /from\s+["']@\/components(?:\/.*)?["']/, message: "Cannot import private host components from '@/components'" },
  { pattern: /from\s+["']@\/src(?:\/.*)?["']/, message: "Cannot import private host modules from '@/src'" },
  { pattern: /from\s+["']next(?:\/.*)?["']/, message: "Cannot import Next.js runtime modules inside plugin bundle" }
];

const SLOP_PATTERNS = [
  { pattern: /(?:background|color|border):\s*#(?:[0-9a-fA-F]{3,8})\b/, message: "Avoid hardcoded hex colors; use host theme CSS variables (e.g. var(--background), var(--card), var(--border), var(--primary))" },
  { pattern: /shadow-\[0_0_[0-9]+px|box-shadow:\s*0\s+0\s+(?:1[5-9]|[2-9][0-9])px/, message: "Avoid glowing neon box shadows (AI slop indicator); depth must come from hairlines and surface steps" },
  { pattern: /(?:bg-gradient-to|from-purple|to-pink|from-indigo|linear-gradient\(.*#8b5cf6)/, message: "Avoid purple/violet AI gradient tropes; prefer quiet neutral surfaces" },
  { pattern: /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u, message: "Avoid emojis in buttons or headers; use standard Lucide icon names" },
  { pattern: /font-size:\s*(?:[0-9]|10)px\b/, message: "Font size below 11px violates LearnHarness legibility floor; use var(--text-xs, 11px) minimum" }
];

function log(status, msg) {
  const icon = status === "pass" ? "✔" : status === "warn" ? "⚠" : "✖";
  console.log(`  ${icon} [${status.toUpperCase()}] ${msg}`);
}

function resolvePluginDir(targetPath) {
  const direct = path.resolve(targetPath);
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
    return direct;
  }
  const inRepo = path.join(repoRoot, targetPath);
  if (fs.existsSync(inRepo) && fs.statSync(inRepo).isDirectory()) {
    return inRepo;
  }
  return direct;
}

export function validatePlugin(targetPath) {
  const resolved = resolvePluginDir(targetPath);
  console.log(`\nAnalyzing LearnHarness plugin at: ${resolved}`);

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    log("fail", `Target directory not found: ${resolved}`);
    return { ok: false, errors: 1, warnings: 0 };
  }

  let errors = 0;
  let warnings = 0;

  // 1. Locate manifest.json
  let manifestPath = path.join(resolved, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    manifestPath = path.join(resolved, "dist", "manifest.json");
  }

  if (!fs.existsSync(manifestPath)) {
    log("fail", "Missing manifest.json (expected in plugin root)");
    return { ok: false, errors: 1, warnings: 0 };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    log("pass", "manifest.json is valid JSON");
  } catch (err) {
    log("fail", `manifest.json syntax error: ${err.message}`);
    return { ok: false, errors: 1, warnings: 0 };
  }

  // 2. Validate manifest fields
  if (manifest.apiVersion !== 1) {
    log("fail", `Expected apiVersion: 1, got ${manifest.apiVersion}`);
    errors++;
  } else {
    log("pass", "apiVersion: 1");
  }

  if (!manifest.id || typeof manifest.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(manifest.id)) {
    log("fail", `Invalid plugin id: '${manifest.id}'. Must start with lowercase letter/digit and contain only lowercase ASCII/numbers/dashes.`);
    errors++;
  } else {
    log("pass", `Valid plugin id: ${manifest.id}`);
  }

  if (!manifest.name || typeof manifest.name !== "string") {
    log("fail", "Missing or non-string plugin 'name'");
    errors++;
  } else {
    log("pass", `Plugin name: ${manifest.name}`);
  }

  // Check declared entry points
  const rootDir = resolved;
  if (manifest.main) {
    const mainSrc = path.join(rootDir, "src", "main.ts");
    const mainDist = path.join(rootDir, "dist", manifest.main);
    if (!fs.existsSync(mainSrc) && !fs.existsSync(mainDist)) {
      log("fail", `Main entry not found (checked src/main.ts and dist/${manifest.main})`);
      errors++;
    } else {
      log("pass", `Main entry found`);
    }
  }

  if (manifest.backend) {
    const backendSrc = path.join(rootDir, "src", "backend.ts");
    const backendDist = path.join(rootDir, "dist", manifest.backend);
    if (!fs.existsSync(backendSrc) && !fs.existsSync(backendDist)) {
      log("fail", `Backend entry not found (checked src/backend.ts and dist/${manifest.backend})`);
      errors++;
    } else {
      log("pass", `Backend entry found`);
    }
  }

  // 3. Scan JS/TS/CSS source files for architecture and $unslop rules
  const filesToScan = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "data" || entry.name === ".sdk") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(js|mjs|cjs|ts|tsx|css)$/.test(entry.name)) {
        filesToScan.push(full);
      }
    }
  }
  walk(resolved);

  let hasSignalCleanup = false;
  for (const file of filesToScan) {
    const rel = path.relative(resolved, file);
    const content = fs.readFileSync(file, "utf8");

    // Check forbidden imports
    for (const { pattern, message } of FORBIDDEN_IMPORT_PATTERNS) {
      if (pattern.test(content)) {
        log("fail", `${rel}: ${message}`);
        errors++;
      }
    }

    // Check for signal cleanup in frontend renderer
    if (content.includes("registerModeRenderer") || content.includes("registerView")) {
      if (
        content.includes("signal.aborted") ||
        content.includes("signal.addEventListener") ||
        content.includes("return () =>") ||
        content.includes("return cleanup")
      ) {
        hasSignalCleanup = true;
      }
    }

    // Check anti-slop rules
    for (const { pattern, message } of SLOP_PATTERNS) {
      if (pattern.test(content)) {
        log("warn", `${rel}: ${message}`);
        warnings++;
      }
    }

    // Check backend mode registrations for valid Lucide icon
    const iconMatch = content.match(/icon:\s*["']([^"']+)["']/);
    if (iconMatch && iconMatch[1]) {
      const icon = iconMatch[1];
      if (!ALLOWED_ICONS.has(icon)) {
        log("warn", `${rel}: Icon '${icon}' is not in the host's supported Lucide mode icons: ${[...ALLOWED_ICONS].join(", ")}`);
        warnings++;
      } else {
        log("pass", `Registered supported mode icon: ${icon}`);
      }
    }
  }

  if (manifest.main && !hasSignalCleanup) {
    log("warn", "Renderer does not appear to check 'signal.aborted' or register cleanup on abort signal (Experience First).");
    warnings++;
  } else if (manifest.main) {
    log("pass", "Renderer handles lifecycle and abort signal cleanup.");
  }

  console.log(`\nSummary: ${errors === 0 ? "PASSED" : "FAILED"} (${errors} errors, ${warnings} warnings)\n`);
  return { ok: errors === 0, errors, warnings };
}

if (process.argv[1] && process.argv[1].endsWith("validate-plugin.mjs")) {
  const target = process.argv[2] || ".";
  const result = validatePlugin(target);
  process.exit(result.ok ? 0 : 1);
}
