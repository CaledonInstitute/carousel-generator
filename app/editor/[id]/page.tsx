import { Editor } from "../../studio";
import { protectPage } from "../../server/page-auth";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await protectPage(`/editor/${id}`);
  return <Editor />;
}
