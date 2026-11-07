// Build and start an isolated local preview through npm run test:ui.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import JSZip from "jszip";
import { preview } from "vite";

const artifacts = ".vinext/ui-review";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.UI_CHROMIUM_PATH ? { executablePath: process.env.UI_CHROMIUM_PATH } : {}) });
const previewServer = process.env.UI_BASE_URL ? undefined : await preview({ preview: { host: "127.0.0.1", port: 0, open: false } });
const origin = process.env.UI_BASE_URL || previewServer.resolvedUrls.local[0].replace(/\/$/, "");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "UI checks create disposable accounts and projects; use a local server.");
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const username = `ui-${Date.now()}`;

async function api(path, method = "GET", data) {
  const response = await context.request.fetch(`${origin}${path}`, { method, headers: { Origin: origin }, ...(data ? { data } : {}) });
  assert.ok(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function visit(path) {
  await page.goto(new URL(path, origin).href, { waitUntil: "domcontentloaded" });
  await page.locator(".account-nav[aria-busy=true]").waitFor({ state: "hidden" });
  if (new URL(page.url()).pathname.startsWith("/editor/")) await page.getByRole("textbox", { name: "Judul proyek" }).waitFor();
  if (path === "/proyek") await page.locator("main[aria-busy=false]").waitFor();
  if (path === "/") await page.locator(".hero-slide svg").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function capture(name) {
  const width = page.viewportSize().width;
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow at ${width}`);
  await page.screenshot({ path: `${artifacts}/${name}-${width}.png`, fullPage: true });
}

try {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/masuk", "/daftar"]) {
      await visit(route);
      await capture(route.slice(1) || "beranda");
    }
  }
  await api("/api/auth/register", "POST", { username, password: "local-ui-review-password-123" });
  await visit("/proyek");
  await capture("proyek-kosong");
  await page.getByRole("button", { name: "Atau mulai dari contoh" }).click();
  await page.waitForURL("**/editor/**");
  await page.getByRole("textbox", { name: "Judul proyek" }).waitFor();
  const editor = new URL(page.url()).pathname;

  // Consent is reviewed without granting the client access.
  const client = await api("/oauth/register", "POST", { client_name: "Contoh koneksi agent", redirect_uris: ["https://example.com/callback"], token_endpoint_auth_method: "none" });
  const consent = `/oauth/authorize?${new URLSearchParams({ client_id: client.client_id, redirect_uri: "https://example.com/callback", response_type: "code", code_challenge: "a".repeat(43), code_challenge_method: "S256", resource: "https://carousel.hengker.tech/mcp" })}`;

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await visit(editor);
    await capture("editor");
    if (width === 1440) {
      for (const layout of ["sampul", "gambar", "daftar", "langkah", "perbandingan", "penutup"]) {
        await page.getByLabel("Komposisi slide").selectOption(layout);
        await capture(`layout-${layout}`);
      }
      await page.getByLabel("Komposisi slide").selectOption("sampul");
      const title = page.getByLabel("Judul Pesan utamamu");
      const previous = await title.inputValue();
      await title.fill("Judul panjang untuk memeriksa batas teks. ".repeat(25));
      await page.locator(".warnings").filter({ hasText: "Teks melebihi area slide" }).waitFor();
      await capture("teks-berlebih");
      await title.fill(previous);
    }
    await page.getByRole("button", { name: "Tinjau", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await capture("tinjau");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Instagram", exact: true }).click();
    await page.getByRole("dialog").getByText("Instagram belum dikonfigurasi untuk akun ini.", { exact: false }).waitFor();
    await capture("instagram");
    await page.keyboard.press("Escape");
    if (width <= 900) {
      for (const [name, shot] of [["Pengaturan", "panel-isi"], ["Slide", "daftar-slide"], ["Kanvas", "kanvas"]]) {
        const button = page.locator(".mobile-tools").getByRole("button", { name, exact: true });
        await button.click();
        assert.equal(await button.getAttribute("aria-pressed"), "true");
        await capture(shot);
      }
    }
    for (const route of ["/proyek", "/pengaturan"]) {
      await visit(route);
      await capture(route.slice(1));
      if (width > 900) {
        const sidebar = await page.locator(".app-sidebar").boundingBox();
        const main = await page.locator("main").boundingBox();
        assert.ok(main.x >= sidebar.x + sidebar.width, `${route}: content obscured by sidebar`);
      }
    }
    if (width <= 900) {
      await page.getByRole("button", { name: "Buka menu navigasi" }).click();
      await capture("drawer");
      // Keyboard focus must wrap inside the open navigation.
      await page.locator(".nav-logout").focus();
      await page.keyboard.press("Tab");
      assert.equal(await page.locator(".logo").evaluate((el) => el === document.activeElement), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("button", { name: "Buka menu navigasi" }).evaluate((el) => el === document.activeElement), true);
    }
    await visit(consent);
    await page.getByRole("button", { name: "Izinkan akses" }).waitFor();
    await capture("persetujuan-agent");
  }

  // A real PNG download exercises browser fonts, SVG rasterization and ZIP generation.
  await visit(editor);
  await page.getByRole("textbox", { name: "Judul proyek" }).fill("Carousel pemeriksaan UI");
  await page.getByRole("status").filter({ hasText: "Tersimpan di cloud" }).waitFor();
  await page.getByRole("button", { name: "Unduh", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh semua slide", exact: false }).click();
  const download = await downloaded;
  const archive = await JSZip.loadAsync(await readFile(await download.path()));
  const pngs = Object.values(archive.files).filter((file) => file.name.endsWith(".png"));
  assert.equal(pngs.length, 5);
  for (const png of pngs) {
    const bytes = await png.async("nodebuffer");
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), 1080);
  }
  await page.keyboard.press("Escape");

  // An external write followed by a stale local edit must offer conflict recovery.
  const id = editor.split("/").pop();
  const project = await api(`/api/projects/${id}`);
  await api(`/api/projects/${id}`, "PUT", { ...project, title: "Versi cloud" });
  await page.getByRole("textbox", { name: "Judul proyek" }).fill("Versi lokal");
  await page.locator(".conflict-banner").waitFor();
  await capture("konflik");
  await page.getByRole("button", { name: "Muat versi cloud" }).click();
  await page.locator(".conflict-banner").waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("textbox", { name: "Judul proyek" }).inputValue(), "Versi cloud");

  await visit("/proyek");
  await page.getByRole("button", { name: "Duplikasi Versi cloud", exact: true }).click();
  await page.getByRole("heading", { name: "Versi cloud (salinan)", exact: true }).waitFor();
  await page.getByRole("button", { name: "Hapus Versi cloud (salinan)", exact: true }).click();
  await capture("konfirmasi-hapus");
  await page.getByRole("dialog").getByRole("button", { name: "Hapus proyek", exact: true }).click();
  await page.getByRole("heading", { name: "Versi cloud (salinan)", exact: true }).waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log(`PASS UI at 390, 768, 1440 px; drawer keyboard focus, mobile panels, consent, PNG export, autosave conflicts and project CRUD. Screenshots: ${artifacts}`);
} finally {
  await browser.close();
  await previewServer?.close();
}
