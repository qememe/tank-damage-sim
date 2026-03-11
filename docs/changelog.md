# Changelog

## 2026-03-11
- Replaced the placeholder `packages/shared` contract with split JSON-first schema files for math, tank, shell, scenario, and result payloads.
- Added minimal example assets in `data/tanks/test_tank_a.json` and `data/shells/ap_75mm.json` to exercise the shared schema shape.
- The shared result contract now covers replay-oriented shell paths, fragment paths, module damage, and crew damage in a serializable form for sim-core and the dev viewer.
- Kept the types intentionally minimal: no classes, no runtime validation layer, and no schema for the separate debug report yet.
- Remaining unfinished work: wire these types into sim-core inputs/outputs and add runtime validation once the first executable simulation pass exists.
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
