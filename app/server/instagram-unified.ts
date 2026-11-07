import { graph, metaRequest, origin, type InstagramEnv } from "./instagram-common";

export class UnifiedLoginError extends Error {
  constructor(public readonly result: "permissions" | "accounts") {
    super(result);
  }
}

// Meta's Unified Login returns a portfolio-owned system user, not an IG user.
export async function unifiedLogin(env: InstagramEnv, code: string) {
  const exchange = new URL(`https://graph.facebook.com/${env.INSTAGRAM_API_VERSION}/oauth/access_token`);
  exchange.search = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID!,
    client_secret: env.INSTAGRAM_APP_SECRET!,
    redirect_uri: `${origin(env)}/api/instagram/callback`,
    code,
  }).toString();
  const token = await metaRequest<{ access_token: string }>(exchange.href);
  if (!token.access_token) throw Error("Missing token");

  const debug = new URL(`https://graph.facebook.com/${env.INSTAGRAM_API_VERSION}/debug_token`);
  debug.searchParams.set("input_token", token.access_token);
  const { data } = await metaRequest<{
    data: {
      is_valid: boolean;
      app_id: string;
      scopes?: string[];
      expires_at?: number;
      data_access_expires_at?: number;
    };
  }>(debug.href, {
    headers: { Authorization: `Bearer ${env.INSTAGRAM_APP_ID}|${env.INSTAGRAM_APP_SECRET}` },
  });
  if (!data?.is_valid || String(data.app_id) !== env.INSTAGRAM_APP_ID)
    throw Error("Invalid token");
  if (!["instagram_basic", "instagram_content_publish"].every(p => data.scopes?.includes(p)))
    throw new UnifiedLoginError("permissions");
  // Zero is Meta's explicit no-expiration value. Unknown expiry is not accepted.
  if (![data.expires_at, data.data_access_expires_at ?? 0].every(v =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 8640000000000))
    throw Error("Missing expiry");
  const expirations = [data.expires_at!, data.data_access_expires_at ?? 0].filter(v => v > 0);
  const expires = expirations.length ? Math.min(...expirations) * 1000 : 0;
  if (expires && expires <= Date.now()) throw Error("Expired token");

  const business = await graph<{ client_business_id: string }>(env, token.access_token, "me", {
    fields: "client_business_id",
  });
  const accounts = await graph<{
    data: { id: string; username: string }[];
    paging?: { next?: string };
  }>(env, token.access_token, "me/assigned_instagram_accounts", {
    fields: "id,username", limit: "2",
  });
  // Pilot has one destination: never guess when multiple assets are shared.
  if (!accounts.data || accounts.data.length !== 1 || accounts.paging?.next)
    throw new UnifiedLoginError("accounts");
  const account = accounts.data[0];
  if (!business.client_business_id || !account.id || !account.username)
    throw Error("Missing account");
  return {
    access_token: token.access_token,
    account_id: String(account.id),
    username: account.username,
    expires,
    client_business_id: String(business.client_business_id),
  };
}
