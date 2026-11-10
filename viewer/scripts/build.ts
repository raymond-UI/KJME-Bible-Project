// Build the viewer.
//   bun scripts/build.ts                     dist/: index.html, assets, and data/ copied from public/data
//   bun scripts/build.ts --standalone [out]  one HTML file with the code, styles and every exported book inlined
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DATA = join(ROOT, "public", "data");
const args = process.argv.slice(2);
const standalone = args.includes("--standalone");
const outArg = args.find((a) => !a.startsWith("--"));

async function bundle(outdir: string, minify: boolean) {
  const r = await Bun.build({
    entrypoints: [join(ROOT, "index.html")],
    outdir,
    minify,
    publicPath: "./",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!r.success) {
    for (const l of r.logs) console.error(l);
    process.exit(1);
  }
  return r;
}

if (!standalone) {
  const out = resolve(outArg ?? join(ROOT, "dist"));
  rmSync(out, { recursive: true, force: true });
  await bundle(out, true);
  if (existsSync(DATA)) cpSync(DATA, join(out, "data"), { recursive: true });
  console.log(`Built ${out}`);
} else {
  const out = resolve(outArg ?? join(ROOT, "dist", "viewer.html"));
  const tmp = join(ROOT, "dist", ".standalone");
  rmSync(tmp, { recursive: true, force: true });
  await bundle(tmp, true);
  let html = readFileSync(join(tmp, "index.html"), "utf8");
  const files = readdirSync(tmp);
  // Inline the stylesheet and the script the bundler linked.
  html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/g, (_, f: string) =>
    `<style>${readFileSync(join(tmp, f), "utf8").replace(/<\/style/gi, "<\\/style")}</style>`);
  html = html.replace(/<script([^>]*)src="\.?\/?([^"]+\.js)"([^>]*)><\/script>/g, (_, a: string, f: string, b: string) =>
    `<script${a}${b}>${readFileSync(join(tmp, f), "utf8").replace(/<\/script/gi, "<\\/script")}</script>`);
  // Every exported book goes in, so the file works offline and can be passed around on its own.
  const manifest = JSON.parse(readFileSync(join(DATA, "index.json"), "utf8")) as { books: { code: string; file: string }[] };
  const books = Object.fromEntries(manifest.books.map((b) => [b.code, JSON.parse(readFileSync(join(DATA, b.file), "utf8"))]));
  const json = JSON.stringify({ manifest, books }).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
  const inline = `<script>window.__KJME_INLINE__=${json};</script>`;
  // The data must be set before the app script runs.
  html = html.replace(/<script/, inline + "<script");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`Built ${out} (${(html.length / 1024).toFixed(0)} KB, ${manifest.books.length} book${manifest.books.length === 1 ? "" : "s"}; ${files.length} files inlined)`);
}
