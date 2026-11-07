import type { Metadata } from "next";
import { Guides } from "./guides";

export const metadata: Metadata = {
  title: "Panduan membuat carousel dengan AI — Ruang Slide",
  description:
    "Siapkan materi dengan prompt siap salin, periksa hasil AI, lalu susun carousel edukasi di Ruang Slide.",
};

export default function Page() {
  return <Guides />;
}
