import { Settings } from "../account";
import { protectPage } from "../server/page-auth";
export default async function Page() {
  await protectPage("/pengaturan");
  return <Settings />;
}
