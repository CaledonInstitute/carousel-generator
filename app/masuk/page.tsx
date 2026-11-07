import { AuthForm } from "../account";
import { redirectAuthenticated } from "../server/page-auth";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; switch?: string }>;
}) {
  await redirectAuthenticated(await searchParams);
  return <AuthForm />;
}
