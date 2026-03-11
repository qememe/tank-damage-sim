# Architecture

## Current shape
- repository root — npm workspaces and shared TypeScript build configuration
- `packages/shared` — shared JSON contract types split into `math.ts`, `tank.ts`, `shell.ts`, `scenario.ts`, `result.ts`, and a barrel `index.ts`
- `packages/sim-core` — simulation engine entrypoint reserved for Node.js execution and JSON input/output handling
- `packages/dev-viewer` — browser-side viewer entrypoint reserved for loading and inspecting result JSON
- `data` — tanks, shells, scenarios, results, with initial example tank and shell JSON files
- `docs` — changelog, decisions, architecture, roadmap, testing

## Current flow
1. tank and shell definitions are loaded from `data/tanks` and `data/shells`
2. scenario JSON is loaded from `data/scenarios`
3. sim-core converts those payloads into the shared contract shape from `packages/shared`
4. sim-core produces result JSON for replay and inspection, plus a separate debug report outside the shared schema for now
5. result files are written to `data/results`
6. dev-viewer loads result JSON for replay and inspection

## Bootstrap notes
- The monorepo is intentionally lightweight: one root workspace, three focused packages, and no extra build tooling beyond TypeScript.
- `packages/shared` is the boundary layer that preserves the JSON pipeline between sim-core and the viewer.
- `packages/shared/src/math.ts` provides the basic JSON-safe geometry primitives reused across the other shared contracts.
- `packages/shared/src/tank.ts` and `packages/shared/src/shell.ts` model authored input data.
- `packages/shared/src/scenario.ts` models a single shot setup with tunable simulation parameters.
- `packages/shared/src/result.ts` models replay/debug-friendly simulation output without embedding engine logic in the viewer.
- Runtime validation and the separate debug report schema remain unfinished; current work is limited to TypeScript contract definitions.
