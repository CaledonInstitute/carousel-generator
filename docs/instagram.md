# Instagram pilot

Fitur ini hanya tersedia untuk satu ID pengguna Carousel Generator dan satu akun Instagram Business/Creator. Tidak ada posting produksi otomatis selama setup. MCP tidak memiliki akses publikasi. Dokumen proyek tetap versi 2.

Implementasi memakai **website dan D1 yang sudah ada**. Tidak perlu R2, Cloudflare Queue, worker terpisah, maupun cron. Browser merender JPEG; server menyimpannya sementara di D1 dan melanjutkan publikasi satu langkah per permintaan dari dialog editor.

## 1. Meta App

1. Buat aplikasi di Meta for Developers dengan use case Instagram, dimiliki business portfolio, lalu pilih **API setup with Unified login**. Aplikasi baru tidak menyediakan setup Instagram Login lama. Gunakan **Meta App ID/Secret** dari **App settings → Basic**. Angka **Configuration ID** pada setup Unified Login adalah nilai terpisah, bukan App ID.
2. Tambahkan akun profesional sebagai Instagram tester dan terima undangannya di akun Instagram. Selesaikan persyaratan dashboard untuk penggunaan Development/Standard Access akun penguji. Akses pengguna umum memerlukan review/akses yang sesuai dan belum termasuk pilot ini.
3. Daftarkan redirect URI persis `https://carousel.hengker.tech/api/instagram/callback`. Lengkapi URL kebijakan privasi dan penghapusan data sesuai persyaratan dashboard sebelum mengaktifkan aplikasi untuk publik.
4. Pilih konfigurasi Facebook Login for Business berlabel **Instagram Login Compatible** dan catat Configuration ID. Pastikan `instagram_basic` dan `instagram_content_publish` tersedia. Konfigurasi bawaan Meta juga dapat meminta izin pesan, komentar, dan iklan; kurangi izin opsional yang tidak dipakai lewat **Edit permissions** jika dashboard mengizinkan. Pilot hanya memakai profil dan publikasi carousel; ad account tidak diperlukan. Saat login, pilih business portfolio dan bagikan tepat satu akun Business/Creator. Jika beberapa akun dibagikan, koneksi ditolak agar tujuan posting tidak terpilih secara tidak sengaja.
5. Verifikasi versi Graph API yang masih didukung, endpoint, serta batas media pada dokumentasi Meta saat setup. Isi `INSTAGRAM_API_VERSION` secara eksplisit, misalnya `vXX.0` diganti versi aktual; tidak ada versi default. Batas produk pilot tetap 5–10 JPEG 1080 × 1350 (portrait) atau 1080 × 1080 (square), mengikuti snapshot proyek, maksimal 8 MB per slide dan caption 2.200 karakter.

Referensi resmi: [Unified Login — Get started](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started), [Authentication](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication), [Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing). Pada 7 November 2026, contoh resmi memakai Graph API `v27.0`, yang dipakai konfigurasi deployment ini.

Untuk aplikasi lama yang masih memakai Instagram Login, kode tetap mendukungnya bila `INSTAGRAM_CONFIG_ID` tidak diisi. Gunakan Instagram App ID/Secret dan izin `instagram_business_basic,instagram_business_content_publish` khusus alur lama itu. Mengganti alur atau Configuration ID mewajibkan koneksi ulang.

## 2. Konfigurasi website

Cukup gunakan aplikasi dan database D1 yang sudah tersedia. Terapkan migrasi sebelum aktivasi:

```powershell
npm run db:remote
```

Migrasi `0003_instagram_d1_media.sql` menambahkan penyimpanan JPEG sementara di D1 dan menyesuaikan metadata upload. Migrasi sebelumnya tetap disimpan agar database yang sudah dimigrasi kompatibel. Persiapan lama yang belum dipublikasikan ditandai gagal dan perlu disiapkan ulang.

Migrasi `0004_instagram_unified_login.sql` menyimpan metode login, client business ID, dan Configuration ID pada koneksi. Token Unified Login disimpan terenkripsi seperti token lama. Nilai `expires=0` hanya digunakan bila Meta mengonfirmasi token tidak memiliki waktu kedaluwarsa.

Untuk database baru, jalankan seluruh migrasi sesuai urutan melalui perintah di atas. Jangan menjalankan `0003` sendirian atau mengubah `0002` yang sudah diterapkan. Pada development, gunakan `npm run db:local`; database lokal dan produksi terpisah.

Ambil ID pengguna website, bukan username Instagram:

```powershell
npx wrangler d1 execute carousel-generator-db --remote --command "SELECT id,username FROM users"
```

Di `wrangler.jsonc`, tambahkan vars `INSTAGRAM_OWNER_ID` (ID di atas), `INSTAGRAM_APP_ID`, `INSTAGRAM_CONFIG_ID`, `INSTAGRAM_API_VERSION`, dan `INSTAGRAM_ORIGIN` (`https://carousel.hengker.tech`). Biarkan `INSTAGRAM_ENABLED=false` sampai Meta App, migrasi, dan secrets siap. Jangan masukkan secret ke file config atau git.

| Variabel | Nilai yang diisi |
| --- | --- |
| `INSTAGRAM_ENABLED` | String `"false"` selama setup; `"true"` untuk aktivasi. |
| `INSTAGRAM_OWNER_ID` | ID akun Carousel Generator dari tabel `users`, bukan username atau ID Instagram. |
| `INSTAGRAM_APP_ID` | Meta App ID dari App settings → Basic untuk Unified Login. |
| `INSTAGRAM_CONFIG_ID` | Configuration ID dari setup Unified Login. Jangan isi Configuration ID sebagai App ID. |
| `INSTAGRAM_API_VERSION` | Versi Graph API yang telah diverifikasi di Meta, dengan format `v` + nomor versi, misalnya pola `vXX.0`. Ganti `XX` dengan nomor aktual; tidak ada default. |
| `INSTAGRAM_ORIGIN` | `https://carousel.hengker.tech`, tanpa slash penutup, agar callback dan URL media menggunakan domain yang sama. |

Contoh bentuk `vars` setelah mengganti placeholder:

```json
"vars": {
  "INSTAGRAM_ENABLED": "false",
  "INSTAGRAM_OWNER_ID": "GANTI_DENGAN_ID_USER_RUANG_SLIDE",
  "INSTAGRAM_APP_ID": "GANTI_DENGAN_META_APP_ID",
  "INSTAGRAM_CONFIG_ID": "GANTI_DENGAN_CONFIGURATION_ID",
  "INSTAGRAM_API_VERSION": "vXX.0",
  "INSTAGRAM_ORIGIN": "https://carousel.hengker.tech"
}
```

Buat dua nilai acak terpisah; kunci token harus base64url dari 32 byte. Perintah ini hanya mencetak kunci baru, bukan kredensial yang sudah tersimpan:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Pasang secrets pada website melalui prompt Wrangler:

```powershell
npx wrangler secret put INSTAGRAM_APP_SECRET
npx wrangler secret put INSTAGRAM_TOKEN_KEY
npx wrangler secret put INSTAGRAM_MEDIA_KEY
```

`INSTAGRAM_TOKEN_KEY` mengenkripsi token AES-GCM dengan ID pengguna sebagai additional authenticated data; `INSTAGRAM_MEDIA_KEY` menandatangani URL media HMAC-SHA256. Jangan mengganti kunci token tanpa menghubungkan ulang akun. Pisahkan dan jangan gunakan ulang kedua kunci.

## 3. Verifikasi dan aktivasi

```powershell
npm test
npx tsc --noEmit
npm run test:workers
npx wrangler deploy --dry-run
```

Setelah semuanya siap, set `INSTAGRAM_ENABLED=true` di `wrangler.jsonc`, lalu deploy website:

```powershell
npm run deploy
```

Buka menu akun di kiri bawah sidebar → Pengaturan, lalu kontrol Instagram, hubungkan akun penguji. Buka proyek 5 slide, pilih Posting ke Instagram → isi caption → Siapkan posting. Browser menyimpan proyek, merender snapshot, mengunggah JPEG, dan menampilkan preview hasil. **Posting sekarang** adalah tindakan eksplisit yang baru memulai publikasi. Lakukan satu posting percobaan yang memang ingin diterbitkan; periksa urutan slide, caption, dan tautannya di Instagram. Tidak ada posting percobaan dalam tes otomatis.

Biarkan dialog posting terbuka sampai status berhasil. Jika dialog atau tab ditutup, buka proyek yang sama lalu **Posting ke Instagram** untuk melanjutkan job aktif. Jangan membuat persiapan baru hanya karena koneksi terputus; periksa status job yang sudah ada terlebih dahulu. Proyek 11–20 slide tetap dapat diunduh, tetapi posting langsung ditolak tanpa memotong slide.

Untuk lokal, gunakan D1 lokal (`npm run db:local`) dan variabel privat `.dev.vars` yang tidak dikomit. Tes otomatis memakai Miniflare dan mock Meta, tidak perlu kredensial. Login/publikasi Meta memerlukan callback HTTPS yang terdaftar dan URL gambar HTTPS yang dapat diambil Meta; localhost saja tidak cukup.

## Operasional

- JPEG hasil render disimpan dalam potongan BLOB 256 KB di D1, maksimal 8 MB per slide. Gambar hanya bisa diambil melalui URL HMAC yang berakhir setelah 48 jam; token login tidak diperlukan pada URL tersebut agar Meta dapat mengambil gambarnya.
- Setiap POST `/api/instagram/jobs/:id/advance` menjalankan satu langkah publikasi di server. Editor mengirim permintaan setiap 5 detik tanpa permintaan tumpang tindih. Biarkan dialog terbuka sampai selesai. Menutup dialog menghentikan langkah berikutnya; buka kembali untuk melanjutkan dari progres D1. Satu permintaan yang sudah berjalan masih dapat selesai.
- Unified Login menggunakan `graph.facebook.com` dan Business Integration System User Access Token. Masa berlaku mengikuti konfigurasi Meta; token tanpa masa kedaluwarsa tetap dapat dicabut. Token ini tidak dikirim ke endpoint refresh Instagram Login. Jika kedaluwarsa atau Meta mengembalikan token tidak valid, hubungkan ulang dari Pengaturan.
- Khusus koneksi Instagram Login lama, refresh dilakukan saat membuka koneksi, membuat persiapan, atau melanjutkan publikasi bila token mendekati kedaluwarsa dan sudah cukup umur. Tidak ada refresh harian di latar belakang. Token lama yang sudah kedaluwarsa memerlukan koneksi ulang.
- JPEG kedaluwarsa tidak bisa diakses lagi. Pembersihan fisik dilakukan bertahap saat pengguna pilot mengakses koneksi atau membuat persiapan baru, maksimal 256 baris per permintaan. Tanpa aktivitas, data kedaluwarsa masih memakai ruang D1 sampai akses berikutnya.
- Request key menjaga idempotensi persiapan; lease D1 menjaga satu pemroses per job. Sebelum `media_publish`, status `publishing` disimpan. Timeout/crash sesudahnya hanya memeriksa container, tidak mengirim ulang publish. Jika container sudah `PUBLISHED` tetapi ID media hilang, UI mengarahkan ke profil.
- Job dengan hasil tidak pasti tetap **memverifikasi**. Setelah 48 jam, pemeriksaan berhenti; periksa profil secara manual sebelum memposting ulang.
- Putus koneksi menghapus token lokal dan menghentikan job yang belum dikirim. Request yang sudah mencapai Meta mungkin tetap selesai; izin aplikasi juga dapat dicabut dari pengaturan Instagram.
- Jangan mencatat token, callback code, URL pertukaran token, atau isi respons Meta ke log. Snapshot dan metadata job tetap tersimpan di D1 sampai dihapus bersama akun.
- Untuk menonaktifkan fitur, set `INSTAGRAM_ENABLED=false` dan deploy ulang website. Tidak ada layanan publikasi tambahan yang perlu dijalankan.

## Mengatasi kendala

| Kondisi | Tindakan |
| --- | --- |
| Instagram belum dikonfigurasi | Periksa flag aktivasi, seluruh vars/secrets, dan ID pengguna pilot. Hanya akun website dengan ID yang sesuai dapat mengakses fitur. |
| Koneksi ditolak atau gagal | Periksa callback URI, Meta App ID/Secret, Configuration ID, kepemilikan business portfolio, status akun penguji, dan izin publikasi. Mulai koneksi lagi dari Pengaturan. |
| Bagikan tepat satu akun Instagram | Hubungkan lagi dan pilih satu akun tujuan saja di dialog Meta. Tidak ada pemilihan akun otomatis jika beberapa aset dibagikan. |
| Perubahan bertabrakan | Selesaikan konflik autosave di editor, lalu siapkan posting dari versi proyek yang sudah tersimpan. |
| Gambar slide gagal dibuat | Perbaiki URL gambar sumber agar bisa diambil tanpa login, kemudian siapkan ulang. |
| Progres berhenti setelah dialog ditutup | Buka kembali dialog pada proyek yang sama. Pemrosesan berikutnya memerlukan permintaan dari dialog yang terbuka. |
| Status memverifikasi | Periksa profil Instagram dan status job sebelum memposting ulang. Sistem tidak mengulangi panggilan publish yang hasilnya belum pasti. |
| Persiapan kedaluwarsa | Setelah 48 jam sejak job dibuat, siapkan posting baru. Jika hasil publikasi sebelumnya belum pasti, periksa profil terlebih dahulu. |
| Perlu dihubungkan ulang | Buka menu akun di kiri bawah sidebar → Pengaturan, lalu kontrol Instagram dan lakukan login ulang; token yang sudah kedaluwarsa tidak dapat diperpanjang lewat alur refresh biasa. |

Perubahan kode dan perintah pemeriksaan tidak otomatis melakukan deployment, menerapkan migrasi produksi, atau mempublikasikan posting. Aktivasi memerlukan konfigurasi Meta dan Cloudflare di atas; publikasi baru dimulai setelah tombol **Posting sekarang** ditekan.
