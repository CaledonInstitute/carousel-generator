type ConsentOptions = {
  clientName: string;
  username: string;
  params: URLSearchParams;
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export function renderConsent({
  clientName,
  username,
  params,
}: ConsentOptions) {
  const hidden = [...params]
    .filter(([key]) => key !== "decision")
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escape(key)}" value="${escape(value)}">`,
    )
    .join("");
  const switchAccount = `/masuk?switch=1&next=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`;
  const check =
    '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>';
  const shield =
    '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg>';
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hubungkan ${escape(clientName)} · Carousel Generator</title><link rel="stylesheet" href="/consent.css"></head>
<body><header class="consent-header"><a class="consent-brand" href="/proyek"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span><span>Carousel <span class="brand-light">Generator</span></span></a><span class="consent-header-note">Koneksi agent</span></header>
<main class="consent-shell">
<div class="consent-bridge" aria-hidden="true"><span class="bridge-app"><span class="bridge-slides"><i></i><i></i></span></span><span class="bridge-line">${shield}</span><span class="bridge-agent">${escape(Array.from(clientName)[0]?.toUpperCase() || "A")}</span></div>
<div class="consent-intro"><h1>Hubungkan ${escape(clientName)}<br>ke ruang kerjamu.</h1><p>Lanjutkan ide dari percakapan ke carousel.<br>Tinjau akses agent sebelum menghubungkan akun.</p></div>
<div class="consent-account"><span class="account-avatar" aria-hidden="true">${escape(username.slice(0, 1).toUpperCase())}</span><div><span>Akun yang dihubungkan</span><strong>${escape(username)}</strong></div><a href="${escape(switchAccount)}">Ganti akun</a></div>
<section class="consent-permissions" aria-labelledby="permissions-title"><h2 id="permissions-title">Akses yang kamu berikan</h2><p><strong>${escape(clientName)}</strong> akan dapat mengelola seluruh proyek milikmu.</p><ul><li><span class="permission-check">${check}</span><div><h3>Membaca proyek</h3><p>Melihat isi slide, gambar, dan pengaturan desain.</p></div></li><li><span class="permission-check">${check}</span><div><h3>Membuat dan mengedit carousel</h3><p>Perubahannya tersimpan di ruang kerja yang sama.</p></div></li><li><span class="permission-check">${check}</span><div><h3>Menghapus proyek</h3><p>Penghapusan oleh agent bersifat permanen.</p></div></li></ul></section>
<div class="consent-control">${shield}<p>Kamu tetap memegang kendali. Cabut akses kapan saja melalui <a href="/pengaturan" target="_blank" rel="noopener noreferrer">Pengaturan Carousel Generator</a>.</p></div>
<form method="post" class="consent-actions">${hidden}<button class="consent-cancel" name="decision" value="deny">Batal</button><button class="consent-allow" name="decision" value="allow">Izinkan akses</button></form>
<p class="consent-footer">Setelah diizinkan, kamu akan kembali ke client agent untuk melanjutkan.</p>
</main></body></html>`;
}
