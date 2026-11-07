// The Floorimate MCP App: one tool that shows an interactive 3D home in ChatGPT or Claude.
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { McpServer, type CallToolResult, type ReadResourceResult } from '@modelcontextprotocol/server'
import { buildHome, SHOW_HOME_DESCRIPTION, showHomeInput } from './home'

export const WIDGET_URI = 'ui://floorimate/home.html'
export const VERSION = '0.2.0'

export function createServer(widgetHtml: string): McpServer {
  const server = new McpServer(
    { name: 'Floorimate', version: VERSION, title: 'Floorimate', websiteUrl: 'https://junglebabydev.github.io/floorplay/' },
    { instructions: "Floorimate turns a floor plan image into an interactive, furnished 3D home inside the chat. Read the images yourself, then call show_home with the traced plan, any room finishes and the person's furniture." },
  )

  registerAppTool(
    server,
    'show_home',
    {
      title: 'Show a floor plan in 3D',
      description: SHOW_HOME_DESCRIPTION,
      inputSchema: showHomeInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async (args): Promise<CallToolResult> => {
      try {
        const { project, summary } = buildHome(args)
        return { content: [{ type: 'text', text: summary }], structuredContent: { project } }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `Could not build the home: ${(e as Error).message}. Check that walls were traced with 0 to 1000 coordinates, then try again.` }] }
      }
    },
  )

  registerAppResource(server, 'Floorimate 3D home', WIDGET_URI, { mimeType: RESOURCE_MIME_TYPE, description: 'Interactive 3D view of a furnished home' }, async (): Promise<ReadResourceResult> => ({
    contents: [{ uri: WIDGET_URI, mimeType: RESOURCE_MIME_TYPE, text: widgetHtml }],
  }))

  return server
}
