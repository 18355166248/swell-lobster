/** Memory（占位）*/
import { Hono } from "hono";
export const memoryRouter = new Hono();
memoryRouter.get("/api/memories", (c) => c.json({ memories: [] }));
