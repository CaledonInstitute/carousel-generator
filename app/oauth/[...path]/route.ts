import { oauthHandler } from "../../server/oauth";
import { database } from "../../server/runtime";
const handle = (req: Request) => oauthHandler(database(), req);
export { handle as GET, handle as POST };
