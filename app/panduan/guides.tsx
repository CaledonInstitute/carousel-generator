"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  FileText,
} from "lucide-react";
import { Header } from "../studio";

const revisionPrompt = `Tinjau rancangan carousel di atas sebagai editor konten edukasi.

1. Periksa alur: pembuka, penjelasan yang bertahap, dan penutup.
2. Pastikan satu slide hanya membawa satu gagasan utama.
3. Tandai klaim, angka, atau kutipan yang perlu saya verifikasi. Jangan mengarang sumber.
4. Ringkas kalimat yang terlalu panjang tanpa mengubah maknanya.
5. Pastikan saran gambar membantu menjelaskan isi, bukan sekadar dekorasi.

Tampilkan bagian yang perlu diperbaiki, alasannya, lalu versi revisinya. Pertahankan jumlah slide. Jika materi tidak cukup, katakan bagian yang membutuhkan informasi tambahan.`;

export function Guides() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [count, setCount] = useState(8);
  const [tone, setTone] = useState("Santai dan jelas");
  const [material, setMaterial] = useState("");
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const revisionRef = useRef<HTMLTextAreaElement>(null);
  const copyAttempt = useRef(0);
  const prompt = `Bantu saya menyusun materi carousel edukasi berbahasa Indonesia untuk Instagram.

Topik: ${topic.trim() || "[isi topik yang ingin dibahas]"}
Audiens: ${audience.trim() || "[jelaskan siapa pembacanya dan tingkat pengetahuannya]"}
Jumlah slide: ${count}
Gaya bahasa: ${tone.toLowerCase()}
Format: persegi 1080 × 1080, putih, lapang, teks dan gambar saling melengkapi.
${material.trim() ? `\nMateri acuan:\n${material.trim()}\n` : ""}
Susun alur dengan pembuka yang menarik dan relevan, isi yang bertahap, lalu penutup dengan ajakan yang sesuai. Jangan membuat janji berlebihan atau menambahkan slide hanya untuk memenuhi jumlah. Jika materi belum cukup, tanyakan informasi tambahan.

Untuk SETIAP slide, tulis:
- Nomor slide.
- Komposisi: pilih Sampul, Teks & gambar, Daftar, Langkah, Perbandingan, atau Penutup.
- Judul: usahakan maksimal 8 kata.
- Isi: usahakan 20–40 kata dan satu gagasan utama. Ini panduan penulisan, bukan batas otomatis editor.
- Untuk Daftar atau Langkah: satu butir per baris, tanpa penomoran manual karena editor menambahkannya.
- Untuk Perbandingan: pisahkan teks sisi kiri dan sisi kanan.
- Untuk Penutup: sertakan ajakan singkat pada bagian terpisah.
- Untuk Teks & gambar: jelaskan foto, diagram, atau ilustrasi yang dibutuhkan dan apa yang dijelaskannya. Saya akan menyediakan gambar sendiri.

Gunakan Sampul untuk slide pertama dan Penutup untuk slide terakhir. Pilih komposisi slide isi sesuai materinya. Gunakan kalimat konkret, hindari jargon yang tidak dijelaskan, dan jangan mengulang pesan yang sama.

Jangan mengarang fakta, statistik, kutipan, atau sumber. Tandai informasi yang belum pasti dengan [perlu verifikasi].${material.trim() ? " Utamakan materi acuan; tandai penambahan informasi di luar materi tersebut." : ""}

Berikan hasil sebagai teks terstruktur per slide, bukan tabel atau file proyek. Pisahkan teks yang akan tampil di slide dari catatan visual dan catatan verifikasi.`;

  async function copy(
    text: string,
    kind: string,
    field: HTMLTextAreaElement | null,
  ) {
    const attempt = ++copyAttempt.current;
    setCopied("");
    setCopyError("");
    try {
      await navigator.clipboard.writeText(text);
      if (attempt === copyAttempt.current) setCopied(kind);
    } catch {
      field?.focus();
      field?.select();
      if (attempt === copyAttempt.current)
        setCopyError(
          "Salin otomatis belum tersedia. Teks sudah dipilih; tekan Ctrl+C atau gunakan menu Salin di perangkatmu.",
        );
    }
  }

  return (
    <>
      <Header active="guides" />
      <main className="guides-page">
        <section className="guide-intro">
          <div>
            <h1>
              Siapkan dengan AI.
              <br />
              Ceritakan dengan caramu.
            </h1>
            <p>
              Gunakan AI untuk membantu menyusun gagasan, lalu beri bentuk di
              Ruang Slide. Mulai dari prompt yang jelas, bukan halaman kosong.
            </p>
          </div>
          <aside className="guide-note">
            <strong>Kamu tetap editornya.</strong>
            <p>
              Prompt disalin ke aplikasi AI pilihanmu. Ruang Slide tidak
              mengirim materi ke AI; hasilnya kamu pindahkan ke editor secara
              manual.
            </p>
            <a href="/proyek">
              Buka proyek saya <ArrowRight size={15} />
            </a>
          </aside>
        </section>
        <nav className="guide-jump" aria-label="Bagian panduan">
          <a href="#siapkan">
            01 <span>Siapkan materi</span>
          </a>
          <a href="#periksa">
            02 <span>Periksa hasilnya</span>
          </a>
          <a href="#susun">
            03 <span>Susun di studio</span>
          </a>
        </nav>

        <section className="guide-section" id="siapkan">
          <div className="guide-section-heading">
            <span className="guide-step">01</span>
            <div>
              <h2>Mulai dengan arahan yang jelas.</h2>
              <p>
                Isi konteks singkat. Prompt di sebelahnya akan mengikuti
                pilihanmu.
              </p>
            </div>
          </div>
          <div className="prompt-builder">
            <div className="guide-fields">
              <div className="field">
                <label htmlFor="guide-topic">
                  Apa yang ingin kamu jelaskan?
                </label>
                <input
                  id="guide-topic"
                  placeholder="Misalnya: cara menjelaskan ide yang rumit"
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
                    setCopied("");
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="guide-audience">
                  Untuk siapa carousel ini?
                </label>
                <input
                  id="guide-audience"
                  placeholder="Misalnya: kreator pemula yang berbagi edukasi"
                  value={audience}
                  onChange={(e) => {
                    setAudience(e.target.value);
                    setCopied("");
                  }}
                />
              </div>
              <div className="guide-field-row">
                <div className="field">
                  <label htmlFor="guide-count">Jumlah slide</label>
                  <select
                    id="guide-count"
                    value={count}
                    onChange={(e) => {
                      setCount(Number(e.target.value));
                      setCopied("");
                    }}
                  >
                    {Array.from({ length: 16 }, (_, i) => i + 5).map((n) => (
                      <option key={n} value={n}>
                        {n} slide
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="guide-tone">Gaya bahasa</label>
                  <select
                    id="guide-tone"
                    value={tone}
                    onChange={(e) => {
                      setTone(e.target.value);
                      setCopied("");
                    }}
                  >
                    {[
                      "Santai dan jelas",
                      "Profesional dan ringkas",
                      "Hangat dan bercerita",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="guide-material">
                  Materi acuan{" "}
                  <span>
                    Opsional · catatan atau teks sumber yang kamu miliki
                  </span>
                </label>
                <textarea
                  id="guide-material"
                  rows={6}
                  placeholder="Tempel materi agar AI punya konteks yang lebih akurat…"
                  value={material}
                  onChange={(e) => {
                    setMaterial(e.target.value);
                    setCopied("");
                  }}
                />
              </div>
              <p className="guide-field-tip">
                Isi di halaman ini tidak disimpan setelah halaman dimuat ulang.
                Pilih materi yang memang ingin kamu bagikan ke aplikasi AI.
              </p>
            </div>
            <div className="prompt-preview">
              <div className="prompt-heading">
                <span>
                  <FileText size={16} /> Prompt kamu
                </span>
                <span>{count} slide</span>
              </div>
              <label className="sr-only" htmlFor="guide-prompt">
                Prompt lengkap untuk disalin ke AI
              </label>
              <textarea
                id="guide-prompt"
                ref={promptRef}
                readOnly
                value={prompt}
                spellCheck={false}
              />
              <div className="prompt-bottom">
                <span>Salin, lalu tempel di aplikasi AI pilihanmu.</span>
                <button
                  className="button"
                  onClick={() => copy(prompt, "main", promptRef.current)}
                >
                  {copied === "main" ? <Check size={16} /> : <Copy size={16} />}
                  {copied === "main" ? "Tersalin" : "Salin prompt"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="guide-section" id="periksa">
          <div className="guide-section-heading">
            <span className="guide-step">02</span>
            <div>
              <h2>Bagus dibaca. Benar isinya.</h2>
              <p>
                Anggap hasil pertama sebagai draf. Baca ulang dengan sudut
                pandang audiensmu.
              </p>
            </div>
          </div>
          <div className="guide-review">
            <div className="guide-review-notes">
              {[
                [
                  "Periksa fakta dan sumber",
                  "Cocokkan klaim, angka, serta kutipan dengan sumber asli. Hapus bagian yang belum bisa dipastikan.",
                ],
                [
                  "Jaga satu gagasan per slide",
                  "Baca judulnya secara berurutan. Pastikan ceritanya tetap masuk akal dan tidak mengulang hal yang sama.",
                ],
                [
                  "Buat terasa seperti kamu",
                  "Ganti kalimat yang kaku dengan bahasa yang biasa kamu pakai. Tambahkan contoh yang dekat dengan pembaca.",
                ],
                [
                  "Pilih gambar yang menjelaskan",
                  "Gunakan gambar yang kamu miliki atau berhak kamu gunakan. Catatan visual dari AI bukan gambar yang sudah tersedia.",
                ],
              ].map(([title, body]) => (
                <article key={title}>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="revision-prompt">
              <h3>Minta satu putaran perbaikan.</h3>
              <p>
                Tempel prompt ini dalam percakapan AI yang sama setelah mendapat
                draf.
              </p>
              <label className="sr-only" htmlFor="revision-prompt">
                Prompt untuk meninjau draf carousel
              </label>
              <textarea
                id="revision-prompt"
                ref={revisionRef}
                readOnly
                value={revisionPrompt}
              />
              <button
                className="button secondary"
                onClick={() =>
                  copy(revisionPrompt, "revision", revisionRef.current)
                }
              >
                {copied === "revision" ? (
                  <Check size={16} />
                ) : (
                  <Copy size={16} />
                )}
                {copied === "revision" ? "Tersalin" : "Salin prompt revisi"}
              </button>
            </div>
          </div>
        </section>

        <section className="guide-section" id="susun">
          <div className="guide-section-heading">
            <span className="guide-step">03</span>
            <div>
              <h2>Beri ruang untuk setiap gagasan.</h2>
              <p>
                Materi sudah siap. Sekarang susun menjadi carousel yang nyaman
                dibaca.
              </p>
            </div>
          </div>
          <div className="guide-transfer">
            {[
              [
                "Buka proyek, sesuaikan jumlah slide",
                "Buat carousel dari Proyek saya. Editor dimulai dengan 5 slide; tambahkan hingga jumlah yang kamu siapkan, maksimal 20.",
              ],
              [
                "Pindahkan teks sesuai komposisi",
                "Pilih layout per slide, lalu salin judul dan isi ke kolomnya. Pada daftar atau langkah, pisahkan setiap butir dengan baris baru. Catatan visual dan verifikasi tidak perlu ditempel ke slide.",
              ],
              [
                "Tambahkan gambar dan rapikan",
                "Unggah gambar untuk layout Teks & gambar. Atur crop, font, warna, dan nama akun. Bila teks terlalu padat, ringkas atau bagi ke slide baru selama belum mencapai 20 slide.",
              ],
              [
                "Tinjau, simpan cadangan, unduh",
                "Periksa semua slide lewat Tinjau dan selesaikan peringatannya. Unduh ZIP PNG untuk dibagikan, serta file .carousel agar proyek bisa diedit kembali.",
              ],
            ].map(([title, body], i) => (
              <article key={title}>
                <span>{i + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <div className="guide-ready">
            <p>
              <strong>Sudah punya materi?</strong>
              <span>Bawa gagasanmu ke kanvas.</span>
            </p>
            <a href="/proyek" className="button">
              Buka studio <ArrowRight size={17} />
            </a>
          </div>
        </section>
        <section className="guide-faq">
          <h2>Sebelum mulai</h2>
          <details>
            <summary>Apakah hasil AI bisa langsung diimpor?</summary>
            <p>
              Belum. Pindahkan judul dan isi ke kolom editor secara manual.
              Fitur impor proyek hanya menerima file .carousel yang diunduh dari
              Ruang Slide, bukan teks atau file buatan AI.
            </p>
          </details>
          <details>
            <summary>Apakah perlu menggunakan AI?</summary>
            <p>
              Tidak. Kamu bisa menulis sendiri langsung di editor. Panduan ini
              membantu jika kamu ingin memakai AI untuk menyusun atau menyunting
              materi.
            </p>
          </details>
          <details>
            <summary>Kenapa masih ada peringatan teks terlalu panjang?</summary>
            <p>
              Jumlah kata dalam prompt hanya arahan. Ruang yang tersedia
              bergantung pada layout, ukuran huruf, dan panjang judul. Periksa
              preview dan sesuaikan isi di editor.
            </p>
          </details>
        </section>
      </main>
      <footer>
        <a href="/" className="logo">
          ruang<span className="logo-light">slide.</span>
        </a>
        <span>Ide dibantu. Cerita tetap milikmu.</span>
      </footer>
      <div className="guide-copy-status" role="status" aria-live="polite">
        {copied ? "Prompt berhasil disalin." : ""}
      </div>
      {copyError && (
        <div className="guide-copy-error" role="alert">
          <p>{copyError}</p>
          <button
            aria-label="Tutup pesan salin"
            onClick={() => setCopyError("")}
          >
            Tutup
          </button>
        </div>
      )}
    </>
  );
}
