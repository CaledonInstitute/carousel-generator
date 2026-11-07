import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
// Vite omits custom builds in its deployment output. Preserve one-command rebuilds
// even when Wrangler follows .wrangler/deploy/config.json on subsequent deploys.
const path = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(await readFile(path, "utf8"));
config.build = {
  command: "npm run build",
  cwd: fileURLToPath(new URL("..", import.meta.url)),
};
await writeFile(path, JSON.stringify(config, null, 2) + "\n");
