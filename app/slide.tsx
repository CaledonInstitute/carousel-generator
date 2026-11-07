import React from "react";
import { effectiveStyle, type Project, type Slide } from "./model";

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
export function metrics(p: Project, s: Slide) {
  const st = effectiveStyle(p, s),
    hero = s.layout === "sampul" || s.layout === "penutup",
    titleSize = hero ? st.size * 2.65 : st.size * 1.8;
  const titleLines = wrap(s.title, 900, titleSize);
  const titleBottom =
    (hero ? 260 : 180) + Math.max(1, titleLines.length) * titleSize * 1.16;
  const bodyTop = hero
    ? Math.max(690, titleBottom + 45)
    : Math.max(380, titleBottom + 58);
  const width =
    s.layout === "gambar" || s.layout === "perbandingan" ? 410 : 880;
  const bodyLines = wrap(s.body, width, st.size);
  const secondaryLines = wrap(
    s.secondary,
    s.layout === "perbandingan" ? 410 : 880,
    st.size,
  );
  const listHeight = s.body
    .split("\n")
    .reduce(
      (height, block) =>
        height +
        wrap(block, 820, st.size).length * st.size * 1.55 +
        st.size * 0.65,
      0,
    );
  const contentBottom =
    bodyTop +
    (s.layout === "daftar" || s.layout === "langkah"
      ? listHeight
      : Math.max(
          bodyLines.length,
          s.layout === "perbandingan" ? secondaryLines.length : 0,
        ) *
        st.size *
        1.55);
  return {
    st,
    hero,
    titleSize,
    titleLines,
    titleBottom,
    bodyTop,
    width,
    bodyLines,
    secondaryLines,
    overflow:
      titleBottom > 920 ||
      contentBottom > 930 ||
      (s.layout === "penutup" && secondaryLines.length > 1),
  };
}
export function slideWarnings(p: Project, s: Slide) {
  const result: string[] = [];
  if (metrics(p, s).overflow)
    result.push(
      "Teks melebihi area slide. Ringkas isi atau bagi ke slide baru.",
    );
  if (s.layout === "gambar" && !s.image)
    result.push(
      "Layout ini membutuhkan gambar. Unggah gambar atau pilih layout lain.",
    );
  return result;
}
export function SlideArt({
  project: p,
  slide: s,
  index = 0,
  fonts = "",
  guides = false,
}: {
  project: Project;
  slide: Slide;
  index?: number;
  fonts?: string;
  guides?: boolean;
}) {
  const {
    st,
    hero,
    titleSize,
    titleLines,
    bodyTop,
    width,
    bodyLines,
    secondaryLines,
  } = metrics(p, s);
  const center = st.align === "center";
  function lines(
    items: string[],
    x: number,
    y: number,
    size: number,
    weight = 400,
    color = st.color,
    lineHeight = 1.55,
  ) {
    return (
      <text
        x={x}
        y={y}
        fontSize={size}
        fontWeight={weight}
        fill={color}
        textAnchor={center ? "middle" : "start"}
      >
        {items.map((line, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : size * lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    );
  }
  const imageY = Math.min(bodyTop - 35, 520),
    imageH = 400;
  const scale =
    Math.max(414 / (s.imageWidth || 414), 400 / (s.imageHeight || 400)) *
    s.zoom;
  const imageWidth = (s.imageWidth || 414) * scale,
    imageHeight = (s.imageHeight || 400) * scale;
  const blocks = s.body.split("\n");
  let listY = bodyTop;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1080"
      height="1080"
      viewBox="0 0 1080 1080"
      className="slide-art"
      role="img"
      aria-label={s.title || `Slide ${index + 1}`}
    >
      {fonts && (
        <defs>
          <style>{fonts}</style>
        </defs>
      )}
      <rect width="1080" height="1080" fill={st.background} />
      <g fontFamily={st.font}>
        {!s.hideAccount && p.account && (
          <text x="86" y="88" fontSize="23" fill={st.color} opacity=".7">
            {p.account}
          </text>
        )}
        {s.layout === "sampul" && (
          <>
            <rect
              x="86"
              y="151"
              width="62"
              height="7"
              rx="3.5"
              fill={st.accent}
            />
            <circle cx="940" cy="151" r="8" fill={st.accent} />
          </>
        )}
        {lines(
          titleLines,
          center ? 540 : 86,
          hero ? 260 : 180,
          titleSize,
          700,
          st.color,
          1.16,
        )}
        {s.layout === "daftar" || s.layout === "langkah" ? (
          <>
            {blocks.map((block, i) => {
              const y = listY,
                wrapped = wrap(block, 820, st.size);
              listY += wrapped.length * st.size * 1.55 + st.size * 0.65;
              return (
                <g key={i}>
                  {block && (
                    <text
                      x="86"
                      y={y}
                      fontSize={st.size * 0.78}
                      fill={st.accent}
                      fontWeight="700"
                    >
                      {s.layout === "langkah"
                        ? String(i + 1).padStart(2, "0")
                        : "•"}
                    </text>
                  )}
                  {lines(wrapped, center ? 560 : 148, y, st.size)}
                </g>
              );
            })}
          </>
        ) : (
          lines(
            bodyLines,
            center
              ? s.layout === "perbandingan"
                ? 290
                : s.layout === "gambar"
                  ? 290
                  : 540
              : 86,
            bodyTop,
            st.size,
          )
        )}
        {s.layout === "perbandingan" && (
          <>
            <line
              x1="540"
              y1={bodyTop - 35}
              x2="540"
              y2="895"
              stroke="#DDE1E7"
            />
            {lines(
              secondaryLines,
              center ? 790 : 594,
              bodyTop,
              st.size,
              400,
              st.accent,
            )}
          </>
        )}
        {s.layout === "penutup" &&
          lines(
            secondaryLines,
            center ? 540 : 86,
            880,
            st.size * 0.85,
            700,
            st.accent,
          )}
        {s.layout === "gambar" &&
          (s.image && p.assets[s.image] ? (
            <svg
              x="580"
              y={imageY}
              width="414"
              height={imageH}
              viewBox="0 0 414 400"
              overflow="hidden"
            >
              <image
                href={p.assets[s.image]}
                x={((414 - imageWidth) * s.x) / 100}
                y={((400 - imageHeight) * s.y) / 100}
                width={imageWidth}
                height={imageHeight}
                preserveAspectRatio="none"
              />
            </svg>
          ) : (
            guides && (
              <g>
                <rect
                  x="580"
                  y={imageY}
                  width="414"
                  height={imageH}
                  fill="#F5F6F8"
                  rx="4"
                />
                <text
                  x="787"
                  y={imageY + 210}
                  textAnchor="middle"
                  fontSize="24"
                  fill="#626974"
                >
                  Tambahkan gambar
                </text>
              </g>
            )
          ))}
        {guides && !s.title && (
          <text
            x="86"
            y={hero ? 260 : 180}
            fontSize={titleSize * 0.65}
            fill="#B7BDC7"
          >
            Tulis judul di sini
          </text>
        )}
        <line
          x1="86"
          y1="975"
          x2="994"
          y2="975"
          stroke={st.color}
          opacity=".12"
        />
        {!s.hideNumber && p.numbers && (
          <text
            x="994"
            y="1020"
            textAnchor="end"
            fontSize="23"
            fill={st.color}
            opacity=".6"
          >
            {String(index + 1).padStart(2, "0")} /{" "}
            {String(p.slides.length).padStart(2, "0")}
          </text>
        )}
      </g>
    </svg>
  );
}
