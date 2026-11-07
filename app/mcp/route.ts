import { mcpHandler } from "../server/mcp";
import { database } from "../server/runtime";
const handle = (req: Request) => mcpHandler(database(), req);
export { handle as GET, handle as POST, handle as DELETE, handle as OPTIONS };
