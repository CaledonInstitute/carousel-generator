import { env } from "cloudflare:workers";
import type { DB } from "./core";
import type { InstagramEnv } from "./instagram-common";
export function instagramEnvironment(): InstagramEnv {
  return env as unknown as InstagramEnv;
}
export function database(): DB {
  return (env as unknown as { DB: DB }).DB;
}
