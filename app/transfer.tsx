import React from "react";
import JSZip from "jszip";
import { renderToStaticMarkup } from "react-dom/server";
import { SlideArt } from "./slide";
import { uid, validateProject, type Project } from "./model";
const fontFiles = {
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
};
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
export async function exportProject(p: Project) {
  const zip = new JSZip();
  const assets: Record<string, string> = {};
  for (const [id, value] of Object.entries(p.assets)) {
    const path = `assets/${id}.image`;
    zip.file(path, value.split(",")[1], { base64: true });
    assets[id] = path;
  }
  zip.file("project.json", JSON.stringify({ ...p, assets }));
  download(
    await zip.generateAsync({ type: "blob" }),
    `${filename(p)}.carousel`,
  );
}
export async function importProject(file: File): Promise<Project> {
  if (file.size > 100 * 1024 * 1024)
    throw Error("File terlalu besar. Batas file proyek adalah 100 MB.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifest = zip.file("project.json");
  if (!manifest) throw Error("Arsip tidak memiliki data proyek.");
  const p = JSON.parse(await manifest.async("string"));
  if (!p.assets || typeof p.assets !== "object")
    throw Error("Aset proyek tidak valid.");
  let bytes = 0;
  for (const [id, path] of Object.entries(p.assets)) {
    if (typeof path !== "string" || !path.startsWith("assets/"))
      throw Error("Lokasi gambar tidak valid.");
    const asset = zip.file(path);
    if (!asset) throw Error("Gambar proyek tidak lengkap.");
    const buffer = await asset.async("uint8array");
    bytes += buffer.length;
    if (bytes > 100 * 1024 * 1024)
      throw Error("Total gambar proyek melebihi 100 MB.");
    const signature = Array.from(buffer.slice(0, 12));
    const mime =
      signature[0] === 137 && signature[1] === 80
        ? "image/png"
        : signature[0] === 255 && signature[1] === 216
          ? "image/jpeg"
          : String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...signature.slice(8, 12)) === "WEBP"
            ? "image/webp"
            : null;
    if (!mime) throw Error("Format gambar dalam proyek tidak didukung.");
    p.assets[id] = await dataURL(
      new Blob([buffer.buffer as ArrayBuffer], { type: mime }),
    );
  }
  validateProject(p);
  return { ...p, id: uid(), updated: Date.now() };
}
export async function exportPNG(p: Project, progress: (n: number) => void) {
  await document.fonts.ready;
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
