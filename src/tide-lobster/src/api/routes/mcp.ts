/** MCP Servers（占位）*/
import { Hono } from 'hono';
export const mcpRouter = new Hono();
mcpRouter.get('/api/mcp/servers', (c) => c.json({ servers: [] }));
