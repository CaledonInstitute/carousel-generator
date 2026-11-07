import React, { useId } from "react";
import {
  dimensions,
  effectiveStyle,
  imageSource,
  type Project,
  type Slide,
} from "./model";
import fontMetrics from "./font-metrics.json";

type Run = { text: string; bold: boolean };
type TextLine = { runs: Run[]; gap: boolean };
export function richText(text: string): Run[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => {
      const bold = /^\*\*[^*]+\*\*$/.test(part);
      return { text: bold ? part.slice(2, -2) : part, bold };
    });
}
function glyphWidth(char: string, size: number, font: string, bold: boolean) {
  const family =
    (fontMetrics as Record<string, Record<string, Record<string, number>>>)[
      font
    ] ?? fontMetrics["IBM Plex Sans"];
  return (family[bold ? "700" : "400"][char] ?? 1) * size * 1.015;
}
function textLines(
  text: string,
  width: number,
  size: number,
  font: string,
): TextLine[] {
  const result: TextLine[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      result.push({ runs: [], gap: true });
      continue;
    }
    const chars = richText(paragraph).flatMap((run) =>
      Array.from(run.text).map((char) => ({ char, bold: run.bold })),
    );
    let line: typeof chars = [],
      lineWidth = 0;
    const emit = () => {
      while (line.at(-1)?.char === " ") line.pop();
      const runs: Run[] = [];
      for (const item of line) {
        if (runs.at(-1)?.bold === item.bold)
          runs[runs.length - 1].text += item.char;
        else runs.push({ text: item.char, bold: item.bold });
      }
      if (runs.length) result.push({ runs, gap: false });
    };
    for (const item of chars) {
      const w = glyphWidth(item.char, size, font, item.bold);
      while (lineWidth + w > width && line.length) {
        const space = line.map((c) => c.char).lastIndexOf(" ");
        if (space > 0) {
          const carry = line.slice(space + 1);
          line = line.slice(0, space);
          emit();
          line = carry;
        } else {
          emit();
          line = [];
        }
        lineWidth = line.reduce(
          (n, c) => n + glyphWidth(c.char, size, font, c.bold),
          0,
        );
      }
      if (item.char !== " " || line.length) {
        line.push(item);
        lineWidth += w;
      }
    }
    emit();
  }
  return result;
}
export function wrap(text: string, width: number, size: number) {
  return textLines(text, width, size, "IBM Plex Sans").map((line) =>
    line.runs.map((run) => run.text).join(""),
  );
}
export function metrics(p: Project, s: Slide) {
  const st = effectiveStyle(p, s),
    { height } = dimensions(p);
  const top = !s.hideAccount && p.account ? 132 : 72;
  const limit = s.layout === "gambar" ? height * 0.65 - 40 : height - 72;
  const layout = (size: number) => {
    const wrapped = textLines(s.text, 936, size, st.font);
    let y = top;
    const lines = wrapped.map((line) => {
      if (line.gap) {
        y += size * 0.65;
        return { ...line, y };
      }
      const baseline = y + size;
      y += size * 1.3;
      return { ...line, y: baseline };
    });
    return { lines, bottom: wrapped.length ? y - size * 0.3 : top };
  };
  let size = Math.max(st.size, 80),
    placed = layout(size);
  while (size > st.size && placed.bottom > limit) {
    size = Math.max(st.size, size - 1);
    placed = layout(size);
  }
  const imageY = Math.min(height * 0.65, placed.bottom + 40);
  return {
    st,
    size,
    height,
    top,
    lines: placed.lines,
    contentBottom: placed.bottom,
    imageY,
    imageHeight: height - imageY,
    overflow: placed.bottom > limit,
  };
}
export function slideWarnings(p: Project, s: Slide) {
  const warnings: string[] = [];
  if (metrics(p, s).overflow)
    warnings.push(
      "Teks melebihi area slide. Ringkas isi atau bagi ke slide baru.",
    );
  if (s.layout === "gambar" && !s.image)
    warnings.push("Tambahkan URL gambar atau pilih mode Teks.");
  return warnings;
}
export function SlideArt({
  project: p,
  slide: s,
  index = 0,
  fonts = "",
  guides = false,
  publicImages = false,
}: {
  project: Project;
  slide: Slide;
  index?: number;
  fonts?: string;
  guides?: boolean;
  publicImages?: boolean;
}) {
  const m = metrics(p, s),
    clip = `image-${useId().replace(/:/g, "")}`;
  const center = m.st.align === "center";
  const iw = s.imageWidth || 1080,
    ih = s.imageHeight || 1080;
  const scale = Math.max(1080 / iw, m.imageHeight / ih) * s.zoom;
  const width = iw * scale,
    height = ih * scale;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1080"
      height={m.height}
      viewBox={`0 0 1080 ${m.height}`}
      className="slide-art"
      role="img"
      aria-label={
        s.text.replaceAll("**", "").slice(0, 120) || `Slide ${index + 1}`
      }
    >
      <defs>
        {fonts && <style>{fonts}</style>}
        <clipPath id={clip}>
          <rect x="0" y={m.imageY} width="1080" height={m.imageHeight} />
        </clipPath>
      </defs>
      <rect width="1080" height={m.height} fill={m.st.background} />
      <g fontFamily={m.st.font} fill={m.st.color}>
        {!s.hideAccount && p.account && (
          <text x="72" y="92" fontSize="28" fontWeight="400">
            {p.account}
          </text>
        )}
        {m.lines
          .filter((line) => !line.gap)
          .map((line, i) => (
            <text
              key={i}
              x={center ? 540 : 72}
              y={line.y}
              fontSize={m.size}
              textAnchor={center ? "middle" : "start"}
              style={{ fontKerning: "none" }}
              xmlSpace="preserve"
            >
              {line.runs.map((run, j) => (
                <tspan key={j} fontWeight={run.bold ? 700 : 400}>
                  {run.text}
                </tspan>
              ))}
            </text>
          ))}
        {guides && !s.text && (
          <text x="72" y={m.top + 48} fontSize="48" opacity=".3">
            Tulis teks slide di sini
          </text>
        )}
        {s.layout === "gambar" &&
          (s.image && p.assets[s.image] ? (
            <g clipPath={`url(#${clip})`}>
              <image
                href={
                  publicImages
                    ? p.assets[s.image]
                    : imageSource(p.assets[s.image])
                }
                x={((1080 - width) * s.x) / 100}
                y={m.imageY + ((m.imageHeight - height) * s.y) / 100}
                width={width}
                height={height}
                preserveAspectRatio="none"
              />
            </g>
          ) : (
            guides && (
              <g>
                <rect
                  y={m.imageY}
                  width="1080"
                  height={m.imageHeight}
                  fill="#F5F7FA"
                />
                <text
                  x="540"
                  y={m.imageY + m.imageHeight / 2}
                  textAnchor="middle"
                  fontSize="30"
                  fill="#596273"
                >
                  Tambahkan gambar
                </text>
              </g>
            )
          ))}
        {!s.hideNumber && p.numbers && (
          <g>
            <rect
              x="918"
              y={m.height - 64}
              width="126"
              height="40"
              rx="4"
              fill={m.st.background}
            />
            <text x="1020" y={m.height - 36} fontSize="24" textAnchor="end">
              {index + 1} / {p.slides.length}
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}
