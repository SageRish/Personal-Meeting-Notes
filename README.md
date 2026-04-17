# Personal Meeting Notes

Monorepo scaffold for a TypeScript-first desktop app.

## Workspace layout

- `apps/desktop`: Tauri + React desktop shell
- `packages/core`: shared domain logic, types, and services

## Scripts

From the repository root:

- `npm run dev` — runs the desktop web frontend in development mode
- `npm run build` — builds the desktop frontend
- `npm run typecheck` — strict TypeScript checks across workspaces
- `npm run lint` — lint checks across workspaces
- `npm run format` — check formatting with Prettier
