<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Splitmate project notes

- Product rules live in the database: see `supabase/migrations/`. History is keyed by (user_id, exercise_id); sessions snapshot templates; ownership is enforced by composite (id, user_id) foreign keys plus RLS.
- Mutations that must be atomic are SQL functions (`activate_split`, `start_session`, `sync_session`, `finish_session`, `copy_shared_split`, …). Call them via `supabase.rpc`.
- The workout logger is local-first: `src/lib/session/{doc,store,sync}.ts` are pure and unit-tested; keep UI code thin on top of them.
- Server components import helpers from `src/components/styles.ts`, not from the client module `ui.tsx`.
- Checks: `npm run lint && npm run typecheck && npm run test:unit`; with the local stack running also `npm run test:db` and (after `npm run build`) `npm run test:e2e`.
