export type Layout =
  "sampul" | "gambar" | "daftar" | "langkah" | "perbandingan" | "penutup";
export const layouts: Record<Layout, string> = {
  sampul: "Sampul",
  gambar: "Teks & gambar",
  daftar: "Daftar",
  langkah: "Langkah",
  perbandingan: "Perbandingan",
  penutup: "Penutup",
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
  title: string;
  body: string;
  secondary: string;
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
  version: 2;
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
  font: "Manrope",
  size: 32,
  accent: "#315CDB",
  background: "#FFFFFF",
  color: "#202936",
  align: "left",
};
export function newSlide(layout: Layout = "gambar"): Slide {
  return {
    id: uid(),
    layout,
    title: "",
    body: "",
    secondary: "",
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
    version: 2,
    id: uid(),
    title: "Carousel tanpa judul",
    updated: Date.now(),
    account: "",
    numbers: true,
    style: { ...baseStyle },
    slides: ["sampul", "gambar", "daftar", "langkah", "penutup"].map((l) =>
      newSlide(l as Layout),
    ),
    assets: {},
  };
}
export function exampleProject(): Project {
  const p = newProject();
  p.title = "Cara menjelaskan ide yang rumit";
  p.account = "@carouselgenerator";
  const content: [Layout, string, string, string][] = [
    [
      "sampul",
      "Ide rumit.\nPenjelasan\nsederhana.",
      "Buat orang paham,\nbukan sekadar terkesan.",
      "",
    ],
    [
      "daftar",
      "Mulai dari yang\nsudah mereka tahu.",
      "Kenali siapa yang mendengarkan.\nHubungkan dengan pengalaman sehari-hari.\nGunakan satu contoh yang dekat.",
      "",
    ],
    [
      "perbandingan",
      "Sederhana bukan\nberarti dangkal.",
      "Terlalu rumit\n“Optimalkan alokasi sumber daya kognitif.”",
      "Lebih mudah\n“Fokus pada satu hal dulu.”",
    ],
    [
      "langkah",
      "Satu slide.\nSatu gagasan.",
      "Tentukan pesan utamanya.\nSingkirkan yang tidak mendukung.\nBeri ruang untuk mencerna.",
      "",
    ],
    [
      "penutup",
      "Ide yang baik\nlayak dipahami.",
      "Mulai dari satu gagasan.\nJelaskan dengan caramu.",
      "Simpan untuk nanti.",
    ],
  ];
  p.slides = content.map(([layout, title, body, secondary]) => ({
    ...newSlide(layout),
    title,
    body,
    secondary,
  }));
  return p;
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
export const getProject = (id: string) => api<Project>(`/api/projects/${id}`);
export const listProjects = () => api<Project[]>("/api/projects");
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
    (partial ||
      ["font", "size", "accent", "background", "color", "align"].every(
        (k) => k in s,
      )) &&
    Object.entries(s).every(([k, v]) =>
      k === "font"
        ? ["Manrope", "DM Sans", "IBM Plex Sans"].includes(v as string)
        : k === "size"
          ? typeof v === "number" && v >= 22 && v <= 46
          : ["accent", "background", "color"].includes(k)
            ? typeof v === "string" && /^#[\da-f]{6}$/i.test(v)
            : k === "align" && ["left", "center"].includes(v as string),
    );
  if (
    !p ||
    p.version !== 2 ||
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
        ["title", "body", "secondary"].some(
          (k) =>
            typeof s[k as keyof Slide] !== "string" ||
            String(s[k as keyof Slide]).length > 10000,
        ) ||
        !styleValid(s.style, true) ||
        typeof s.hideAccount !== "boolean" ||
        typeof s.hideNumber !== "boolean" ||
        ![s.zoom, s.x, s.y].every(Number.isFinite) ||
        s.zoom !== 1 ||
        s.x !== 50 ||
        s.y !== 50 ||
        (s.image !== undefined &&
          (typeof s.image !== "string" || !Object.hasOwn(p.assets, s.image))),
    )
  )
    throw Error("Isi atau pengaturan slide tidak valid.");
}
