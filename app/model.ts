export type Layout = "teks" | "gambar";
export const layouts: Record<Layout, string> = {
  teks: "Teks",
  gambar: "Teks + gambar",
};
export type Style = {
  font: string;
  size: number;
  accent: string;
  background: string;
  color: string;
  align: "left" | "center";
};
export type Slide = {
  id: string;
  layout: Layout;
  text: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  zoom: number;
  x: number;
  y: number;
  hideAccount: boolean;
  hideNumber: boolean;
  style: Partial<Style>;
};
export type Project = {
  version: 3;
  format: "portrait" | "square";
  revision?: number;
  id: string;
  title: string;
  updated: number;
  account: string;
  numbers: boolean;
  style: Style;
  slides: Slide[];
  assets: Record<string, string>;
};
export const uid = () => crypto.randomUUID();
export const baseStyle: Style = {
  font: "IBM Plex Sans",
  size: 48,
  accent: "#315CDB",
  background: "#FFFFFF",
  color: "#000000",
  align: "left",
};
export const dimensions = (p: Project) => ({
  width: 1080,
  height: p.format === "portrait" ? 1350 : 1080,
});
export function newSlide(layout: Layout = "teks"): Slide {
  return {
    id: uid(),
    layout,
    text: "",
    zoom: 1,
    x: 50,
    y: 50,
    hideAccount: false,
    hideNumber: false,
    style: {},
  };
}
export function newProject(): Project {
  return {
    version: 3,
    format: "portrait",
    id: uid(),
    title: "Carousel tanpa judul",
    updated: Date.now(),
    account: "",
    numbers: false,
    style: { ...baseStyle },
    slides: Array.from({ length: 5 }, () => newSlide()),
    assets: {},
  };
}
export function exampleProject(): Project {
  const p = newProject();
  p.title = "Cara menjelaskan ide yang rumit";
  p.account = "@carouselgenerator";
  p.assets.conversation =
    "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&q=85";
  const texts = [
    "Ide yang rumit bisa dijelaskan dengan sederhana.\n\nMulai dari hal yang dekat dengan kehidupan pembacamu.",
    "Sebelum menjelaskan, **kenali siapa yang mendengarkan.**\n\nApa yang sudah mereka tahu? Pengalaman apa yang bisa menjadi jembatan menuju idemu?",
    "Sederhana bukan berarti dangkal.\n\nDaripada menggunakan istilah yang sulit, coba katakan **fokus pada satu hal dulu.** Pesannya sama, lebih mudah dipahami.",
    "**Satu slide, satu gagasan.**\n\nTentukan pesan utamanya. Tambahkan contoh yang dekat, lalu singkirkan kalimat yang tidak membantu pembaca memahaminya.",
    "Ide yang baik layak dipahami.\n\nPilih satu gagasan yang ingin kamu bagikan hari ini. Jelaskan dengan bahasamu sendiri, seolah kamu sedang bercerita kepada teman.",
  ];
  p.slides = texts.map((text, i) => ({
    ...newSlide(i === 0 || i === 3 ? "gambar" : "teks"),
    text,
    ...(i === 0 || i === 3
      ? { image: "conversation", imageWidth: 1600, imageHeight: 1067 }
      : {}),
  }));
  return p;
}
const legacyLayouts = [
  "sampul",
  "gambar",
  "daftar",
  "langkah",
  "perbandingan",
  "penutup",
];
export function normalizeProject(value: unknown): Project {
  const p = structuredClone(value) as any;
  if (p?.version !== 2) return p;
  if (
    !Array.isArray(p.slides) ||
    p.slides.some(
      (s: any) =>
        !s ||
        !legacyLayouts.includes(s.layout) ||
        ["title", "body", "secondary"].some((k) => typeof s[k] !== "string"),
    )
  )
    throw Error("Data proyek lama tidak valid.");
  return {
    ...p,
    version: 3,
    format: "square",
    slides: p.slides.map((s: any) => {
      const { title, body, secondary, ...rest } = s;
      return {
        ...rest,
        layout: s.layout === "gambar" ? "gambar" : "teks",
        text: [title, body, secondary].filter(Boolean).join("\n\n"),
      };
    }),
  };
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const value = (await response.json()) as any;
  if (!response.ok) {
    if (
      response.status === 401 &&
      !path.startsWith("/api/auth/") &&
      typeof window !== "undefined"
    )
      window.location.assign(
        `/masuk?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
    throw new ApiError(
      response.status,
      value.error || "Permintaan gagal. Coba lagi.",
    );
  }
  return value as T;
}
export async function saveProject(p: Project): Promise<Project> {
  const saved = await api<Project>(
    p.revision ? `/api/projects/${p.id}` : "/api/projects",
    { method: p.revision ? "PUT" : "POST", body: JSON.stringify(p) },
  );
  p.id = saved.id;
  p.revision = saved.revision;
  p.updated = saved.updated;
  return saved;
}
export const getProject = (id: string) =>
  api<unknown>(`/api/projects/${id}`).then(normalizeProject);
export const listProjects = () =>
  api<unknown[]>("/api/projects").then((items) => items.map(normalizeProject));
export const deleteProject = (id: string, revision: number) =>
  api<{ ok: boolean }>(`/api/projects/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ revision }),
  });
export const imageSource = (url: string) =>
  url.startsWith("data:") ? url : `/api/images?url=${encodeURIComponent(url)}`;
export function effectiveStyle(p: Project, s: Slide): Style {
  return { ...p.style, ...s.style };
}
export function validateProject(value: unknown): asserts value is Project {
  const p = value as Project;
  const styleValid = (s: Partial<Style>, partial = false) =>
    s &&
    typeof s === "object" &&
    !Array.isArray(s) &&
    (partial ||
      ["font", "size", "accent", "background", "color", "align"].every(
        (k) => k in s,
      )) &&
    Object.entries(s).every(([k, v]) =>
      k === "font"
        ? ["Manrope", "DM Sans", "IBM Plex Sans"].includes(v as string)
        : k === "size"
          ? typeof v === "number" && v >= 22 && v <= 80
          : ["accent", "background", "color"].includes(k)
            ? typeof v === "string" && /^#[\da-f]{6}$/i.test(v)
            : k === "align" && ["left", "center"].includes(v as string),
    );
  if (
    !p ||
    p.version !== 3 ||
    !["portrait", "square"].includes(p.format) ||
    typeof p.id !== "string" ||
    p.id.length > 100 ||
    typeof p.title !== "string" ||
    p.title.length > 200 ||
    typeof p.account !== "string" ||
    p.account.length > 100 ||
    typeof p.numbers !== "boolean" ||
    !styleValid(p.style) ||
    typeof p.updated !== "number" ||
    !Number.isFinite(p.updated) ||
    !Array.isArray(p.slides) ||
    p.slides.length < 5 ||
    p.slides.length > 20 ||
    !p.assets ||
    typeof p.assets !== "object" ||
    Array.isArray(p.assets) ||
    Object.keys(p.assets).length > 20 ||
    Object.values(p.assets).some(
      (a) => typeof a !== "string" || !/^https:\/\//.test(a) || a.length > 2048,
    )
  )
    throw Error("Data proyek tidak valid atau versinya belum didukung.");
  if (
    new Set(p.slides.map((s) => s?.id)).size !== p.slides.length ||
    p.slides.some(
      (s) =>
        !s ||
        typeof s.id !== "string" ||
        s.id.length > 100 ||
        !Object.hasOwn(layouts, s.layout) ||
        ["text"].some(
          (k) =>
            typeof s[k as keyof Slide] !== "string" ||
            String(s[k as keyof Slide]).length > 30004,
        ) ||
        !styleValid(s.style, true) ||
        typeof s.hideAccount !== "boolean" ||
        typeof s.hideNumber !== "boolean" ||
        ![s.zoom, s.x, s.y].every(Number.isFinite) ||
        s.zoom < 1 ||
        s.zoom > 3 ||
        s.x < 0 ||
        s.x > 100 ||
        s.y < 0 ||
        s.y > 100 ||
        (s.image !== undefined &&
          (typeof s.image !== "string" || !Object.hasOwn(p.assets, s.image))),
    )
  )
    throw Error("Isi atau pengaturan slide tidak valid.");
}
