import { metadata } from "../../server/oauth";
export const GET = (req: Request) => metadata(new URL(req.url).pathname);
