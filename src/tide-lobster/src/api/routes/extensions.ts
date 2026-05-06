import { Hono } from 'hono';
import { extensionCatalog, ExtensionCatalogError } from '../../extensions/catalog.js';

export const extensionsRouter = new Hono();

function toErrorResponse(error: unknown): Response | null {
  if (error instanceof ExtensionCatalogError) {
    return Response.json({ detail: error.message }, { status: error.status });
  }
  return null;
}

extensionsRouter.get('/api/extensions', async (c) => {
  const extensions = await extensionCatalog.listExtensions();
  return c.json({ extensions, total: extensions.length });
});

extensionsRouter.get('/api/extensions/:id', async (c) => {
  try {
    const extension = await extensionCatalog.getExtension(c.req.param('id'));
    if (!extension) return c.json({ detail: 'extension not found' }, 404);
    return c.json({ extension });
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) return response;
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});

extensionsRouter.post('/api/extensions/:id/enable', async (c) => {
  try {
    const extension = await extensionCatalog.setEnabled(c.req.param('id'), true);
    return c.json({ extension });
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) return response;
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 400);
  }
});

extensionsRouter.post('/api/extensions/:id/disable', async (c) => {
  try {
    const extension = await extensionCatalog.setEnabled(c.req.param('id'), false);
    return c.json({ extension });
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) return response;
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 400);
  }
});

extensionsRouter.post('/api/extensions/:id/reload', async (c) => {
  try {
    const extension = await extensionCatalog.reload(c.req.param('id'));
    return c.json({ extension });
  } catch (error) {
    const response = toErrorResponse(error);
    if (response) return response;
    return c.json({ detail: error instanceof Error ? error.message : String(error) }, 400);
  }
});
