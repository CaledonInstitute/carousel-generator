# Ruang Slide

Studio carousel edukasi berbahasa Indonesia. Buat 5–20 slide persegi 1080 × 1080, pilih enam komposisi, atur teks dan gambar, lalu unduh PNG dalam ZIP atau proyek yang dapat diedit kembali.

## Menjalankan

```sh
npm install
npm run dev
```

Buka URL lokal yang dicetak Vite. Proyek memakai React, TypeScript, Vinext, dan Cloudflare Workers. Tidak membutuhkan API key atau akun.

## Pemeriksaan

```sh
npm test
npx tsc --noEmit
npm run build
```

Pengujian mencakup validasi impor, enam layout SVG, peringatan teks, IndexedDB, dan round-trip file proyek dengan gambar. Ekspor PNG melalui canvas serta interaksi responsif perlu diverifikasi di browser.

## Data dan ekspor

- Proyek dan gambar tersimpan di IndexedDB browser pengguna, bukan di server. Membersihkan data situs menghapus proyek lokal.
- File `.carousel` adalah ZIP dengan `project.json` versi 1 dan aset gambar. Impor membuat proyek dengan identitas baru.
- Unduhan gambar berisi `slide-01.png` dan seterusnya, tanpa watermark atau placeholder editor.
- Preview dan ekspor memakai renderer SVG yang sama; font Manrope, DM Sans, dan IBM Plex Sans disertakan secara lokal.
- Gambar JPG, PNG, dan WebP hingga 12 MB per file. Impor proyek dibatasi 100 MB.

Versi ini tidak mencakup login, AI, pembayaran, atau publikasi Instagram. Deployment tidak dilakukan sebagai bagian implementasi lokal ini.
