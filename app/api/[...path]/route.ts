import { apiHandler } from "../../server/api";
import { database } from "../../server/runtime";
const handle = (req: Request) => apiHandler(database(), req);
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
