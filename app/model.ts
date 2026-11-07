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
  version: 1;
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
  accent: "#2855D9",
  background: "#FFFFFF",
  color: "#17191D",
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
    version: 1,
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
  p.account = "@ruangslide";
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
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  return (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("ruang-slide", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("projects", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      dbPromise = undefined;
      reject(r.error);
    };
  }));
}
async function operation<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", mode);
    const request = run(tx.objectStore("projects"));
    tx.oncomplete = () => resolve(request.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const saveProject = (p: Project) =>
  operation<void>("readwrite", (s) => s.put(p));
export const getProject = (id: string) =>
  operation<Project | undefined>("readonly", (s) => s.get(id));
export const listProjects = () =>
  operation<Project[]>("readonly", (s) => s.getAll());
export const deleteProject = (id: string) =>
  operation<void>("readwrite", (s) => s.delete(id));
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
    p.version !== 1 ||
    typeof p.id !== "string" ||
    typeof p.title !== "string" ||
    typeof p.account !== "string" ||
    typeof p.numbers !== "boolean" ||
    !styleValid(p.style) ||
    !Array.isArray(p.slides) ||
    p.slides.length < 5 ||
    p.slides.length > 20 ||
    !p.assets ||
    typeof p.assets !== "object" ||
    Object.values(p.assets).some(
      (a) =>
        typeof a !== "string" ||
        !/^data:image\/(png|jpeg|webp);base64,/.test(a),
    )
  )
    throw Error("File proyek tidak valid atau versinya belum didukung.");
  if (
    new Set(p.slides.map((s) => s.id)).size !== p.slides.length ||
    p.slides.some(
      (s) =>
        !s ||
        typeof s.id !== "string" ||
        !Object.hasOwn(layouts, s.layout) ||
        ["title", "body", "secondary"].some(
          (k) => typeof s[k as keyof Slide] !== "string",
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
        (s.image && !p.assets[s.image]),
    )
  )
    throw Error("Isi atau pengaturan slide dalam file tidak valid.");
}
