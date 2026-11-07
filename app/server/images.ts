import { imageSize } from "image-size";
import { fail, HttpError } from "./core";
const LIMIT = 12 * 1024 * 1024;
export function publicHost(host: string) {
  const h = host
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (h.includes(":")) {
    // Only global-unicast IPv6. Reject mapped IPv4 and transition ranges.
    return (
      /^[23][0-9a-f]{3}:/.test(h) &&
      !h.startsWith("2001:") &&
      !h.startsWith("2002:")
    );
  }
  if (/^[\d.]+$/.test(h)) {
    const a = h.split(".").map(Number);
    return (
      a.length === 4 &&
      a.every((v) => v >= 0 && v <= 255) &&
      ![0, 10, 127].includes(a[0]) &&
      a[0] < 224 &&
      !(a[0] === 169 && a[1] === 254) &&
      !(a[0] === 172 && a[1] >= 16 && a[1] <= 31) &&
      !(a[0] === 192 && [0, 168].includes(a[1])) &&
      !(a[0] === 100 && a[1] >= 64 && a[1] <= 127) &&
      !(a[0] === 198 && [18, 19, 51].includes(a[1])) &&
      !(a[0] === 203 && a[1] === 0 && a[2] === 113)
    );
  }
  return (
    h.includes(".") &&
    ![
      "localhost",
      "local",
      "internal",
      "test",
      "invalid",
      "example",
      "onion",
    ].some((s) => h === s || h.endsWith("." + s))
  );
}
export function imageURL(value: unknown) {
  if (typeof value !== "string" || value.length > 2048)
    fail(400, "Masukkan URL gambar HTTPS publik.");
  let url: URL;
  try {
    url = new URL(value as string);
  } catch {
    return fail(400, "URL gambar tidak valid.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !publicHost(url.hostname)
  )
    fail(400, "Gunakan URL HTTPS gambar publik tanpa kredensial.");
  return url;
}
async function checkDNS(url: URL, signal: AbortSignal) {
  if (/^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) return;
  const results = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=${type}`,
        { headers: { Accept: "application/dns-json" }, signal },
      );
      if (!response.ok) fail(400, "Domain gambar gagal diperiksa.");
      return (await response.json()) as {
        Status: number;
        Answer?: { type: number; data: string }[];
      };
    }),
  );
  const addresses = results.flatMap((r) =>
    (r.Answer ?? []).filter((a) => a.type === 1 || a.type === 28),
  );
  if (!addresses.length || addresses.some((a) => !publicHost(a.data)))
    fail(400, "Domain gambar harus mengarah ke jaringan publik.");
}
export async function loadImage(value: unknown) {
  let url = imageURL(value);
  const signal = AbortSignal.timeout(12000);
  try {
    for (let redirect = 0; redirect <= 3; redirect++) {
      await checkDNS(url, signal);
      const res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { Accept: "image/png,image/jpeg,image/webp" },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        await res.body?.cancel();
        const location = res.headers.get("location");
        if (!location || redirect === 3)
          fail(400, "Terlalu banyak pengalihan URL gambar.");
        url = imageURL(new URL(location!, url).href);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        fail(
          400,
          `Gambar tidak dapat diambil (HTTP ${res.status}). Gunakan link gambar langsung.`,
        );
      }
      if (Number(res.headers.get("content-length")) > LIMIT) {
        await res.body?.cancel();
        fail(400, "Gambar maksimal 12 MB.");
      }
      const reader = res.body?.getReader();
      if (!reader) return fail(400, "Gambar kosong.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > LIMIT) {
          await reader.cancel();
          fail(400, "Gambar maksimal 12 MB.");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let info;
      try {
        info = imageSize(bytes);
      } catch {
        return fail(400, "Gunakan gambar PNG, JPEG, atau WebP yang valid.");
      }
      if (
        !["png", "jpg", "webp"].includes(info.type ?? "") ||
        !info.width ||
        !info.height
      )
        fail(400, "Gunakan gambar PNG, JPEG, atau WebP yang valid.");
      if (info.width !== info.height)
        fail(
          400,
          `Gambar wajib 1:1. Ukuran gambar ini ${info.width} × ${info.height} piksel.`,
        );
      if (info.width > 16384)
        fail(400, "Dimensi gambar maksimal 16384 × 16384 piksel.");
      return {
        bytes,
        width: info.width,
        height: info.height,
        mime: info.type === "jpg" ? "image/jpeg" : `image/${info.type}`,
      };
    }
    return fail(400, "URL gambar gagal dibuka.");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return fail(
      400,
      "Gambar gagal diambil atau waktu tunggu habis. Periksa URL gambar.",
    );
  }
}
