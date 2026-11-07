import React from "react";
import { effectiveStyle, imageSource, type Project, type Slide } from "./model";

// The conservative glyph widths keep wrapping deterministic in preview and exported SVG.
export function wrap(text: string, width: number, size: number): string[] {
  const measure = (v: string) =>
    Array.from(v).reduce(
      (n, c) =>
        n +
        ("ilI.,!':;| ".includes(c) ? 0.29 : "MW@%".includes(c) ? 0.91 : 0.57) *
          size,
      0,
    );
  return text.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    for (const word of paragraph.split(" ")) {
      if (measure(line ? line + " " + word : word) > width && line) {
        lines.push(line);
        line = "";
      }
      if (measure(word) > width) {
        for (const c of word) {
          if (measure(line + c) > width) {
            lines.push(line);
            line = "";
          }
          line += c;
        }
      } else line += (line ? " " : "") + word;
    }
    lines.push(line);
    return lines;
  });
}
// All coordinates and overflow checks share these metrics with the SVG renderer.
// Text positions are baselines; safe content ends before the footer at y=960.
export function metrics(p: Project, s: Slide) {
  const st = effectiveStyle(p, s);
  const hero = s.layout === "sampul" || s.layout === "penutup";
  const titleSize = st.size * (s.layout === "sampul" ? 2.75 : s.layout === "penutup" ? 2.4 : 1.7);
  const titleY = hero ? 264 : 196;
  const titleLines = wrap(s.title, 920, titleSize);
  const titleBottom = titleY + (Math.max(1, titleLines.length) - 1) * titleSize * 1.12 + titleSize * .25;
  const bodyTop = Math.max(hero ? 620 : 350, titleBottom + st.size + 48);
  const split = s.layout === "gambar" || s.layout === "perbandingan";
  const width = split ? 424 : 920;
  const bodyLines = wrap(s.body, width, st.size);
  const secondarySize = s.layout === "penutup" ? st.size * .9 : st.size;
  const secondaryLines = wrap(s.secondary, s.layout === "perbandingan" ? 424 : 856, secondarySize);
  const blocks = s.body.split("\n").map((block) => wrap(block, 832, st.size));
  const listHeight = blocks.reduce((height, lines) => height + lines.length * st.size * 1.5 + 28, 0);
  const bodyBottom = bodyTop + (Math.max(1, bodyLines.length) - 1) * st.size * 1.5 + st.size * .25;
  const ctaY = Math.max(820, bodyBottom + 76);
  const secondaryBottom = s.layout === "penutup"
    ? ctaY + (secondaryLines.length - 1) * secondarySize * 1.5 + secondarySize * .25 + 28
    : bodyTop + (secondaryLines.length - 1) * st.size * 1.5 + st.size * .25;
  const contentBottom = s.layout === "daftar" || s.layout === "langkah"
    ? bodyTop + listHeight - 28 - st.size * 1.25
    : s.layout === "perbandingan" ? Math.max(bodyBottom, secondaryBottom)
    : s.layout === "gambar" ? Math.max(bodyBottom, bodyTop - 26 + 424)
    : s.layout === "penutup" && s.secondary ? Math.max(bodyBottom, secondaryBottom) : bodyBottom;
  return { st, hero, titleSize, titleY, titleLines, titleBottom, bodyTop, width,
    bodyLines, secondaryLines, secondarySize, blocks, ctaY, contentBottom,
    overflow: titleBottom > 940 || contentBottom > 940 };
}
export function slideWarnings(p: Project, s: Slide) {
  const result: string[] = [];
  if (metrics(p, s).overflow) result.push("Teks melebihi area slide. Ringkas isi atau bagi ke slide baru.");
  if (s.layout === "gambar" && !s.image) result.push("Layout ini membutuhkan gambar. Tambahkan URL gambar atau pilih layout lain.");
  return result;
}
export function SlideArt({ project: p, slide: s, index = 0, fonts = "", guides = false }: {
  project: Project; slide: Slide; index?: number; fonts?: string; guides?: boolean;
}) {
  const m = metrics(p, s);
  const { st, titleSize, titleY, titleLines, bodyTop, bodyLines, secondaryLines } = m;
  const center = st.align === "center";
  function lines(items: string[], left: number, width: number, y: number, size = st.size, weight = 400, color = st.color, lineHeight = 1.5) {
    const x = center ? left + width / 2 : left;
    return <text x={x} y={y} fontSize={size} fontWeight={weight} fill={color} textAnchor={center ? "middle" : "start"}>
      {items.map((line, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : size * lineHeight}>{line}</tspan>)}
    </text>;
  }
  let listY = bodyTop;
  return <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"
    className="slide-art" role="img" aria-label={s.title || `Slide ${index + 1}`}>
    {fonts && <defs><style>{fonts}</style></defs>}
    <rect width="1080" height="1080" fill={st.background} />
    <g fontFamily={st.font}>
      {!s.hideAccount && p.account && <text x="80" y="94" fontSize="24" fill={st.color}>{p.account}</text>}
      {s.layout === "sampul" && <rect x="80" y="154" width="112" height="8" rx="4" fill={st.accent} />}
      {lines(titleLines, 80, 920, titleY, titleSize, 700, st.color, 1.12)}
      {s.layout === "daftar" || s.layout === "langkah" ? m.blocks.map((block, i) => {
        const y = listY;
        listY += block.length * st.size * 1.5 + 28;
        return <g key={i}>
          {s.body.split("\n")[i] && (s.layout === "langkah"
            ? <><rect x="80" y={y - st.size * .85} width="52" height={st.size * 1.25} rx="8" fill={st.accent} opacity=".1" />
                <text x="106" y={y} fontSize={st.size * .8} fontWeight="700" textAnchor="middle" fill={st.accent}>{i + 1}</text></>
            : <circle cx="100" cy={y - st.size * .3} r="6" fill={st.accent} />)}
          {lines(block, 168, 832, y)}
        </g>;
      }) : lines(bodyLines, 80, m.width, bodyTop)}
      {s.layout === "perbandingan" && <>
        <line x1="540" y1={bodyTop - 28} x2="540" y2={Math.max(860, m.contentBottom)} stroke={st.color} opacity=".16" />
        <rect x="576" y={bodyTop - 60} width="64" height="5" rx="2.5" fill={st.accent} />
        {lines(secondaryLines, 576, 424, bodyTop)}
      </>}
      {s.layout === "penutup" && s.secondary && <>
        <rect x="80" y={m.ctaY - m.secondarySize - 16} width="920"
          height={Math.max(1, secondaryLines.length) * m.secondarySize * 1.5 + 32} rx="12" fill={st.accent} opacity=".09" />
        {lines(secondaryLines, 112, 856, m.ctaY, m.secondarySize, 700, st.color)}
      </>}
      {s.layout === "gambar" && (s.image && p.assets[s.image]
        ? <image href={imageSource(p.assets[s.image])} x="576" y={bodyTop - 26} width="424" height="424" preserveAspectRatio="xMidYMid meet" />
        : guides && <g>
            <rect x="576" y={bodyTop - 26} width="424" height="424" fill={st.color} opacity=".05" rx="12" />
            <text x="788" y={bodyTop + 190} textAnchor="middle" fontSize="24" fill={st.color} opacity=".7">Tambahkan gambar</text>
          </g>)}
      {guides && !s.title && <text x={center ? 540 : 80} y={titleY} textAnchor={center ? "middle" : "start"}
        fontSize={titleSize * .65} fill={st.color} opacity=".35">Tulis judul di sini</text>}
      <line x1="80" y1="974" x2="1000" y2="974" stroke={st.color} opacity=".14" />
      {!s.hideNumber && p.numbers && <>
        <rect x="80" y="974" width={920 * (index + 1) / p.slides.length} height="3" fill={st.accent} />
        <text x="1000" y="1022" textAnchor="end" fontSize="23" fill={st.color} opacity=".75">
          {String(index + 1).padStart(2, "0")} / {String(p.slides.length).padStart(2, "0")}
        </text>
      </>}
    </g>
  </svg>;
}
