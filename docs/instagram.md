# Instagram pilot

Fitur ini hanya tersedia untuk satu ID pengguna Ruang Slide dan satu akun Instagram Business/Creator. Tidak ada posting produksi otomatis selama setup. MCP tidak memiliki akses publikasi. Dokumen proyek tetap versi 2.

## 1. Meta App

1. Buat aplikasi di Meta for Developers, tambahkan Instagram dan pilih **API setup with Instagram Login**. Gunakan Instagram App ID/Secret yang ditampilkan pada setup Instagram, bukan kredensial aplikasi lain.
2. Tambahkan akun profesional sebagai Instagram tester dan terima undangannya di akun Instagram. Selesaikan persyaratan dashboard untuk penggunaan Development/Standard Access akun penguji. Akses pengguna umum memerlukan review/akses yang sesuai dan belum termasuk pilot ini.
3. Daftarkan redirect URI persis `https://carousel.hengker.tech/api/instagram/callback`. Lengkapi URL kebijakan privasi dan penghapusan data sesuai persyaratan dashboard sebelum mengaktifkan aplikasi untuk publik.
4. Berikan izin `instagram_business_basic` dan `instagram_business_content_publish`. Periksa bahwa izin publikasi benar-benar diberikan saat login. Akun pribadi tidak didukung.
5. Verifikasi versi Graph API yang masih didukung, endpoint, serta batas media pada dokumentasi Meta saat setup. Isi `INSTAGRAM_API_VERSION` secara eksplisit, misalnya `vXX.0` diganti versi aktual; tidak ada versi default. Batas produk pilot tetap 5–10 JPEG persegi 1080 px, maksimal 8 MB per slide dan caption 2.200 karakter.

Referensi resmi: [Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/), [Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [koleksi Meta](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api).

## 2. Konfigurasi website

Cukup gunakan aplikasi dan database D1 yang sudah tersedia. Terapkan migrasi sebelum aktivasi:

```powershell
npm run db:remote
```

Migrasi `0003_instagram_d1_media.sql` menambahkan penyimpanan JPEG sementara di D1 dan menyesuaikan metadata upload. Migrasi sebelumnya tetap disimpan agar database yang sudah dimigrasi kompatibel. Persiapan lama yang belum dipublikasikan ditandai gagal dan perlu disiapkan ulang.

Ambil ID pengguna website, bukan username Instagram:

```powershell
npx wrangler d1 execute carousel-generator-db --remote --command "SELECT id,username FROM users"
```

Di `wrangler.jsonc`, tambahkan vars `INSTAGRAM_OWNER_ID` (ID di atas), `INSTAGRAM_APP_ID`, `INSTAGRAM_API_VERSION`, dan `INSTAGRAM_ORIGIN` (`https://carousel.hengker.tech`). Biarkan `INSTAGRAM_ENABLED=false` sampai Meta App, migrasi, dan secrets siap. Jangan masukkan secret ke file config atau git.

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

Buka Pengaturan → Instagram, hubungkan akun penguji. Buka proyek 5 slide, pilih Posting ke Instagram → isi caption → Siapkan posting. Browser menyimpan proyek, merender snapshot, mengunggah JPEG, dan menampilkan preview hasil. **Posting sekarang** adalah tindakan eksplisit yang baru memulai publikasi. Lakukan satu posting percobaan yang memang ingin diterbitkan; periksa urutan slide, caption, dan tautannya di Instagram. Tidak ada posting percobaan dalam tes otomatis.

Untuk lokal, gunakan D1 lokal (`npm run db:local`) dan variabel privat `.dev.vars` yang tidak dikomit. Tes otomatis memakai Miniflare dan mock Meta, tidak perlu kredensial. Login/publikasi Meta memerlukan callback HTTPS yang terdaftar dan URL gambar HTTPS yang dapat diambil Meta; localhost saja tidak cukup.

## Operasional

- JPEG hasil render disimpan dalam potongan BLOB 256 KB di D1, maksimal 8 MB per slide. Gambar hanya bisa diambil melalui URL HMAC yang berakhir setelah 48 jam; token login tidak diperlukan pada URL tersebut agar Meta dapat mengambil gambarnya.
- Setiap POST `/api/instagram/jobs/:id/advance` menjalankan satu langkah publikasi di server. Editor mengirim permintaan setiap 5 detik tanpa permintaan tumpang tindih. Biarkan dialog terbuka sampai selesai. Menutup dialog menghentikan langkah berikutnya; buka kembali untuk melanjutkan dari progres D1. Satu permintaan yang sudah berjalan masih dapat selesai.
- Refresh token dilakukan saat membuka koneksi, membuat persiapan, atau melanjutkan publikasi jika token mendekati kedaluwarsa dan sudah cukup umur untuk di-refresh. Tidak ada refresh harian di latar belakang. Jika akun tidak digunakan sampai token kedaluwarsa, hubungkan ulang.
- JPEG kedaluwarsa tidak bisa diakses lagi. Pembersihan fisik dilakukan bertahap saat pengguna pilot mengakses koneksi atau membuat persiapan baru, maksimal 256 baris per permintaan. Tanpa aktivitas, data kedaluwarsa masih memakai ruang D1 sampai akses berikutnya.
- Request key menjaga idempotensi persiapan; lease D1 menjaga satu pemroses per job. Sebelum `media_publish`, status `publishing` disimpan. Timeout/crash sesudahnya hanya memeriksa container, tidak mengirim ulang publish. Jika container sudah `PUBLISHED` tetapi ID media hilang, UI mengarahkan ke profil.
- Job dengan hasil tidak pasti tetap **memverifikasi**. Setelah 48 jam, pemeriksaan berhenti; periksa profil secara manual sebelum memposting ulang.
- Putus koneksi menghapus token lokal dan menghentikan job yang belum dikirim. Request yang sudah mencapai Meta mungkin tetap selesai; izin aplikasi juga dapat dicabut dari pengaturan Instagram.
- Jangan mencatat token, callback code, URL pertukaran token, atau isi respons Meta ke log. Snapshot dan metadata job tetap tersimpan di D1 sampai dihapus bersama akun.
- Untuk menonaktifkan fitur, set `INSTAGRAM_ENABLED=false` dan deploy ulang website. Tidak ada layanan publikasi tambahan yang perlu dijalankan.
