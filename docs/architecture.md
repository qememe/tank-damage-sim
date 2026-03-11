# Architecture

## Current shape
- repository root — npm workspaces and shared TypeScript build configuration
- `packages/shared` — shared JSON contract types for scenarios, results, events, and debug output
- `packages/sim-core` — simulation engine entrypoint reserved for Node.js execution and JSON input/output handling
- `packages/dev-viewer` — browser-side viewer entrypoint reserved for loading and inspecting result JSON
- `data` — tanks, shells, scenarios, results
- `docs` — changelog, decisions, architecture, roadmap, testing

## Current flow
1. scenario JSON is loaded from `data/scenarios`
2. sim-core converts the scenario payload into the shared contract shape
3. sim-core produces result JSON plus a debug report
4. result files are written to `data/results`
5. dev-viewer loads result JSON for replay and inspection

## Bootstrap notes
- The monorepo is intentionally lightweight: one root workspace, three focused packages, and no extra build tooling beyond TypeScript.
- `packages/shared` is the boundary layer that preserves the JSON pipeline between sim-core and the viewer.
- The current package entrypoints are scaffolding only; ballistics, armor interaction, and replay rendering remain unfinished.
