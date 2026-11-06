// A minimal MCP Apps host for trying the Floorplay view locally, without ChatGPT or Claude.
// Run `pnpm mcp` in one terminal and `pnpm mcp:host` in another, then open the printed URL.
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { sampleProject } from '../../src/core/sample'

declare global { interface Window { __host: { openedLinks: string[]; contexts: string[]; ready: boolean; summary?: string } } }
window.__host = { openedLinks: [], contexts: [], ready: false }

const server = new URLSearchParams(location.search).get('server') ?? 'http://localhost:3001/mcp'
const status = document.getElementById('status')!
const chat = document.getElementById('chat')!

// Turn the sample home back into what a chat model would send: 0..1000 coordinates over a plan image.
function sampleArgs() {
  const p = sampleProject()
  const xs = p.walls.flatMap((w) => [w.a[0], w.b[0]]), ys = p.walls.flatMap((w) => [w.a[1], w.b[1]])
  const x0 = Math.min(...xs) - 0.5, y0 = Math.min(...ys) - 0.5, W = Math.max(...xs) - x0 + 0.5, H = Math.max(...ys) - y0 + 0.5
  const nx = (x: number) => ((x - x0) / W) * 1000, ny = (y: number) => ((y - y0) / H) * 1000
  const byId = new Map(p.walls.map((w) => [w.id, w]))
  return {
    name: 'Maplewoods 3-bed (sample)', image_width: Math.round(W * 50), image_height: Math.round(H * 50),
    walls: p.walls.map((w) => ({ x1: nx(w.a[0]), y1: ny(w.a[1]), x2: nx(w.b[0]), y2: ny(w.b[1]), exterior: w.thickness >= 0.2 })),
    openings: p.openings.map((o) => {
      const w = byId.get(o.wallId)!, L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), dx = (w.b[0] - w.a[0]) / L, dy = (w.b[1] - w.a[1]) / L
      const c = [w.a[0] + dx * o.t * L, w.a[1] + dy * o.t * L]
      return { kind: o.kind, x1: nx(c[0] - (dx * o.width) / 2), y1: ny(c[1] - (dy * o.width) / 2), x2: nx(c[0] + (dx * o.width) / 2), y2: ny(c[1] + (dy * o.width) / 2) }
    }),
    rooms: p.rooms.map((r) => ({ name: r.name, polygon: r.polygon.map(([x, y]) => [nx(x), ny(y)]), area_m2: r.labelledArea ?? null, floor: r.floor })),
    finishes: p.rooms.map((r) => ({ room: r.name, floor: r.floor, floor_color: r.floorColor, wall_color: '#f1efea' })),
    furniture: p.furniture.filter((f) => !f.elevation).map((f) => ({
      kind: f.kind, name: f.name, width_cm: Math.round(f.w * 100), depth_cm: Math.round(f.d * 100), height_cm: Math.round(f.h * 100), color: f.color, accent: f.accent ?? f.color,
      room: p.rooms.find((r) => { let inside = false; const poly = r.polygon; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > f.y !== yj > f.y && f.x < ((xj - xi) * (f.y - yi)) / (yj - yi) + xi) inside = !inside } return inside })?.name ?? '',
    })),
  }
}

const client = new Client({ name: 'floorplay-test-host', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(server)))
const { tools } = await client.listTools()
const tool = tools.find((t) => t.name === 'show_home')!
const uri = (tool._meta as { ui: { resourceUri: string } }).ui.resourceUri
const args = sampleArgs()
status.textContent = `You: here is my floor plan and my furniture, show me the flat in 3D.\n\nAssistant called show_home (${args.walls.length} walls, ${args.rooms.length} rooms, ${args.furniture.length} pieces).`

const resultPromise = client.callTool({ name: 'show_home', arguments: args })
const html = ((await client.readResource({ uri })).contents[0] as { text: string }).text

const iframe = document.createElement('iframe')
iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
chat.appendChild(iframe)
const bridge = new AppBridge(client, { name: 'floorplay-test-host', version: '1.0.0' }, {
  openLinks: {}, serverTools: client.getServerCapabilities()?.tools, serverResources: client.getServerCapabilities()?.resources, updateModelContext: { text: {} },
}, { hostContext: { theme: 'light', platform: 'web', displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'], containerDimensions: { maxHeight: 6000 } } })
bridge.onopenlink = async ({ url }) => { window.__host.openedLinks.push(url); return {} }
bridge.onupdatemodelcontext = async (p) => { window.__host.contexts.push(JSON.stringify(p.content ?? [])); return {} }
bridge.onrequestdisplaymode = async ({ mode }) => { document.body.classList.toggle('fullscreen', mode === 'fullscreen'); bridge.sendHostContextChange({ displayMode: mode }); return { mode } }
bridge.onsizechange = async () => ({})
const initialized = new Promise<void>((resolve) => { bridge.oninitialized = () => resolve() })
await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!))
iframe.srcdoc = html
await initialized
bridge.sendToolInput({ arguments: args })
const result = await resultPromise
bridge.sendToolResult(result)
const text = (result.content as { type: string; text?: string }[]).find((c) => c.type === 'text')?.text ?? ''
window.__host.summary = text
const reply = document.createElement('div'); reply.className = 'bubble'; reply.textContent = `Tool result for the model:\n${text}`
chat.appendChild(reply)
window.__host.ready = true
