# Carousel Generator

Studio carousel edukasi berbahasa Indonesia, dengan akun username/password, proyek pribadi di Cloudflare D1, dan MCP untuk Claude.ai atau agent lain. Proyek baru memakai kanvas 1080 × 1350 (4:5), 5–20 slide, serta dua mode: Teks dan Teks + gambar. Proyek lama tetap 1080 × 1080.

## Pengembangan

Gunakan Node.js 22.12+ dan npm.

```sh
npm ci
npm run db:local
npm run dev
```

Daftar akun melalui `/daftar`. Email dan reset password tidak tersedia. Username tidak membedakan huruf besar/kecil, panjang 3–32 karakter (huruf, angka, `_`, `-`); password 12–128 karakter. Password menggunakan PBKDF2-SHA256 100.000 iterasi dan salt individual, sesuai batas Web Crypto Workers. Sesi berlaku 30 hari dengan cookie HttpOnly, Secure, SameSite=Lax. Gunakan localhost untuk development; jangan menonaktifkan Secure pada produksi.

Proyek disimpan hanya di D1, terpisah berdasarkan pemilik. Tidak ada migrasi atau penghapusan IndexedDB lama. Impor/ekspor `.carousel` sudah dihapus. `/panduan` mengarahkan ke beranda.

## Gambar dan editor

Tempel URL HTTPS publik PNG, JPEG, atau WebP, maksimal 12 MB dan dimensi maksimal 16384 × 16384. Server memeriksa dimensi asli; gambar portrait, landscape, dan persegi didukung. Untuk gambar sumber proyek, D1 menyimpan URL serta dimensi; file sumber tidak disalin secara permanen. Link harus tetap tersedia dan dapat diambil tanpa login/cookie asal. URL yang memiliki masa berlaku dapat berhenti bekerja setelah kedaluwarsa. Fitur Instagram menyimpan JPEG hasil render secara sementara di D1, terpisah dari gambar sumber.

Gambar memenuhi lebar bawah slide dengan crop, posisi horizontal/vertikal, dan zoom 1–3×. Preview mengambil gambar melalui endpoint akun; ekspor mengambil dan memvalidasi ulang gambar, menyisipkannya sementara ke SVG, lalu menghasilkan ZIP berisi PNG. Jika link berubah atau mati, ekspor menampilkan nomor slide bermasalah.

Autosave memakai versi proyek, bukan last-write-wins. Editor memeriksa pembaruan cloud setiap 5 detik ketika tab aktif. Konflik menghentikan autosave dan menawarkan versi cloud atau salinan baru. Jika offline, edit tetap berada di memori tab sampai berhasil disimpan; tidak tersedia mode offline persisten. Jangan menutup tab sebelum status tersimpan.

## MCP dan koneksi agent

Endpoint produksi: `https://carousel.hengker.tech/mcp` (Streamable HTTP, stateless, SDK MCP resmi). Endpoint baru tersedia setelah aplikasi ini dideploy.

Di Claude.ai, tambahkan konektor kustom dengan URL tersebut, masuk memakai username/password Carousel Generator, lalu izinkan akses pada layar persetujuan. Agent tidak menerima password. OAuth mendukung discovery, dynamic client registration, authorization code dengan PKCE S256, access token 1 jam, dan refresh token berotasi hingga 90 hari per token. Resource OAuth wajib `https://carousel.hengker.tech/mcp`.

Client yang mendukung bearer token juga dapat memakai token pribadi dari `/pengaturan`:

```http
Authorization: Bearer rs_TOKEN
```

Token hanya ditampilkan sekali, disimpan sebagai hash, dan berlaku 90 hari. Cabut token atau koneksi OAuth di Pengaturan untuk menghentikan akses. Setiap koneksi mendapat akses penuh terhadap proyek pemilik akun, termasuk penghapusan permanen.

Tools:

- `list_projects`: daftar proyek dan tautan editor.
- `get_project`: isi lengkap dan revision terbaru.
- `create_project`: buat proyek dari judul, 5–20 slide, style, dan assets berupa peta ID ke URL.
- `update_project`: ganti isi proyek dengan ID dan revision dari pembacaan terbaru; pertahankan ID slide untuk menjaga identitas.
- `delete_project`: hapus permanen dengan ID dan revision terbaru, ditandai sebagai aksi destruktif.

Schema layout/style tersedia langsung dalam tool MCP. Layout: `teks` dan `gambar`; field `text` mendukung paragraf serta `**teks tebal**`. Format proyek `portrait` (bawaan) atau `square`. Payload MCP lama tetap diterima melalui adaptor. MCP dan web memakai layanan validasi, kepemilikan, gambar, dan penyimpanan yang sama. MCP tidak mengekspor PNG; buka tautan editor untuk mengunduh.

API web memakai sesi cookie: `/api/auth/{register,login,logout,me}`, `/api/projects`, `/api/projects/:id`, `/api/images`, dan `/api/connections`. Mutasi web memerlukan Origin yang sama. Dokumen proyek memakai `version: 2`; `revision` adalah versi konkurensi server. Pembaruan usang mengembalikan HTTP 409 dan akses proyek bukan miliknya mengembalikan HTTP 404.

## Cloudflare dan deployment

Konfigurasi ada di `wrangler.jsonc`. D1 `carousel-generator-db` dengan binding `DB` sudah dibuat dan migrasi awal diterapkan pada akun Cloudflare yang dipakai saat implementasi. Development memakai D1 lokal yang terpisah. Untuk lingkungan/akun baru, buat D1 sendiri dan perbarui account/database ID pada konfigurasi.

Untuk migrasi baru, terapkan sebelum deployment aplikasi yang memerlukannya:

```sh
npm run db:remote
```

Deployment aplikasi cukup:

```sh
wrangler deploy
```

Jika Wrangler belum ada di PATH, gunakan `npx wrangler deploy` atau `npm run deploy`. Perintah ini membangun aplikasi otomatis, termasuk ketika output build sebelumnya sudah tersedia. Script `prepare-deploy.mjs` menjaga perintah build dalam konfigurasi output Vite agar deployment berikutnya tidak memakai build lama. Domain tetap `carousel.hengker.tech`.

Implementasi tidak menjalankan deployment produksi. Verifikasi koneksi Claude.ai setelah deploy publik; pengujian lokal menggunakan client MCP dan runtime workerd.

## Instagram (pilot)

Posting carousel langsung tersedia sebagai fitur opsional untuk satu pengguna dan satu akun profesional Instagram. Fitur nonaktif secara default; tidak ada kredensial Meta di repository. Pengaturan menyediakan koneksi Instagram dan editor menyediakan preview, caption, serta posting 5–20 slide. JPEG sementara dan progres disimpan di D1; proses dilanjutkan melalui permintaan dari dialog editor. Biarkan dialog terbuka sampai selesai, atau buka kembali untuk melanjutkan. Ikuti [panduan konfigurasi dan aktivasi](docs/instagram.md) sebelum mengaktifkannya. ZIP PNG tetap tersedia untuk proyek hingga 20 slide.

Integrasi ini tidak memerlukan R2, Cloudflare Queue, worker terpisah, atau cron. Jalankan seluruh migrasi D1, termasuk `0002_instagram.sql` dan `0003_instagram_d1_media.sql`, sebelum mengaktifkan Instagram. URL JPEG berlaku 48 jam sejak persiapan dibuat; data kedaluwarsa dibersihkan bertahap saat fitur diakses kembali. Refresh token juga dilakukan saat fitur digunakan, sehingga akun yang lama tidak digunakan mungkin perlu dihubungkan ulang.

## Pemeriksaan aplikasi

```sh
npm test
npx tsc --noEmit
npm run test:workers
npx wrangler deploy --dry-run
```

Pengujian mencakup isolasi pengguna, autentikasi/CSRF/rate limit, kedaluwarsa dan pencabutan token, OAuth PKCE dan refresh rotation, CRUD MCP, konflik versi, URL jaringan privat, dimensi/ukuran gambar, renderer dua mode, migrasi enam layout lama, dan ekspor PNG dengan gambar URL serta tiga font. Pengujian canvas memakai mock; pemeriksaan visual dan unduhan browser tetap perlu dilakukan pada browser yang tersedia.

Tes Instagram memakai D1 lokal dan mock respons Meta: OAuth terikat sesi, izin publikasi, snapshot/idempotensi, batas slide dan caption, JPEG dalam potongan BLOB, URL bertanda tangan, kedaluwarsa media, kelanjutan proses, serta pencegahan publish berulang saat respons terputus. Tes otomatis tidak memposting ke Instagram.

Smoke test membangun aplikasi dan menjalankannya di workerd, memeriksa pengalihan login, registrasi, CRUD D1, MCP/discovery, reload halaman, aset, dan enam font. Akun pengujian hanya dibuat pada database lokal.

## Pemeriksaan tampilan

Jalankan `npx playwright install chromium` sekali, lalu `npm run test:ui`. Perintah ini membangun aplikasi dan menjalankan preview lokal sementara secara otomatis. Pengujian hanya menerima server lokal dan membuat akun serta proyek uji tersendiri. Screenshot disimpan di `.vinext/ui-review`. Gunakan `UI_BASE_URL` untuk server lokal yang sudah berjalan atau `UI_CHROMIUM_PATH` untuk executable Chromium yang sudah tersedia.

UI memakai IBM Plex Sans dan identitas Carousel Generator. Landing tanpa navbar memiliki satu tombol Buka dashboard. Dashboard dan pengaturan memakai sidebar dengan menu akun di bawah. Pengaturan menampilkan seluruh formulir dalam satu kolom tanpa tab atau navigasi bagian. Dokumen versi 2 dinormalisasi ke versi 3 saat dibaca; judul, isi, dan teks tambahan digabung menjadi paragraf tanpa mengubah ID, revision, aset, atau gaya. Proyek lama mempertahankan rasio persegi dan disimpan sebagai versi 3 pada penyimpanan berikutnya; tidak diperlukan migrasi SQL massal. Preview dan ekspor menggunakan renderer yang sama dan metrik lebar glyph dari font 400/700 di `app/font-metrics.json`. Endpoint, domain, dan identitas teknis MCP tetap sama.

Contoh landing menggunakan salinan lokal foto dari [Unsplash](https://images.unsplash.com/photo-1522071820081-009f0129c71c) di `public/example-conversation.jpg`, agar preview publik tidak bergantung pada proxy akun atau koneksi pihak ketiga. Proyek contoh yang dapat diedit tetap menyimpan URL HTTPS sumber.
