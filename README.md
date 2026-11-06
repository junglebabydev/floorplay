# Floorplay

**See your new home in 3D before you move in.** Upload a floor plan, add your own furniture from photos, and find out what fits.

Floorplay is a free, open-source web app. It runs entirely in your browser with your own AI key: there is no Floorplay server, account or subscription.

**Open it:** https://junglebabydev.github.io/floorplay/ · **Try the sample:** https://junglebabydev.github.io/floorplay/app/?sample=1

![Floorplay showing a furnished 3-bedroom condo, plan beside 3D view](public/hero.png)

## How it works

Three uploads and one button:

1. **Floor plan.** A brochure page, a photo of a printed plan or a screenshot.
2. **Photos and videos of the home** (optional). A walkthrough video or room photos. Videos are sampled into still frames in the browser.
3. **Your furniture.** One photo per piece, with the product name if you know it.

Press **Process** and Floorplay:

- traces the walls, doors, windows and rooms, scaled from printed dimensions or room areas;
- matches each room's floor and wall colours from your photos and video;
- identifies every piece of furniture and its size (published dimensions when it recognises the product) and which room it belongs in;
- arranges the pieces: rugs and tables in the middle, chairs around the table, everything else against a wall facing into the room, clear of doors and each other.

You land on the furnished home in 2D and 3D. Drag, rotate or resize anything; overlaps, pieces in walls and blocked doors show in red, and **Hide furniture** shows the empty home. The full editor (walls, doors, windows, rooms, set scale) is there for anything the AI got wrong. Projects autosave in the browser, save to a file, and export as `.glb`.

You can also draw a plan entirely by hand with no AI at all.

## Use it inside ChatGPT or Claude

Floorplay is also an **MCP App**: add it as a connector and the chat model does the AI work with your own ChatGPT or Claude subscription, no API key needed. Share a floor plan (and photos of your furniture) in the chat, ask to see it in 3D, and an interactive, furnished 3D home appears in the conversation. You can rotate it, switch to the plan view, drag furniture, go full screen, or open it in the web app.

Connector URL: `https://floorplay-mcp.<your-subdomain>.workers.dev/mcp` (see Hosting the MCP server below).

- **Claude** (claude.ai or the desktop app): Settings → Connectors → Add custom connector, paste the URL. Custom connectors need a paid Claude plan.
- **ChatGPT**: Settings → Apps & Connectors → Advanced settings → turn on Developer mode, then Create, paste the URL, no authentication. Which plans can add custom apps varies; check OpenAI's help pages.

Then, in a chat: attach your floor plan and say "show this in 3D with Floorplay". Add furniture photos or a walkthrough video to furnish it.

The server is stateless and read-only: it receives the traced plan from the chat model, computes the scale, walls and furniture layout, and returns them. It stores nothing.

### Hosting the MCP server

The server (`mcp/`) runs on Cloudflare Workers; the free plan is enough.

1. Create a free Cloudflare account and open **Workers & Pages** once so it gives you a `workers.dev` subdomain.
2. Create an API token with the **Edit Cloudflare Workers** template, and note your Account ID.
3. In this repo on GitHub: Settings → Secrets and variables → Actions, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Run the **Deploy MCP server** workflow (or push to `main`). It deploys to `https://floorplay-mcp.<your-subdomain>.workers.dev`.

Locally: `pnpm mcp` runs it on Node at `http://localhost:3001/mcp`, `pnpm mcp:dev` in the Workers runtime, `pnpm mcp:smoke <url>` calls it like a chat host, and `pnpm mcp:host` opens a test chat that renders the 3D view.

## Bring your own AI

Pick a provider in **Connect AI** and paste a key. Use a model that can read images.

| Provider | Notes |
| --- | --- |
| Anthropic | Claude models via the official SDK. Default `claude-opus-5-5`. |
| OpenAI | GPT models with strict JSON output. |
| Google Gemini | Key from Google AI Studio. |
| OpenRouter | One key for many providers' models. |
| Local or custom | Any OpenAI-compatible server: Ollama, LM Studio, vLLM and others. Start Ollama with `OLLAMA_ORIGINS` set so the page can reach it. |

**Privacy.** Keys and projects are stored only in your browser (localStorage and IndexedDB). AI requests go directly from your browser to the provider you chose. Use **Forget keys** on a shared computer.

**Want to use your ChatGPT or Claude subscription instead of a key?** Use Floorplay inside ChatGPT or Claude (above). In the web app itself, subscriptions cannot be used: Anthropic does not allow Claude subscriptions in third-party apps, and OpenAI's Sign in with ChatGPT is limited to partner apps.

## Develop

Requires Node 22 and pnpm.

```bash
pnpm install
pnpm dev        # http://localhost:5173 (landing) and /app/
pnpm test       # unit tests (vitest)
pnpm typecheck
pnpm build      # static site in dist/
```

The build is a static site with a relative base, so `dist/` can be hosted anywhere. GitHub Pages deploys it from `main` (see `.github/workflows/pages.yml`).

### Layout

| Path | What lives there |
| --- | --- |
| `src/core` | The plan model, geometry (areas, wall openings, clashes, snapping), AI-trace normalisation and the sample home. No UI or three.js. |
| `src/ai` | Provider clients, prompts, JSON schemas and validators for the three AI jobs: trace a plan, identify furniture, read a room's finish. |
| `src/three` | Plan to three.js: walls with openings, doors, windows, procedural floor textures, parametric furniture, `.glb` export. |
| `src/app` | The React app: store, 2D plan editor (SVG), 3D view (react-three-fiber), panels and settings. |
| `mcp` | The MCP App for ChatGPT and Claude: server (`server.ts`, `home.ts`), the in-chat view (`widget/`), Worker and Node entries, a test host. |
| `index.html` | The landing page. |

`src/core`, `src/ai` and `src/three` are framework-free so they can be reused, for example in an MCP App.

## Roadmap

- Desktop builds (Tauri) for offline use with local models.
- More furniture shapes, wall colours per room, multi-storey homes.
- Share a read-only link to a furnished plan.

## Licence

MIT. See [LICENSE](LICENSE). The bundled sample home is traced from a real condo plan; the developer's brochure image is not included.
