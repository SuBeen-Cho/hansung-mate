/** Builds an offline review copy of the actual web entry. No external publication. */
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
// Vite's existing esbuild dependency; no additional app runtime dependency.
const viteRequire = createRequire(require.resolve("vite", { paths: [path.resolve("apps/web")] }));
const esbuild = viteRequire("esbuild");
(async () => {
  const result = await esbuild.build({
    entryPoints: ["apps/web/src/main.tsx"],
    bundle: true,
    minify: true,
    write: false,
    outfile: "review.js",
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env.PROD": "false", "import.meta.env.BASE_URL": '"/"', "import.meta.env.VITE_SUPABASE_URL": '""', "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""' },
    plugins: [
      {
        name: "public-assets",
        setup(build) {
          build.onResolve({ filter: /pdf\.worker\.min\.mjs\?url$/ }, () => ({ path: "pdf-worker", namespace: "offline-worker" }));
          build.onLoad({ filter: /.*/, namespace: "offline-worker" }, () => ({
            contents: 'import { WorkerMessageHandler } from ' + JSON.stringify(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs", { paths: [path.resolve("apps/web")] })) + '; globalThis.pdfjsWorker = { WorkerMessageHandler }; export default "offline-bundled-worker";',
            resolveDir: process.cwd(), loader: "js"
          }));
          build.onResolve({ filter: /^\/templates\// }, (args) => ({
            path: args.path,
            external: true,
          }));
        },
      },
    ],
  });
  let js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
  let css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
  for (const image of fs.readdirSync("apps/web/public/brand").filter((f) => f.endsWith(".png"))) {
    const data =
      "data:image/png;base64," +
      fs.readFileSync(`apps/web/public/brand/${image}`).toString("base64");
    js = js.replaceAll(`/brand/${image}`, data);
  }
  const font =
    "data:font/woff;base64," +
    fs.readFileSync("apps/web/public/templates/NotoSansKR-Regular.woff").toString("base64");
  css = css.replaceAll("/templates/NotoSansKR-Regular.woff", font);
  const assets = {};
  for (const name of ["classroom.pdf", "overnight.pdf", "NotoSansKR-Regular.ttf.gz"]) {
    assets[`/templates/${name}`] = fs
      .readFileSync(`apps/web/public/templates/${name}`)
      .toString("base64");
  }
  const localFetch = `const demoAssets=${JSON.stringify(assets)};window.fetch=async function(input){const key=new URL(String(input),"https://offline.invalid").pathname;const encoded=demoAssets[key];if(!encoded)throw new Error("오프라인 데모에 없는 자료예요");return new Response(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)));};`;
  const output = path.resolve(process.argv[2] ?? "../deliverables/Hansung_Mate_Demo.html");
  const html =
    '<!doctype html>\n<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>한성 메이트 · 전체 흐름 데모</title><style>' +
    css +
    '</style></head><body><div id="root"></div><script>' +
    localFetch +
    js.replaceAll("</script", "<\\/script") +
    "</script></body></html>";
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html);
  console.log(
    JSON.stringify({ output, bytes: Buffer.byteLength(html), network: "local assets only" }),
  );
})();
