// Calls a running Floorimate MCP server like a chat host would: list tools, call show_home, read the view.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const url = process.argv[2] ?? 'http://localhost:3001/mcp'
const client = new Client({ name: 'floorimate-smoke', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(url)))

const tools = await client.listTools()
const tool = tools.tools.find((t) => t.name === 'show_home')
if (!tool) throw new Error('show_home is missing')
console.log('tool:', tool.name, '| ui:', JSON.stringify(tool._meta?.ui), '| readOnly:', tool.annotations?.readOnlyHint)
console.log('input fields:', Object.keys((tool.inputSchema as { properties: object }).properties).join(', '))

const result = await client.callTool({
  name: 'show_home',
  arguments: {
    name: 'Smoke test flat', image_width: 1000, image_height: 800,
    walls: [
      { x1: 100, y1: 125, x2: 900, y2: 125, exterior: true }, { x1: 900, y1: 125, x2: 900, y2: 875, exterior: true },
      { x1: 900, y1: 875, x2: 100, y2: 875, exterior: true }, { x1: 100, y1: 875, x2: 100, y2: 125, exterior: true },
      { x1: 500, y1: 125, x2: 500, y2: 875, exterior: false },
    ],
    openings: [{ kind: 'door', x1: 650, y1: 875, x2: 730, y2: 875 }, { kind: 'door', x1: 500, y1: 475, x2: 500, y2: 575 }, { kind: 'window', x1: 250, y1: 125, x2: 400, y2: 125 }],
    rooms: [
      { name: 'Living', polygon: [[100, 125], [500, 125], [500, 875], [100, 875]], area_m2: 19.2, floor: null },
      { name: 'Bedroom', polygon: [[500, 125], [900, 125], [900, 875], [500, 875]], area_m2: 19.2, floor: 'parquet' },
    ],
    furniture: [
      { kind: 'bed', name: 'IKEA MALM queen bed', width_cm: 176, depth_cm: 209, height_cm: 100, color: '#f2f1ec', accent: '#efe9dd', room: 'Bedroom' },
      { kind: 'sofa', name: '3-seater sofa', width_cm: 240, depth_cm: 95, height_cm: 86, color: '#a49c91', accent: '#5a3a26', room: 'Living' },
      { kind: 'dining-table', name: 'Dining table', width_cm: 180, depth_cm: 90, height_cm: 75, color: '#c38c4e', accent: '#c38c4e', room: 'Living' },
    ],
  },
})
const text = (result.content as { type: string; text?: string }[]).find((c) => c.type === 'text')?.text
console.log('isError:', result.isError ?? false)
console.log('summary:\n' + text)
const project = (result.structuredContent as { project?: { furniture: unknown[]; walls: unknown[] } })?.project
console.log('structuredContent.project:', project ? `${project.walls.length} walls, ${project.furniture.length} pieces` : 'MISSING')

const res = await client.readResource({ uri: (tool._meta as { ui: { resourceUri: string } }).ui.resourceUri })
const c = res.contents[0] as { mimeType?: string; text?: string }
console.log('resource:', c.mimeType, `${Math.round((c.text?.length ?? 0) / 1024)} KB`, c.text?.startsWith('<!doctype html>') ? 'html ok' : 'NOT HTML')
await client.close()
