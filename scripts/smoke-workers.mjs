import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { preview } from "vite";

// Use Vite's Cloudflare preview so requests run in workerd, not Node SSR.
const server = await preview({ preview: { host: "127.0.0.1", port: 0, open: false } });
try {
  const origin = server.resolvedUrls.local[0];
  const assets = new Set();
  for (const path of ["/", "/proyek", "/panduan", "/editor/smoke-missing-project"]) {
    for (let visit = 0; visit < 2; visit++) {
      const response = await fetch(new URL(path, origin));
      const html = await response.text();
      assert.equal(response.status, 200, `${path}: expected HTTP 200`);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.ok(!html.includes('__next_error__'), `${path}: SSR returned an error shell`);
      if (path.startsWith("/editor/")) {
        assert.match(html, /Membuka studio/);
        assert.ok(!html.includes("Proyek tidak ditemukan di browser ini"));
      }
      for (const match of html.matchAll(/(?:src|href)="([^"<>]*\/_next\/static\/[^"<>]+)"/g)) {
        assets.add(match[1]);
      }
    }
    console.log(`PASS ${path} (direct request + reload)`);
  }
  assert.ok(assets.size > 0, "Expected bundled scripts/styles in SSR HTML");
  for (const path of assets) {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200, `Missing page asset: ${path}`);
    await response.arrayBuffer();
  }
  const media = ".cloudflare/output/v0/workers/default/assets/_next/static/media";
  const files = await readdir(media);
  for (const family of ["manrope", "dm-sans", "ibm-plex-sans"]) {
    for (const weight of [400, 700]) {
      const file = files.find((name) => name.startsWith(`${family}-latin-${weight}-normal.`) && name.endsWith(".woff2"));
      assert.ok(file, `Missing bundled font: ${family} ${weight}`);
      const response = await fetch(new URL(`/_next/static/media/${file}`, origin));
      assert.equal(response.status, 200, `Missing font asset: ${file}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "wOF2");
    }
  }
  console.log(`PASS ${assets.size} page assets and all six export fonts`);
} finally {
  await server.close();
}
