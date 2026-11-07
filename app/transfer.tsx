import React from "react";
import JSZip from "jszip";
import { renderToStaticMarkup } from "react-dom/server";
import { SlideArt } from "./slide";
import { imageSource, type Project } from "./model";
// Workers also import this module during SSR. Resolve font URLs only when
// exporting in the browser, where import.meta.url is a valid asset base.
const getFontFiles = () => ({
  Manrope: [
    new URL(
      "../node_modules/@fontsource/manrope/files/manrope-latin-400-normal.woff2",
      import.meta.url,
    ).href,
    new URL(
      "../node_modules/@fontsource/manrope/files/manrope-latin-700-normal.woff2",
      import.meta.url,
    ).href,
  ],
  "DM Sans": [
    new URL(
      "../node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2",
      import.meta.url,
    ).href,
    new URL(
      "../node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff2",
      import.meta.url,
    ).href,
  ],
  "IBM Plex Sans": [
    new URL(
      "../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2",
      import.meta.url,
    ).href,
    new URL(
      "../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2",
      import.meta.url,
    ).href,
  ],
});
export function dataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(Error("File tidak bisa dibaca."));
    r.readAsDataURL(blob);
  });
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const filename = (p: Project) =>
  p.title
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .slice(0, 70) || "carousel";
export async function exportPNG(p: Project, progress: (n: number) => void) {
  p = structuredClone(p);
  for (const [index, slide] of p.slides.entries()) {
    if (
      !slide.image ||
      !p.assets[slide.image] ||
      p.assets[slide.image].startsWith("data:")
    )
      continue;
    try {
      const response = await fetch(imageSource(p.assets[slide.image]));
      if (!response.ok) {
        const value = (await response.json()) as { error: string };
        throw Error(value.error);
      }
      p.assets[slide.image] = await dataURL(await response.blob());
    } catch (e) {
      throw Error(`Gambar slide ${index + 1}: ${(e as Error).message}`);
    }
  }
  await document.fonts.ready;
  const fontFiles = getFontFiles();
  let fonts = "";
  for (const family of new Set([
    p.style.font,
    ...p.slides.map((s) => s.style.font).filter(Boolean),
  ])) {
    const files = fontFiles[family as keyof typeof fontFiles];
    for (let i = 0; i < files.length; i++) {
      const response = await fetch(files[i]);
      if (!response.ok) throw Error("Font belum siap. Coba unduh kembali.");
      fonts += `@font-face{font-family:'${family}';font-style:normal;font-weight:${i === 0 ? 400 : 700};src:url(${await dataURL(await response.blob())}) format('woff2');}`;
    }
  }
  const zip = new JSZip();
  for (let i = 0; i < p.slides.length; i++) {
    const svg = renderToStaticMarkup(
      <SlideArt project={p} slide={p.slides[i]} index={i} fonts={fonts} />,
    );
    const url = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1080;
      const context = canvas.getContext("2d");
      if (!context) throw Error("Browser tidak mendukung ekspor gambar.");
      context.drawImage(img, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error("Gambar gagal dibuat."))),
          "image/png",
        ),
      );
      zip.file(`slide-${String(i + 1).padStart(2, "0")}.png`, blob);
      progress(i + 1);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  download(await zip.generateAsync({ type: "blob" }), `${filename(p)}.zip`);
}
