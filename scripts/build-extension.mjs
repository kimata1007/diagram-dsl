import { copyFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

for (const target of ["chrome", "firefox"]) {
  const output = new URL(`../extension/dist${target === "chrome" ? "" : "-firefox"}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  await build({
    entryPoints: [new URL("../extension/src/content.js", import.meta.url).pathname],
    outfile: new URL("content.js", output).pathname,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: target === "chrome" ? "chrome120" : "firefox128",
    minify: true,
    sourcemap: false,
  });
  await build({
    entryPoints: [new URL("../extension/popup.js", import.meta.url).pathname],
    outfile: new URL("popup.js", output).pathname,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: target === "chrome" ? "chrome120" : "firefox128",
    minify: true,
    sourcemap: false,
  });
  const manifest = target === "chrome" ? "manifest.json" : "manifest.firefox.json";
  for (const file of [manifest, "service-worker.js", "popup.html"]) {
    const outputName = file.startsWith("manifest") ? "manifest.json" : file;
    await copyFile(new URL(`../extension/${file}`, import.meta.url), new URL(outputName, output));
  }
}
console.log("Built local-only Chrome and Firefox extensions");
