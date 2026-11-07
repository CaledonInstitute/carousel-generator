# Ruang Slide

Studio carousel edukasi berbahasa Indonesia, dengan akun username/password, proyek pribadi di Cloudflare D1, dan MCP untuk Claude.ai atau agent lain. Kanvas tetap 1080 × 1080 dengan 5–20 slide dan enam layout.

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

Tempel URL HTTPS publik PNG, JPEG, atau WebP, maksimal 12 MB dan dimensi maksimal 16384 × 16384. Server memeriksa dimensi asli dan menolak rasio selain tepat 1:1. D1 menyimpan URL serta dimensi, tanpa R2 atau salinan gambar permanen. Link harus tetap tersedia dan dapat diambil tanpa login/cookie asal. URL yang memiliki masa berlaku dapat berhenti bekerja setelah kedaluwarsa.

Gambar tampil utuh dalam area persegi, tanpa crop/zoom. Preview mengambil gambar melalui endpoint akun; ekspor mengambil dan memvalidasi ulang gambar, menyisipkannya sementara ke SVG, lalu menghasilkan ZIP berisi PNG. Jika link berubah atau mati, ekspor menampilkan nomor slide bermasalah.

Autosave memakai versi proyek, bukan last-write-wins. Editor memeriksa pembaruan cloud setiap 5 detik ketika tab aktif. Konflik menghentikan autosave dan menawarkan versi cloud atau salinan baru. Jika offline, edit tetap berada di memori tab sampai berhasil disimpan; tidak tersedia mode offline persisten. Jangan menutup tab sebelum status tersimpan.

## MCP dan koneksi agent

Endpoint produksi: `https://carousel.hengker.tech/mcp` (Streamable HTTP, stateless, SDK MCP resmi). Endpoint baru tersedia setelah aplikasi ini dideploy.

Di Claude.ai, tambahkan konektor kustom dengan URL tersebut, masuk memakai username/password Ruang Slide, lalu izinkan akses pada layar persetujuan. Agent tidak menerima password. OAuth mendukung discovery, dynamic client registration, authorization code dengan PKCE S256, access token 1 jam, dan refresh token berotasi hingga 90 hari per token. Resource OAuth wajib `https://carousel.hengker.tech/mcp`.

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

Schema layout/style tersedia langsung dalam tool MCP. Layout: `sampul`, `gambar`, `daftar`, `langkah`, `perbandingan`, `penutup`. MCP dan web memakai layanan validasi, kepemilikan, gambar, dan penyimpanan yang sama. MCP tidak mengekspor PNG; buka tautan editor untuk mengunduh.

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

Posting carousel langsung tersedia sebagai fitur opsional untuk satu pengguna dan satu akun profesional Instagram. Fitur nonaktif secara default; tidak ada kredensial Meta di repository. Pengaturan menyediakan koneksi Instagram dan editor menyediakan preview, caption, serta posting 5–10 slide. JPEG sementara dan progres disimpan di D1; proses dilanjutkan melalui permintaan dari dialog editor. Biarkan dialog terbuka sampai selesai, atau buka kembali untuk melanjutkan. Ikuti [panduan konfigurasi dan aktivasi](docs/instagram.md) sebelum mengaktifkannya. ZIP PNG tetap tersedia untuk proyek hingga 20 slide.

## Pemeriksaan aplikasi

```sh
npm test
npx tsc --noEmit
npm run test:workers
npx wrangler deploy --dry-run
```

Pengujian mencakup isolasi pengguna, autentikasi/CSRF/rate limit, kedaluwarsa dan pencabutan token, OAuth PKCE dan refresh rotation, CRUD MCP, konflik versi, URL jaringan privat, dimensi/ukuran gambar, renderer enam layout, dan ekspor PNG dengan gambar URL serta tiga font. Pengujian canvas memakai mock; pemeriksaan visual dan unduhan browser tetap perlu dilakukan pada browser yang tersedia.

Smoke test membangun aplikasi dan menjalankannya di workerd, memeriksa pengalihan login, registrasi, CRUD D1, MCP/discovery, reload halaman, aset, dan enam font. Akun pengujian hanya dibuat pada database lokal.
