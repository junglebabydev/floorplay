// Web-standard request routing shared by the Cloudflare Worker and the local Node server.
import { createMcpHandler } from '@modelcontextprotocol/server'
import { createServer, VERSION } from './server'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

const INFO = (origin: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Floorplay MCP</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#1f1d1a;background:#f6f5f2}code{background:#fff;border:1px solid #0001;border-radius:6px;padding:2px 6px}</style>
<h1>Floorplay for ChatGPT and Claude</h1>
<p>This is the Floorplay MCP server (v${VERSION}). Add it as a connector to see floor plans as furnished 3D homes inside the chat.</p>
<p>Connector URL: <code>${origin}/mcp</code></p>
<p><a href="https://junglebabydev.github.io/floorplay/">Floorplay web app</a> · <a href="https://github.com/junglebabydev/floorplay">Source</a></p>`

export function makeFetchHandler(widgetHtml: string) {
  const mcp = createMcpHandler(() => createServer(widgetHtml), { onerror: (e) => console.error('[mcp]', e.message) })
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (url.pathname === '/mcp' || url.pathname === '/mcp/') return withCors(await mcp.fetch(request))
    if (url.pathname === '/' && request.method === 'GET') return new Response(INFO(url.origin), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    if (url.pathname === '/health') return Response.json({ ok: true, version: VERSION })
    return new Response('Not found', { status: 404 })
  }
}
