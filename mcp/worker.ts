// Cloudflare Worker entry. The widget is bundled into the Worker as a text module (see wrangler.toml).
import widgetHtml from '../dist-mcp/mcp/widget.html'
import { makeFetchHandler } from './http'

const handle = makeFetchHandler(widgetHtml)

export default {
  fetch: (request: Request) => handle(request),
}
