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
npm run test:workers
```

Pengujian mencakup validasi impor, enam layout SVG, peringatan teks, IndexedDB, round-trip file proyek dengan gambar, serta alur ekspor PNG dengan campuran tiga font (canvas dimock). `test:workers` membangun ulang produksi, menjalankan preview Cloudflare dalam workerd, lalu memeriksa HTTP 200 tanpa halaman error untuk seluruh rute halaman, akses ulang, loading editor, aset halaman, dan enam berkas font ekspor. Server preview dihentikan otomatis setelah pemeriksaan.

## Preview dan deploy Cloudflare Workers

Gunakan Node.js 22 atau lebih baru dan `npm ci` untuk memasang versi dari lockfile.

```sh
npm run preview
```

Perintah ini membangun produksi lalu menjalankan preview Workers lokal. Untuk build yang sudah tersedia, jalankan `npm run start`. Verifikasi di browser: buka langsung dan reload `/`, `/proyek`, `/panduan`, serta `/editor/<id>`; editor harus menampilkan “Membuka studio…” saat membaca IndexedDB, lalu proyek atau pesan proyek tidak ditemukan. Buat proyek dengan font Manrope, DM Sans, dan IBM Plex Sans pada slide berbeda, ekspor ZIP PNG, dan periksa gambar 1080 × 1080 serta fontnya.

URL font ekspor dibuat hanya ketika ekspor PNG dipanggil di browser. Jangan membuat `new URL(..., import.meta.url)` untuk font pada tingkat modul: modul ini juga diimpor saat SSR di Workers.

Setelah seluruh pemeriksaan lulus, autentikasi dan deploy ke akun Cloudflare yang dituju:

```sh
npx cf auth login
npm run deploy
```

Konfigurasi Worker bersumber dari `cloudflare.config.ts`. Pilih akun lewat `CLOUDFLARE_ACCOUNT_ID`; di CI gunakan `CLOUDFLARE_API_TOKEN`. Deployment memakai integrasi Vinext yang membangun dan mengunggah output Workers. Setelah deploy, ulangi pemeriksaan akses langsung dan reload di `https://carousel.hengker.tech/`, termasuk semua rute di atas; respons dokumen harus HTTP 200 tanpa kilatan halaman error. Proyek tetap tersimpan di browser pada origin tersebut.

## Data dan ekspor

- Proyek dan gambar tersimpan di IndexedDB browser pengguna, bukan di server. Membersihkan data situs menghapus proyek lokal.
- File `.carousel` adalah ZIP dengan `project.json` versi 1 dan aset gambar. Impor membuat proyek dengan identitas baru.
- Unduhan gambar berisi `slide-01.png` dan seterusnya, tanpa watermark atau placeholder editor.
- Preview dan ekspor memakai renderer SVG yang sama; font Manrope, DM Sans, dan IBM Plex Sans disertakan secara lokal.
- Gambar JPG, PNG, dan WebP hingga 12 MB per file. Impor proyek dibatasi 100 MB.

Versi ini tidak mencakup login, AI, pembayaran, atau publikasi Instagram. Deployment tidak dilakukan sebagai bagian implementasi lokal ini.
