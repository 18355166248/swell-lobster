/** Chat & Sessions（占位）*/
import { Hono } from "hono";
export const chatRouter = new Hono();
chatRouter.post("/api/chat", (c) => c.json({ error: "not implemented" }, 501));
chatRouter.get("/api/sessions", (c) => c.json({ sessions: [] }));
