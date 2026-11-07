import type { Metadata } from "next";
import "./globals.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-700.css";

export const metadata: Metadata = {
  title: "Ruang Slide — Ruang untuk ide yang berarti",
  description:
    "Studio carousel edukasi. Tulis, susun, dan unduh cerita visualmu. Simpan proyek di cloud dan hubungkan agent.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
