// Build and start an isolated local preview through npm run test:ui.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import JSZip from "jszip";
import { preview } from "vite";

const artifacts = ".vinext/ui-review";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.UI_CHROMIUM_PATH
    ? { executablePath: process.env.UI_CHROMIUM_PATH }
    : {}),
});
const previewServer = process.env.UI_BASE_URL
  ? undefined
  : await preview({ preview: { host: "127.0.0.1", port: 0, open: false } });
const origin =
  process.env.UI_BASE_URL ||
  previewServer.resolvedUrls.local[0].replace(/\/$/, "");
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
  "UI checks create disposable accounts and projects; use a local server.",
);
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const username = `ui-${Date.now()}`;

async function api(path, method = "GET", data) {
  const response = await context.request.fetch(`${origin}${path}`, {
    method,
    headers: { Origin: origin },
    ...(data ? { data } : {}),
  });
  assert.ok(
    response.ok(),
    `${method} ${path}: ${response.status()} ${await response.text()}`,
  );
  return response.json();
}
async function visit(path) {
  await page.goto(new URL(path, origin).href, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator(".account-nav[aria-busy=true]")
    .waitFor({ state: "hidden" });
  if (new URL(page.url()).pathname.startsWith("/editor/"))
    await page.getByRole("textbox", { name: "Judul proyek" }).waitFor();
  if (path === "/proyek") await page.locator("main[aria-busy=false]").waitFor();
  if (path === "/") await page.locator(".hero-slide svg").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function capture(name) {
  await page.evaluate(async () => {
    const sources = [
      ...new Set(
        Array.from(document.querySelectorAll("svg image"))
          .map((el) => el.getAttribute("href"))
          .filter(Boolean),
      ),
    ];
    await Promise.all(
      sources.map(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
      }),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  const width = page.viewportSize().width;
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${name}: horizontal overflow at ${width}`,
  );
  await page.screenshot({
    path: `${artifacts}/${name}-${width}.png`,
    fullPage: true,
  });
}

try {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/masuk", "/daftar"]) {
      await visit(route);
      if (route === "/masuk" || route === "/daftar") {
        assert.equal(await page.locator("nav").count(), 0);
        assert.equal(
          await page
            .locator(".auth-page")
            .evaluate((el) => getComputedStyle(el).borderTopWidth),
          "0px",
        );
        const form = await page.locator(".account-form").boundingBox();
        const field = await page
          .getByLabel("Username", { exact: true })
          .boundingBox();
        assert.ok(
          Math.abs(form.x - field.x) < 1 &&
            Math.abs(form.width - field.width) < 1,
          "Auth fields must align with the form",
        );
      }
      await capture(route.slice(1) || "beranda");
    }
  }
  await visit("/");
  assert.equal(await page.locator("nav").count(), 0);
  assert.equal(
    await page.getByRole("link", { name: "Masuk", exact: true }).count(),
    0,
  );
  await page.getByRole("link", { name: "Buka dashboard", exact: true }).click();
  await page.waitForURL("**/masuk?next=*");
  assert.equal(new URL(page.url()).searchParams.get("next"), "/proyek");
  await page.getByRole("link", { name: "Belum punya akun? Daftar" }).click();
  assert.equal(new URL(page.url()).searchParams.get("next"), "/proyek");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-ui-review-password-123");
  await page
    .getByLabel("Konfirmasi password", { exact: true })
    .fill("local-ui-review-password-123");
  await page.getByRole("button", { name: "Buat akun", exact: true }).click();
  await page.waitForURL("**/proyek");
  await visit("/masuk");
  assert.equal(new URL(page.url()).pathname, "/proyek");
  await visit("/proyek");
  await capture("proyek-kosong");
  await page.getByRole("button", { name: "Atau mulai dari contoh" }).click();
  await page.waitForURL("**/editor/**");
  await page.getByRole("textbox", { name: "Judul proyek" }).waitFor();
  const editor = new URL(page.url()).pathname;

  // Consent is reviewed without granting the client access.
  const client = await api("/oauth/register", "POST", {
    client_name: "Contoh koneksi agent",
    redirect_uris: ["https://example.com/callback"],
    token_endpoint_auth_method: "none",
  });
  const consent = `/oauth/authorize?${new URLSearchParams({ client_id: client.client_id, redirect_uri: "https://example.com/callback", response_type: "code", code_challenge: "a".repeat(43), code_challenge_method: "S256", resource: "https://carousel.hengker.tech/mcp" })}`;

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await visit(editor);
    await capture("editor");
    if (width === 1440) {
      assert.equal(
        await page.getByLabel("Komposisi slide").locator("option").count(),
        2,
      );
      for (const layout of ["teks", "gambar"]) {
        await page.getByLabel("Komposisi slide").selectOption(layout);
        await capture(`layout-${layout}`);
      }
      await page.getByLabel("Komposisi slide").selectOption("gambar");
      const title = page.getByLabel("Teks slide", { exact: true });
      const previous = await title.inputValue();
      await title.fill("Judul panjang untuk memeriksa batas teks. ".repeat(25));
      await page
        .locator(".warnings")
        .filter({ hasText: "Teks melebihi area slide" })
        .waitFor();
      await capture("teks-berlebih");
      await title.fill(previous);
    }
    await page.getByRole("button", { name: "Tinjau", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await capture("tinjau");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Instagram", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByText("Instagram belum dikonfigurasi untuk akun ini.", {
        exact: false,
      })
      .waitFor();
    await capture("instagram");
    await page.keyboard.press("Escape");
    if (width <= 900) {
      for (const [name, shot] of [
        ["Pengaturan", "panel-isi"],
        ["Slide", "daftar-slide"],
        ["Kanvas", "kanvas"],
      ]) {
        const button = page
          .locator(".mobile-tools")
          .getByRole("button", { name, exact: true });
        await button.click();
        assert.equal(await button.getAttribute("aria-pressed"), "true");
        await capture(shot);
      }
    }
    for (const route of ["/proyek", "/pengaturan"]) {
      await visit(route);
      await capture(route.slice(1));
      assert.equal(await page.locator('nav a[href="/"]').count(), 0);
      assert.equal(await page.locator('nav a[href="/pengaturan"]').count(), 0);
      if (route === "/pengaturan") {
        assert.equal(
          await page.locator(".settings-sidebar,.client-picker").count(),
          0,
        );
        await page.getByLabel("URL server MCP", { exact: true }).waitFor();
        await page.getByLabel("Nama agent atau perangkat").waitFor();
      }
      if (width > 900) {
        const sidebar = await page.locator(".app-sidebar").boundingBox();
        const main = await page.locator("main").boundingBox();
        assert.ok(
          main.x >= sidebar.x + sidebar.width,
          `${route}: content obscured by sidebar`,
        );
      }
    }
    if (width <= 900) {
      await page.getByRole("button", { name: "Buka menu navigasi" }).click();
      await capture("drawer");
      // Keyboard focus must wrap inside the open navigation.
      await page.getByRole("button", { name: `Menu akun ${username}` }).focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await page
          .locator(".logo")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("button", { name: "Buka menu navigasi" })
          .evaluate((el) => el === document.activeElement),
        true,
      );
    }
    await visit("/proyek");
    if (width <= 900)
      await page.getByRole("button", { name: "Buka menu navigasi" }).click();
    await page.getByRole("button", { name: `Menu akun ${username}` }).click();
    await page
      .getByRole("menuitem", { name: "Pengaturan", exact: true })
      .waitFor();
    await capture("menu-akun");
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByRole("button", { name: `Menu akun ${username}` })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    if (width <= 900) await page.keyboard.press("Escape");
    await visit(consent);
    await page.getByRole("button", { name: "Izinkan akses" }).waitFor();
    await capture("persetujuan-agent");
  }

  // A real PNG download exercises browser fonts, SVG rasterization and ZIP generation.
  await visit(editor);
  await page
    .getByRole("textbox", { name: "Judul proyek" })
    .fill("Carousel pemeriksaan UI");
  await page
    .getByRole("status")
    .filter({ hasText: "Tersimpan di cloud" })
    .waitFor();
  await page.getByRole("button", { name: "Unduh", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Unduh semua slide", exact: false })
    .click();
  const download = await downloaded;
  const archive = await JSZip.loadAsync(await readFile(await download.path()));
  const pngs = Object.values(archive.files).filter((file) =>
    file.name.endsWith(".png"),
  );
  assert.equal(pngs.length, 5);
  for (const png of pngs) {
    const bytes = await png.async("nodebuffer");
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), 1350);
    if (png.name === "slide-01.png")
      await writeFile(`${artifacts}/export-slide-01.png`, bytes);
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
  assert.equal(
    await page.getByRole("textbox", { name: "Judul proyek" }).inputValue(),
    "Versi cloud",
  );

  await visit("/proyek");
  await page.getByLabel("Tindakan Versi cloud", { exact: true }).click();
  await page
    .getByRole("button", { name: "Duplikasi Versi cloud", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Versi cloud (salinan)", exact: true })
    .waitFor();
  await page
    .getByLabel("Tindakan Versi cloud (salinan)", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hapus Versi cloud (salinan)", exact: true })
    .click();
  await capture("konfirmasi-hapus");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hapus proyek", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Versi cloud (salinan)", exact: true })
    .waitFor({ state: "hidden" });
  await visit("/pengaturan");
  await page.getByLabel("Nama agent atau perangkat").fill("UI test agent");
  await page.getByRole("button", { name: "Buat token", exact: true }).click();
  await page.getByLabel("Token pribadi baru").waitFor();
  await page
    .getByRole("button", { name: "Tampilkan token", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Token pribadi baru").getAttribute("type"),
    "text",
  );
  await capture("token-baru");
  await page
    .getByRole("button", { name: "Sudah saya simpan", exact: false })
    .click();
  await page.getByRole("button", { name: "Cabut token", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cabut token", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await visit("/proyek");
  if (page.viewportSize().width <= 900)
    await page.getByRole("button", { name: "Buka menu navigasi" }).click();
  await page.getByRole("button", { name: `Menu akun ${username}` }).click();
  await page.getByRole("menuitem", { name: "Keluar", exact: true }).click();
  await page.waitForURL("**/masuk");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-ui-review-password-123");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("**/proyek");
  assert.deepEqual(errors, []);
  console.log(
    `PASS UI at 390, 768, 1440 px; drawer keyboard focus, mobile panels, consent, PNG export, autosave conflicts and project CRUD. Screenshots: ${artifacts}`,
  );
} finally {
  await browser.close();
  await previewServer?.close();
}
