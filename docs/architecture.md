# Architecture

## Current shape
- repository root — npm workspaces and shared TypeScript build configuration
- `packages/shared` — shared JSON contract types split into `math.ts`, `tank.ts`, `shell.ts`, `scenario.ts`, `result.ts`, and a barrel `index.ts`
- `packages/sim-core` — working Node.js simulation core with:
  - `src/io.ts` for scenario loading, tank/shell lookup, and result/debug writing
  - `src/math.ts` for explicit vector math and ray/AABB intersection helpers
  - `src/simulate.ts` for AP vs HE branching, fuse decisions, surface-damage emission, and damage resolution
  - `src/cli.ts` for the workspace simulation command
- `packages/dev-viewer` — Vite-powered React + React Three Fiber dev viewer that loads `SimulationResult` JSON via file picker or bundled sample, renders armor/module/crew/trace geometry, and now layers lightweight inspection helpers on top of the scene through dedicated viewer/components/hooks/loaders modules: billboard labels, impact/damage markers, surface-damage overlays, a compact HUD, and a dev-oriented summary/timeline panel.
- `data` — tanks, shells, scenarios, and generated results/debug files
- `docs` — changelog, decisions, architecture, roadmap, testing

## Current flow
1. tank and shell definitions are loaded from `data/tanks` and `data/shells`
2. scenario JSON is loaded from `data/scenarios`
3. sim-core normalizes the incoming shot ray and finds the first armor-zone AABB hit
4. sim-core computes impact angle, effective armor, and projected normal resistance, then selects the AP or HE branch from the shell definition
5. AP checks ricochet and penetration, then generates a narrow internal fragment fan after a successful perforation
6. HE checks whether the fuse arms from projected resistance, then either stops with `fuse_failure` or detonates from a shallow internal origin with a wider fragment cone
7. sim-core emits prototype `surfaceDamage` markers from the chosen AP/HE branch using simple caliber, angle, penetration, thickness, and explosive-mass heuristics
8. sim-core produces a `SimulationResult` JSON payload from `packages/shared`, including lightweight hit context and `surfaceDamage` metadata for viewer inspection, plus a separate debug report with `surfaceDamageLog`
9. result and debug files are written to `data/results`
10. dev-viewer loads result JSON via file picker or built-in sample, then animates armor/module/crew shells, fragments, event markers, and oriented surface-damage markers with playback controls, speed options, and visibility toggles.
11. viewer inspection helpers resolve the hit zone, damage origin, damaged targets, and primary surface-damage marker from the result metadata so the scene and right-side panel present the same readable debugging context.

## Sim-core notes
- The monorepo is intentionally lightweight: one root workspace, three focused packages, and no extra build tooling beyond TypeScript.
- `packages/shared` is the boundary layer that preserves the JSON pipeline between sim-core and the viewer.
- `packages/shared/src/math.ts` provides the basic JSON-safe geometry primitives reused across the other shared contracts.
- `packages/shared/src/tank.ts` and `packages/shared/src/shell.ts` model authored input data.
- `packages/shared/src/scenario.ts` models a single shot setup with tunable simulation parameters.
- `packages/shared/src/result.ts` models replay/debug-friendly simulation output without embedding engine logic in the viewer. The result payload now includes optional `hitContext` metadata for impact point, impact normal, impact angle, fuse status, and damage origin, plus a small `surfaceDamage` array for visible armor marks and breach proxies.
- `packages/dev-viewer/src/viewer/inspectionUtils.ts` is a viewer-only interpretation layer that converts raw result metadata into display labels, current-event selection, and compact surface-damage summaries without moving simulation logic into the UI.
- The first working sim-core pass keeps geometry deliberately coarse: authored armor, module, and crew volumes are resolved as simple AABBs.
- Crew do not have authored sizes in `packages/shared` yet, so sim-core currently uses one fixed fallback crew box size for internal fragment tests.
- The first HE pass does not model true blast propagation. It uses projected armor resistance to decide whether the fuse arms, then emits a short forward fragment/spall fan from a shallow point behind the impact.
- Surface damage is still a visualization layer, not a geometry solver: markers are attached to armor planes as flat discs/rings/scars and do not cut or deform meshes.
- Runtime validation and a shared debug report schema remain unfinished; the current implementation trusts the authored JSON shape.
