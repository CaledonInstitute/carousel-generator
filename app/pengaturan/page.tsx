import { Settings } from "../settings";
import { protectPage } from "../server/page-auth";
export default async function Page() {
  const user = await protectPage("/pengaturan");
  return <Settings username={user.username} />;
}
