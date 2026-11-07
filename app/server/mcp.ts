import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  type DB,
  ORIGIN,
  bearerUser,
  fail,
  guarded,
  HttpError,
  json,
  rateLimit,
} from "./core";
import {
  newProject,
  newSlide,
  normalizeProject,
  type Layout,
  type Project,
} from "../model";
import * as projects from "./projects";
const color = z.string().regex(/^#[\da-f]{6}$/i);
const style = z.object({
  font: z.enum(["Manrope", "DM Sans", "IBM Plex Sans"]),
  size: z.number().min(22).max(80),
  accent: color,
  background: color,
  color,
  align: z.enum(["left", "center"]),
});
const commonSlide = {
  id: z.string().max(100).optional(),
  image: z
    .string()
    .optional()
    .describe(
      "Key in assets; public HTTPS PNG, JPEG or WebP, any aspect ratio, at most 12 MB",
    ),
  hideAccount: z.boolean().default(false),
  hideNumber: z.boolean().default(false),
  style: style.partial().default({}),
  zoom: z.number().min(1).max(3).default(1),
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
};
const slide = z.object({
  ...commonSlide,
  layout: z.enum(["teks", "gambar"]),
  text: z
    .string()
    .max(30004)
    .describe("Paragraphs separated by newlines; **bold** supported"),
});
const legacySlide = z.object({
  ...commonSlide,
  layout: z.enum([
    "sampul",
    "gambar",
    "daftar",
    "langkah",
    "perbandingan",
    "penutup",
  ]),
  title: z.string().max(10000),
  body: z.string().max(10000),
  secondary: z.string().max(10000).default(""),
});
const commonContent = {
  title: z.string().max(200),
  account: z.string().max(100).default(""),
  style: style.optional(),
  assets: z.record(z.string(), z.string().url()).default({}),
};
const content = z.union([
  z.object({
    ...commonContent,
    format: z.enum(["portrait", "square"]).default("portrait"),
    numbers: z.boolean().default(false),
    slides: z.array(slide).min(5).max(20),
  }),
  z
    .object({
      ...commonContent,
      numbers: z.boolean().default(true),
      slides: z.array(legacySlide).min(5).max(20),
    })
    .describe(
      "Compatibility input for older clients; prefer text and teks/gambar modes",
    ),
]);
function document(
  input: z.infer<typeof content>,
  id?: string,
  revision?: number,
): Project {
  const p = newProject();
  const legacy = !("format" in input);
  return normalizeProject({
    ...p,
    ...input,
    version: legacy ? 2 : 3,
    style: input.style ?? p.style,
    id: id ?? p.id,
    revision,
    slides: input.slides.map((s) => ({
      ...newSlide(s.layout as Layout),
      ...s,
      id: s.id ?? crypto.randomUUID(),
    })),
  });
}
export const mcpHandler = (db: DB, req: Request) =>
  guarded(async () => {
    if (req.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST,GET,DELETE,OPTIONS",
          "Access-Control-Allow-Headers":
            "Authorization,Content-Type,MCP-Protocol-Version,Mcp-Session-Id",
          "Access-Control-Expose-Headers": "WWW-Authenticate,Mcp-Session-Id",
        },
      });
    const origin = req.headers.get("origin");
    if (
      origin &&
      ![ORIGIN, "https://claude.ai", new URL(req.url).origin].includes(origin)
    )
      fail(403, "Origin MCP tidak diizinkan.");
    let owner: string;
    try {
      owner = await bearerUser(db, req);
    } catch (e) {
      if (!(e instanceof HttpError) || e.status !== 401) throw e;
      return json({ error: e.message }, 401, {
        "WWW-Authenticate": `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "WWW-Authenticate",
      });
    }
    await rateLimit(db, `mcp:${owner}`, 120, 60);
    const server = new McpServer(
      { name: "ruang-slide", version: "1.0.0" },
      {
        instructions:
          "Manage private Carousel Generator carousels. Projects have 5–20 slides. New projects use portrait 1080×1350; square 1080×1080 is also supported. Choose teks or gambar; write paragraphs in text with **bold**. Use get_project before update/delete and pass its revision. Images must be public HTTPS PNG/JPEG/WebP URLs, any aspect ratio, at most 12 MB. Edits are shared with the web editor. Deletion is permanent.",
      },
    );
    const result = async (run: () => Promise<unknown>) => {
      try {
        const value = await run();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(value) }],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                e instanceof HttpError
                  ? `${e.status}: ${e.message}`
                  : "Server gagal memproses proyek.",
            },
          ],
        };
      }
    };
    const link = (p: Project) => ({
      ...p,
      editorUrl: `${ORIGIN}/editor/${p.id}`,
    });
    server.registerTool(
      "list_projects",
      {
        description: "List your private carousel projects.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      () =>
        result(async () =>
          (await projects.list(db, owner)).map((p) => ({
            id: p.id,
            title: p.title,
            revision: p.revision,
            updated: p.updated,
            slides: p.slides.length,
            editorUrl: `${ORIGIN}/editor/${p.id}`,
          })),
        ),
    );
    server.registerTool(
      "get_project",
      {
        description:
          "Read all slides, style and image URLs, including revision required to update or delete.",
        inputSchema: { id: z.string() },
        annotations: { readOnlyHint: true },
      },
      ({ id }) => result(async () => link(await projects.get(db, owner, id))),
    );
    server.registerTool(
      "create_project",
      {
        description:
          "Create a carousel. Layout/style schemas are defined in this tool. Returns a project and editor URL.",
        inputSchema: { project: content },
        annotations: { destructiveHint: false },
      },
      ({ project }) =>
        result(async () =>
          link(await projects.save(db, owner, document(project), true)),
        ),
    );
    server.registerTool(
      "update_project",
      {
        description:
          "Replace project content using the revision from get_project. Keep slide IDs to preserve identity. A stale revision returns conflict; fetch again before editing.",
        inputSchema: {
          id: z.string(),
          revision: z.number().int().positive(),
          project: content,
        },
        annotations: { destructiveHint: true },
      },
      ({ id, revision, project }) =>
        result(async () =>
          link(await projects.save(db, owner, document(project, id, revision))),
        ),
    );
    server.registerTool(
      "delete_project",
      {
        description: "Permanently delete a project. Cannot be undone.",
        inputSchema: { id: z.string(), revision: z.number().int().positive() },
        annotations: { destructiveHint: true, idempotentHint: false },
      },
      ({ id, revision }) =>
        result(async () => {
          await projects.remove(db, owner, id, revision);
          return { deleted: true, id };
        }),
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 256 * 1024,
    });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(req);
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cache-Control", "no-store");
      return new Response(response.body, { status: response.status, headers });
    } finally {
      await server.close();
    }
  });
