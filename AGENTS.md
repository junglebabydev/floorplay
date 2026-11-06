# Agents guide: Floorplay

A static web app (Vite, React 19, TypeScript, three.js via react-three-fiber, Tailwind v4). No backend: AI calls go from the browser to the user's provider with the user's key.

## Commands

- `pnpm install`, `pnpm dev`, `pnpm build` (static output in `dist/`, relative base)
- `pnpm test` (vitest, Node environment), `pnpm typecheck`
- Run both before pushing. CI runs typecheck, tests and build on every push and PR.

## Where things live

- `src/core`: plan model and pure geometry. Units are metres; plan x grows right, y grows down; 3D world is (x, 0, y) with Y up. Furniture rotation is degrees clockwise from above, 0 means the front faces +y.
- `src/ai`: provider clients (`client.ts`), provider list (`providers.ts`), prompts, schemas and validators (`tasks.ts`). Anthropic goes through the official `@anthropic-ai/sdk` with `dangerouslyAllowBrowser` by design (user-held keys); other providers use `fetch`. Schemas must stay within what Anthropic structured outputs, OpenAI strict mode and Gemini all accept: every object `additionalProperties: false` with all keys required, nullables as `anyOf` with null, no numeric or length constraints.
- `src/three`: framework-free builders. `scene.ts` builds walls, openings and floors; `furniture.ts` has one generator per furniture kind, facing +Z with the bottom at y = 0.
- `mcp`: the MCP App for ChatGPT and Claude. `home.ts` turns what the chat model traced into a project (pure, tested); `server.ts` registers the `show_home` tool and the `ui://` view; `widget/` is the in-chat view (single-file build via `pnpm build:mcp`); `worker.ts` (Cloudflare) and `node.ts` (local) serve it through `http.ts`. Keep the tool stateless and read-only.
- `src/app`: React UI. State is one zustand store (`store.ts`); every edit goes through `update(fn, key)` so undo works and drags merge into one step.

## Rules

- Keep `src/core`, `src/ai` and `src/three` free of React so they can be reused (for example in an MCP App).
- Never send keys or user content anywhere except the provider the user picked. No analytics.
- AI answers are untrusted: validate and clamp them (see `validateTrace`, `validateFurniture`).
- Add a unit test for any geometry or parsing change.
