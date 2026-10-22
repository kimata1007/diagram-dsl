import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const target = process.argv[2] === "firefox" ? "firefox" : "chrome";
const root = fileURLToPath(new URL(`../extension/dist${target === "chrome" ? "" : "-firefox"}/`, import.meta.url));
const outputPath = fileURLToPath(new URL(`../extension/diagram-dsl-${target}.zip`, import.meta.url));
await new Promise((resolve, reject) => {
  const zip = spawn("zip", ["-r", "-FS", outputPath, "."], { cwd: root, stdio: "inherit" });
  zip.on("error", reject);
  zip.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`zip exited with ${code}`)));
});
const entries = await readdir(root);
console.log(`Packaged ${target} extension (${(await stat(outputPath)).size} bytes) at extension/diagram-dsl-${target}.zip; ${entries.length} files`);
