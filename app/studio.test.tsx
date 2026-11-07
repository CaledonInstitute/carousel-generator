import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveObjectURL } from "node:buffer";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import {
  newProject,
  exampleProject,
  newSlide,
  validateProject,
  effectiveStyle,
  normalizeProject,
  dimensions,
} from "./model";
import { SlideArt, slideWarnings, wrap, metrics, richText } from "./slide";
import { exportPNG, renderSlides } from "./transfer";

test("new projects have five blank portrait text slides; examples include real images", () => {
  const p = newProject();
  validateProject(p);
  assert.equal(p.slides.length, 5);
  assert.equal(p.format, "portrait");
  assert.equal(p.numbers, false);
  assert.ok(p.slides.every((s) => s.layout === "teks" && !s.text));
  const example = exampleProject();
  validateProject(example);
  assert.ok(example.slides.every((s) => s.text));
  assert.ok(
    example.slides.some(
      (s) => s.layout === "gambar" && s.image && example.assets[s.image],
    ),
  );
});
test("legacy normalization preserves all content, style, identity and square dimensions", () => {
  const legacy = {
    ...newProject(),
    version: 2,
    slides: [
      "sampul",
      "gambar",
      "daftar",
      "langkah",
      "perbandingan",
      "penutup",
    ].map((layout) => ({
      ...newSlide(),
      layout,
      title: "Judul",
      body: "Isi\nBaris kedua",
      secondary: "Tambahan",
    })),
  };
  const before = structuredClone(legacy),
    normalized = normalizeProject(legacy);
  validateProject(normalized);
  assert.equal(normalized.version, 3);
  assert.equal(normalized.format, "square");
  assert.deepEqual(dimensions(normalized), { width: 1080, height: 1080 });
  assert.equal(normalized.id, legacy.id);
  assert.deepEqual(normalized.style, legacy.style);
  normalized.slides.forEach((s, i) => {
    assert.equal(s.id, legacy.slides[i].id);
    assert.equal(s.text, "Judul\n\nIsi\nBaris kedua\n\nTambahan");
    assert.equal(s.layout, i === 1 ? "gambar" : "teks");
    assert.ok(!("title" in s));
  });
  assert.deepEqual(legacy, before);
  assert.deepEqual(normalizeProject(normalized), normalized);
  assert.throws(() =>
    normalizeProject({
      ...legacy,
      slides: [{ ...legacy.slides[0], layout: "unknown" }],
    }),
  );
});
test("validation rejects invalid limits, layouts, styles, assets and crop bounds", () => {
  for (const count of [0, 4, 21]) {
    const p = newProject();
    p.slides = Array.from({ length: count }, () => newSlide());
    assert.throws(() => validateProject(p));
  }
  const max = newProject();
  max.slides = Array.from({ length: 20 }, () => newSlide());
  validateProject(max);
  for (const patch of [
    { layout: "unknown" },
    { image: "missing" },
    { zoom: 4 },
    { x: -1 },
    { y: 101 },
    { text: 42 },
  ]) {
    const p = newProject();
    Object.assign(p.slides[0], patch);
    assert.throws(() => validateProject(p));
  }
  for (const patch of [
    { font: "unknown" },
    { size: 81 },
    { accent: "url(https://example.com)" },
  ]) {
    const p = newProject();
    Object.assign(p.style, patch);
    assert.throws(() => validateProject(p));
  }
});
test("both render modes escape HTML, support bold and exclude editor placeholders from export", () => {
  const p = newProject();
  for (const layout of ["teks", "gambar"] as const) {
    const s = {
      ...newSlide(layout),
      text: "<script>alert(1)</script> **Pesan utama**\n\nParagraf berikutnya.",
    };
    const svg = renderToStaticMarkup(<SlideArt project={p} slide={s} />);
    assert.match(svg, /width="1080" height="1350"/);
    assert.ok(!svg.includes("<script>"));
    assert.match(svg, /font-weight="700"/);
    assert.ok(!svg.includes("**"));
    assert.ok(!svg.includes("Tambahkan gambar"));
  }
  const s = newSlide("gambar");
  assert.match(
    renderToStaticMarkup(<SlideArt project={p} slide={s} guides />),
    /Tambahkan gambar/,
  );
  assert.ok(
    !renderToStaticMarkup(<SlideArt project={p} slide={s} />).includes(
      "Tulis teks slide",
    ),
  );
});
test("unmatched bold markers stay visible", () => {
  assert.deepEqual(richText("****"), [{ text: "****", bold: false }]);
  assert.deepEqual(richText("**belum selesai"), [
    { text: "**belum selesai", bold: false },
  ]);
});

test("wrapping preserves long words and newlines, and warnings identify excessive content", () => {
  const input = "abcdefghijklmnopqrstuvwx";
  assert.equal(wrap(input, 80, 32).join(""), input);
  assert.deepEqual(wrap("Satu\nDua", 900, 32), ["Satu", "Dua"]);
  const p = newProject();
  p.slides[0].text = "Teks sangat panjang. ".repeat(150);
  assert.ok(slideWarnings(p, p.slides[0]).some((s) => s.startsWith("Teks")));
  assert.ok(
    slideWarnings(p, newSlide("gambar")).some((s) => s.includes("gambar")),
  );
  p.slides[0].style = { size: 40 };
  assert.equal(effectiveStyle(p, p.slides[0]).size, 40);
  assert.equal(p.style.size, 48);
});

test("PNG export waits for fonts and images and writes ordered portrait files", async () => {
  const original = {
    document: globalThis.document,
    Image: globalThis.Image,
    fetch: globalThis.fetch,
    FileReader: globalThis.FileReader,
  };
  let result: Blob | undefined;
  let drawn = 0;
  const fontRequests: string[] = [];
  const imageRequests: string[] = [];
  const renderedSVGs: string[] = [];
  const canvases: { width: number; height: number }[] = [];
  Object.assign(globalThis, {
    FileReader: class {
      result = "";
      onload?: () => void;
      onerror?: () => void;
      readAsDataURL(blob: Blob) {
        blob
          .arrayBuffer()
          .then((b) => {
            this.result = `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`;
            this.onload?.();
          })
          .catch(() => this.onerror?.());
      }
    },
    Image: class {
      src = "";
      async decode() {
        assert.ok(this.src.startsWith("blob:"));
        renderedSVGs.push(await resolveObjectURL(this.src)!.text());
      }
    },
    fetch: async (url: string) => {
      if (url.startsWith("/api/images?")) {
        imageRequests.push(url);
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "image/png" },
        });
      }
      fontRequests.push(url);
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    },
    document: {
      fonts: { ready: Promise.resolve() },
      createElement: (tag: string) => {
        if (tag === "a")
          return {
            href: "",
            click() {
              result = resolveObjectURL(
                (this as { href: string }).href,
              ) as unknown as Blob;
            },
          };
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({
            fillRect() {},
            drawImage() {
              drawn++;
            },
          }),
          toBlob: (cb: (b: Blob) => void, format: string, quality: number) => {
            if (format === "image/jpeg") assert.equal(quality, 0.94);
            cb(new Blob([format], { type: format }));
          },
        };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  try {
    const p = exampleProject();
    p.style.font = "Manrope";
    p.assets = {};
    p.slides.forEach((s) => {
      s.layout = "teks";
      delete s.image;
    });
    p.assets.photo = "https://images.example.org/square.png";
    Object.assign(p.slides[1], {
      layout: "gambar",
      image: "photo",
      imageWidth: 512,
      imageHeight: 512,
    });
    p.slides[1].style.font = "DM Sans";
    p.slides[2].style.font = "IBM Plex Sans";
    const progress: number[] = [];
    await exportPNG(p, (n) => progress.push(n));
    assert.equal(imageRequests.length, 1);
    assert.equal(p.assets.photo, "https://images.example.org/square.png");
    assert.ok(
      renderedSVGs.some((svg) => svg.includes("data:image/png;base64,")),
    );
    assert.ok(renderedSVGs.every((svg) => !svg.includes("/api/images?")));
    assert.equal(fontRequests.length, 6);
    for (const family of ["manrope", "dm-sans", "ibm-plex-sans"]) {
      for (const weight of [400, 700]) {
        assert.ok(
          fontRequests.some((url) =>
            url.endsWith(`${family}-latin-${weight}-normal.woff2`),
          ),
        );
      }
    }
    for (const svg of renderedSVGs) {
      for (const family of ["Manrope", "DM Sans", "IBM Plex Sans"]) {
        assert.ok(svg.includes(`font-family:'${family}'`));
      }
      assert.ok(
        svg.includes("data:font/woff2;base64,") ||
          svg.includes("data:;base64,"),
      );
    }
    assert.equal(drawn, 5);
    assert.deepEqual(progress, [1, 2, 3, 4, 5]);
    assert.ok(canvases.every((c) => c.width === 1080 && c.height === 1350));
    const zip = await JSZip.loadAsync(await result!.arrayBuffer());
    assert.deepEqual(Object.keys(zip.files), [
      "slide-01.png",
      "slide-02.png",
      "slide-03.png",
      "slide-04.png",
      "slide-05.png",
    ]);
    const jpegSlides: Blob[] = [];
    for await (const blob of renderSlides(p, "image/jpeg"))
      jpegSlides.push(blob);
    assert.equal(jpegSlides.length, 5);
    assert.ok(jpegSlides.every((blob) => blob.type === "image/jpeg"));
    assert.ok(canvases.every((c) => c.width === 1080 && c.height === 1350));
    assert.equal(p.assets.photo, "https://images.example.org/square.png");
  } finally {
    Object.assign(globalThis, original);
  }
});

test("PNG export identifies the slide when a remote image disappears", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ error: "URL gambar tidak tersedia." }, { status: 400 });
  try {
    const p = newProject();
    p.assets.photo = "https://images.example.org/gone.png";
    p.slides[2].layout = "gambar";
    p.slides[2].image = "photo";
    await assert.rejects(
      exportPNG(p, () => {}),
      /Gambar slide 3: URL gambar tidak tersedia/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("images fill the lower canvas for portrait, square and landscape sources with bounded crop", () => {
  const p = newProject();
  p.assets.photo = "https://images.example.org/photo.png";
  for (const [imageWidth, imageHeight] of [
    [800, 1200],
    [1200, 800],
    [900, 900],
  ]) {
    const s = {
      ...newSlide("gambar"),
      text: "Cerita singkat.",
      image: "photo",
      imageWidth,
      imageHeight,
    };
    const m = metrics(p, s);
    assert.ok(m.imageHeight >= 1350 * 0.35);
    assert.equal(m.imageY, m.contentBottom + 40);
    const svg = renderToStaticMarkup(<SlideArt project={p} slide={s} />);
    assert.match(svg, /clip-path="url/);
    assert.match(svg, /preserveAspectRatio="none"/);
    const moved = renderToStaticMarkup(
      <SlideArt project={p} slide={{ ...s, zoom: 2, x: 0, y: 100 }} />,
    );
    assert.notEqual(svg, moved);
  }
});
test("layout grows short text, honors paragraphs and flags overflow in both modes", () => {
  const p = exampleProject();
  for (const layout of ["teks", "gambar"] as const) {
    const s = {
      ...newSlide(layout),
      text: "Satu ide yang jelas.\n\nPenjelasan singkat untuk pembaca.",
    };
    const m = metrics(p, s);
    assert.equal(m.overflow, false);
    assert.equal(m.size, 80);
    assert.ok(m.lines.some((line) => line.gap));
    assert.equal(
      metrics(p, { ...s, text: "Isi sangat panjang ".repeat(200) }).overflow,
      true,
    );
    const noAccount = metrics(p, { ...s, hideAccount: true });
    assert.ok(noAccount.top < m.top);
  }
});
test("inactive image assets are not fetched during text-mode export", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("font fetch reached");
  };
  const doc = globalThis.document;
  Object.assign(globalThis, {
    document: { fonts: { ready: Promise.resolve() } },
  });
  try {
    const p = newProject();
    p.assets.photo = "https://example.org/gone.png";
    p.slides[0].image = "photo";
    await assert.rejects(
      exportPNG(p, () => {}),
      /font fetch reached/,
    );
  } finally {
    globalThis.fetch = original;
    Object.assign(globalThis, { document: doc });
  }
});

test("existing project style, alignment and identity controls survive composition changes", () => {
  const p = exampleProject();
  p.style = {
    font: "DM Sans",
    size: 40,
    accent: "#992244",
    background: "#112233",
    color: "#FFFFFF",
    align: "center",
  };
  const before = structuredClone(p);
  const s = { ...p.slides[0], hideAccount: true, hideNumber: true };
  const svg = renderToStaticMarkup(<SlideArt project={p} slide={s} />);
  assert.match(svg, /font-family="DM Sans"/);
  assert.match(svg, /fill="#112233"/);
  assert.match(svg, /fill="#FFFFFF"/);
  assert.match(svg, /text-anchor="middle"/);
  assert.ok(!svg.includes(p.account));
  assert.ok(!svg.includes("01 /"));
  assert.deepEqual(p, before);
});
