// Local server for development and self-hosting: node --import tsx mcp/node.ts (PORT defaults to 3001).
import { createServer as createHttpServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { makeFetchHandler } from './http'

const widgetPath = fileURLToPath(new URL('../dist-mcp/mcp/widget.html', import.meta.url))
const handle = makeFetchHandler(readFileSync(widgetPath, 'utf8'))
const port = Number(process.env.PORT ?? 3001)

createHttpServer(async (req, res) => {
  try {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const request = new Request(`http://${req.headers.host ?? `localhost:${port}`}${req.url}`, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => (v == null ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]])),
      body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
    })
    const response = await handle(request)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk)
    res.end()
  } catch (e) {
    console.error(e)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
}).listen(port, () => console.log(`Floorimate MCP server on http://localhost:${port}/mcp`))
