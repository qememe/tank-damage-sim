# Architecture

## Current shape
- repository root — npm workspaces and shared TypeScript build configuration
- `packages/shared` — shared JSON contract types split into `math.ts`, `tank.ts`, `shell.ts`, `scenario.ts`, `result.ts`, and a barrel `index.ts`
- `packages/sim-core` — working Node.js simulation core with:
  - `src/io.ts` for scenario loading, tank/shell lookup, and result/debug writing
  - `src/math.ts` for explicit vector math and ray/AABB intersection helpers
  - `src/simulate.ts` for the shot pipeline and damage resolution
  - `src/cli.ts` for the workspace simulation command
- `packages/dev-viewer` — Vite-powered React + React Three Fiber dev viewer that loads `SimulationResult` JSON via file picker or bundled sample, and renders armor, module, crew, and trace geometry through dedicated viewer/components/hooks/loaders modules with simple playback controls.
- `data` — tanks, shells, scenarios, and generated results/debug files
- `docs` — changelog, decisions, architecture, roadmap, testing

## Current flow
1. tank and shell definitions are loaded from `data/tanks` and `data/shells`
2. scenario JSON is loaded from `data/scenarios`
3. sim-core normalizes the incoming shot ray and finds the first armor-zone AABB hit
4. sim-core computes impact angle, effective armor, ricochet, and penetration outcome
5. on penetration, sim-core generates a shell path plus fragment rays and checks them against module and crew AABBs
6. sim-core produces a `SimulationResult` JSON payload from `packages/shared` plus a separate debug report
7. result and debug files are written to `data/results`
8. dev-viewer loads result JSON via file picker or built-in sample, then animates armor/module/crew shells, fragments, and event markers with playback controls, speed options, and visibility toggles.

## Sim-core notes
- The monorepo is intentionally lightweight: one root workspace, three focused packages, and no extra build tooling beyond TypeScript.
- `packages/shared` is the boundary layer that preserves the JSON pipeline between sim-core and the viewer.
- `packages/shared/src/math.ts` provides the basic JSON-safe geometry primitives reused across the other shared contracts.
- `packages/shared/src/tank.ts` and `packages/shared/src/shell.ts` model authored input data.
- `packages/shared/src/scenario.ts` models a single shot setup with tunable simulation parameters.
- `packages/shared/src/result.ts` models replay/debug-friendly simulation output without embedding engine logic in the viewer.
- The first working sim-core pass keeps geometry deliberately coarse: authored armor, module, and crew volumes are resolved as simple AABBs.
- Crew do not have authored sizes in `packages/shared` yet, so sim-core currently uses one fixed fallback crew box size for internal fragment tests.
- Runtime validation and a shared debug report schema remain unfinished; the current implementation trusts the authored JSON shape.
