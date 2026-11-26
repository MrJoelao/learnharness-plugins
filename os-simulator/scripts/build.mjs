import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist");

try {
  if (fs.lstatSync(output).isSymbolicLink()) throw new Error("Refusing to build into a symlinked dist directory.");
  try {
    fs.lstatSync(path.join(output, "data"));
    throw new Error("Refusing to build over dist/data; preserve plugin data outside dist first.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const debugAnimations = process.argv.includes("--debug-animations") || process.env.LH_DEBUG_ANIMATIONS === "1";

const common = {
  absWorkingDir: root,
  bundle: true,
  target: "es2022",
  minify: true,
  legalComments: "eof",
  metafile: true,
  define: {
    __LH_DEBUG_ANIMATIONS__: debugAnimations ? "true" : "false"
  }
};
const frontend = await build({ ...common, entryPoints: ["src/main.ts"], outfile: path.join(output, "main.js"), format: "esm", platform: "browser" });
const backend = await build({ ...common, entryPoints: ["src/backend.ts"], outfile: path.join(output, "backend.cjs"), format: "cjs", platform: "node" });

for (const result of [frontend, backend]) {
  for (const input of Object.keys(result.metafile.inputs)) {
    if (!input.startsWith("src/") && !input.startsWith("node_modules/")) {
      throw new Error(`Unexpected runtime input: ${input}`);
    }
  }
}

for (const file of ["manifest.json", "README.md", "LICENSE"]) {
  if (fs.existsSync(path.join(root, file))) {
    fs.copyFileSync(path.join(root, file), path.join(output, file));
  }
}

const baseCssPath = path.join(root, "../shared/plugin-base.css");
let stylesContent = "";
if (fs.existsSync(baseCssPath)) {
  stylesContent += fs.readFileSync(baseCssPath, "utf8") + "\n\n";
}
stylesContent += fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
fs.writeFileSync(path.join(output, "styles.css"), stylesContent, "utf8");

const presetsSrc = path.join(root, "presets");
if (fs.existsSync(presetsSrc)) {
  fs.cpSync(presetsSrc, path.join(output, "presets"), { recursive: true });
}

console.log(`Built OS Simulator plugin: ${output}${debugAnimations ? " [debug-animations: 10x slow-motion]" : ""}`);
