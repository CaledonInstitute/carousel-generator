import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser, ORIGIN } from "./core";
import { database } from "./runtime";
export async function protectPage(next: string) {
  const h = await headers();
  const user = await sessionUser(
    database(),
    new Request(ORIGIN, { headers: { cookie: h.get("cookie") ?? "" } }),
  );
  if (!user) redirect(`/masuk?next=${encodeURIComponent(next)}`);
  return user;
}

export async function redirectAuthenticated(params: {
  next?: string;
  switch?: string;
}) {
  // Explicit account switching from OAuth consent must still show the login form.
  if (params.switch === "1") return;
  const h = await headers();
  const user = await sessionUser(
    database(),
    new Request(ORIGIN, { headers: { cookie: h.get("cookie") ?? "" } }),
  );
  if (user) {
    const next = params.next || "/proyek";
    redirect(
      next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
        ? next
        : "/proyek",
    );
  }
}
