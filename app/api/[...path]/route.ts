import { apiHandler } from "../../server/api";
import { database } from "../../server/runtime";
import { instagramEnvironment } from "../../server/runtime";
import { instagramHandler } from "../../server/instagram";
const handle = (req: Request) => {
  const path = new URL(req.url).pathname;
  return path.startsWith("/api/instagram/") ||
    /^\/api\/projects\/[^/]+\/instagram\/jobs$/.test(path)
    ? instagramHandler(instagramEnvironment(), req)
    : apiHandler(database(), req);
};
export {
  handle as GET,
  handle as HEAD,
  handle as POST,
  handle as PUT,
  handle as DELETE,
};
