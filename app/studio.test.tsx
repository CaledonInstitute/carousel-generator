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
  saveProject,
  getProject,
  listProjects,
  deleteProject,
  effectiveStyle,
} from "./model";
import { SlideArt, slideWarnings, wrap } from "./slide";
import { exportPNG, renderSlides } from "./transfer";

test("new projects have five blank slides; example content stays separate", () => {
  const p = newProject();
  validateProject(p);
  assert.equal(p.slides.length, 5);
  assert.equal(p.slides[0].layout, "sampul");
  assert.equal(p.slides[4].layout, "penutup");
  assert.ok(p.slides.every((s) => !s.title && !s.body));
  assert.ok(exampleProject().slides.every((s) => s.title));
});
test("project validation rejects slide limits, invalid layouts, styles and missing assets", () => {
  for (const count of [0, 4, 21]) {
    const p = newProject();
    p.slides = Array.from({ length: count }, () => newSlide());
    assert.throws(() => validateProject(p));
  }
  const max = newProject();
  max.slides = Array.from({ length: 20 }, () => newSlide());
  validateProject(max);
  const invalid = newProject();
  invalid.slides[0].layout = "unknown" as never;
  assert.throws(() => validateProject(invalid));
  const missing = newProject();
  missing.slides[0].image = "missing";
  assert.throws(() => validateProject(missing));
  const font = newProject();
  font.style.font = "unexpected";
  assert.throws(() => validateProject(font));
  const unsafe = newProject();
  unsafe.style.accent = "url(https://example.com)";
  assert.throws(() => validateProject(unsafe));
});
test("renderer covers six layouts, escapes content, and excludes editor placeholders from export", () => {
  const p = newProject();
  for (const layout of [
    "sampul",
    "gambar",
    "daftar",
    "langkah",
    "perbandingan",
    "penutup",
  ] as const) {
    const s = newSlide(layout);
    s.title = "<script>judul</script>";
    s.body = "Satu\nDua";
    s.secondary = "Sisi lain";
    const svg = renderToStaticMarkup(<SlideArt project={p} slide={s} />);
    assert.match(svg, /width="1080" height="1080"/);
    assert.ok(!svg.includes("<script>"));
    assert.ok(!svg.includes("Tambahkan gambar"));
  }
  const s = newSlide("gambar");
  assert.ok(
    renderToStaticMarkup(<SlideArt project={p} slide={s} guides />).includes(
      "Tambahkan gambar",
    ),
  );
  assert.ok(
    !renderToStaticMarkup(<SlideArt project={p} slide={s} />).includes(
      "Tulis judul",
    ),
  );
});
test("text wrapping preserves long words, whitespace-separated text and explicit newlines", () => {
  const input = "abcdefghijklmnopqrstuvwx";
  assert.equal(wrap(input, 80, 32).join(""), input);
  assert.deepEqual(wrap("Satu\nDua", 900, 32), ["Satu", "Dua"]);
  const p = newProject();
  p.slides[0].body = "Teks sangat panjang. ".repeat(150);
  assert.ok(slideWarnings(p, p.slides[0]).some((s) => s.startsWith("Teks")));
  assert.ok(slideWarnings(p, p.slides[1]).some((s) => s.includes("gambar")));
  p.slides[0].style = { size: 40 };
  assert.equal(effectiveStyle(p, p.slides[0]).size, 40);
  assert.equal(p.style.size, 32);
});
test("PNG export waits for fonts and images and writes ordered 1080-square files", async () => {
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
    assert.ok(canvases.every((c) => c.width === 1080 && c.height === 1080));
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
    assert.ok(canvases.every((c) => c.width === 1080 && c.height === 1080));
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
    p.slides[2].image = "photo";
    await assert.rejects(
      exportPNG(p, () => {}),
      /Gambar slide 3: URL gambar tidak tersedia/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("square image renderer keeps the full image without crop controls", () => {
  const p = newProject(),
    s = p.slides[1];
  p.assets.photo = "https://images.example.org/photo.png";
  s.image = "photo";
  const svg = renderToStaticMarkup(<SlideArt project={p} slide={s} />);
  assert.match(svg, /viewBox="0 0 414 414"/);
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(svg, /width="414" height="414"/);
});
