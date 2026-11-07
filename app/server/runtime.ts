import { env } from "cloudflare:workers";
import type { DB } from "./core";
export function database(): DB {
  return (env as unknown as { DB: DB }).DB;
}
