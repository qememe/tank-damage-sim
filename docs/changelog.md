# Changelog

## 2026-03-11
- Initialized repository structure.
- Added AGENTS.md with project rules and documentation policy.
- Added docs skeleton.
- Added MCP configuration for OpenAI developer docs.
- Prepared folders for simulation core, shared types, viewer, and data.
- Bootstrapped a minimal npm workspaces monorepo with root TypeScript build configuration.
- Added package manifests, TypeScript configs, and placeholder source entries for `packages/shared`, `packages/sim-core`, and `packages/dev-viewer`.
- Kept the file-based `scenario JSON -> sim-core -> result JSON + debug report -> dev-viewer` pipeline as the primary architecture.
- Left simulation logic and viewer rendering as explicit placeholders for the next milestone.
- Fixed local dependency installation for the npm workspace monorepo by replacing `workspace:*` specifiers with the matching local version `0.1.0` in workspace package manifests.
- The breakage was `npm install` failing with `EUNSUPPORTEDPROTOCOL` because this repository was using `workspace:*`, which npm in this environment did not accept for dependency resolution.
- Generated a root `package-lock.json` after the fix and verified that npm links `@tank-sim/shared`, `@tank-sim/sim-core`, and `@tank-sim/dev-viewer` as local workspaces.
- Dependencies should now be installed from the repository root with `npm install`, which is the intended monorepo workflow.
- Remaining limitation: local workspace dependency versions now need to stay in sync with the actual workspace package versions.
