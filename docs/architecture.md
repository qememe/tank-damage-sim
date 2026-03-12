# Architecture

## Current shape
- repository root — npm workspaces and shared TypeScript build configuration
- `packages/shared` — shared JSON contract types split into `math.ts`, `tank.ts`, `shell.ts`, `scenario.ts`, `result.ts`, an explicit `validation.ts`, and a barrel `index.ts`; `tank.ts` now carries both simulation hit volumes and an optional primitive `externalShapes` array for viewer-only outer-shell rendering, plus optional authored crew hitbox sizing
- `packages/sim-core` — working Node.js simulation core with:
  - `src/io.ts` for scenario loading, tank/shell lookup, runtime validation, and result/debug writing
  - `src/math.ts` for explicit vector math and ray/AABB intersection helpers
  - `src/simulate.ts` for AP vs HE branching, fuse decisions, surface-damage emission, authored crew hitbox usage, and damage resolution
  - `src/cli.ts` for the workspace simulation command
- `packages/dev-viewer` — Vite-powered React + React Three Fiber dev viewer that loads `SimulationResult` JSON via file picker or bundled sample, renders authored primitive external hull geometry plus armor/module/crew/trace geometry, and layers lightweight inspection helpers on top of the scene through dedicated viewer/components/hooks/loaders modules: billboard labels, impact/damage markers, surface-damage overlays, a compact HUD, and a dev-oriented summary/timeline panel with visibility and x-ray controls.
- `data` — tanks, shells, scenarios, and generated results/debug files
- `docs` — changelog, decisions, architecture, roadmap, testing

## Current flow
1. scenario JSON is loaded from `data/scenarios` and validated immediately
2. tank and shell definitions are scanned from `data/tanks` and `data/shells`, validated as they are read, and matched by authored `id`
3. validation failures stop the run before simulation and surface a single message with entity type, file path, field path, and reason
4. sim-core normalizes the incoming shot ray and finds the first armor-zone AABB hit
5. sim-core computes impact angle, effective armor, and projected normal resistance, then selects the AP or HE branch from the shell definition
6. AP checks ricochet and penetration, then generates a narrow internal fragment fan after a successful perforation
7. HE checks whether the fuse arms from projected resistance, then either stops with `fuse_failure` or detonates from a shallow internal origin with a wider fragment cone
8. internal fragment and penetration checks resolve modules against authored AABBs and crew against authored hitbox sizes when present, otherwise the legacy fallback box
9. sim-core emits prototype `surfaceDamage` markers from the chosen AP/HE branch using simple caliber, angle, penetration, thickness, and explosive-mass heuristics
10. sim-core produces a `SimulationResult` JSON payload from `packages/shared`, including lightweight hit context and `surfaceDamage` metadata for viewer inspection, plus a separate debug report with `surfaceDamageLog`
11. result and debug files are written to `data/results`
12. dev-viewer loads result JSON via file picker or built-in sample tank JSON, then renders the optional primitive external shell layer, authored module boxes, authored-or-fallback crew boxes, fragments, event markers, and oriented surface-damage markers, and exposes playback plus visibility toggles including an x-ray-like shell fade.
13. viewer inspection helpers resolve the hit zone, damage origin, damaged targets, and primary surface-damage marker from the result metadata so the scene and right-side panel present the same readable debugging context.

## Sim-core notes
- The monorepo is intentionally lightweight: one root workspace, three focused packages, and no extra build tooling beyond TypeScript.
- `packages/shared` is the boundary layer that preserves the JSON pipeline between sim-core and the viewer.
- `packages/shared/src/math.ts` provides the basic JSON-safe geometry primitives reused across the other shared contracts.
- `packages/shared/src/tank.ts` and `packages/shared/src/shell.ts` model authored input data, while `packages/shared/src/validation.ts` adds explicit runtime parsing/validation without introducing a schema framework.
- `packages/shared/src/tank.ts` now separates viewer-only exterior primitives from simulation armor/module/crew volumes so the JSON pipeline can gain a recognizable silhouette without moving hit logic into mesh data.
- Crew members can now author `size` and optional `shapeKind` in tank JSON. The current prototype accepts `shapeKind: "box"` and still treats the volume as an axis-aligned box.
- `packages/shared/src/scenario.ts` models a single shot setup with tunable simulation parameters.
- `packages/shared/src/result.ts` models replay/debug-friendly simulation output without embedding engine logic in the viewer. The result payload now includes optional `hitContext` metadata for impact point, impact normal, impact angle, fuse status, and damage origin, plus a small `surfaceDamage` array for visible armor marks and breach proxies.
- `packages/dev-viewer/src/viewer/inspectionUtils.ts` is a viewer-only interpretation layer that converts raw result metadata into display labels, current-event selection, and compact surface-damage summaries without moving simulation logic into the UI.
- `packages/dev-viewer/src/viewer/SimulationScene.tsx` now treats `externalShapes` as a pure render layer: primitive boxes/cylinders for the hull silhouette, semi-transparent in x-ray mode, while the existing armor/module/crew boxes remain the authoritative debug volumes.
- `packages/shared` now emits `.js`-suffixed relative imports in its compiled ESM output so the existing `npm --workspace @tank-sim/sim-core run simulate -- ...` workflow resolves correctly under Node's ESM loader.
- The first working sim-core pass keeps geometry deliberately coarse: authored armor, module, and crew volumes are resolved as simple AABBs.
- Authored `externalShapes` are currently viewer-only decoration. They do not affect sim-core hit tests, penetration checks, or damage propagation.
- Sim-core now uses authored crew hitbox sizes for internal fragment tests when present. The fallback crew box remains only for older or incomplete tank JSON.
- The first HE pass does not model true blast propagation. It uses projected armor resistance to decide whether the fuse arms, then emits a short forward fragment/spall fan from a shallow point behind the impact.
- Surface damage is still a visualization layer, not a geometry solver: markers are attached to armor planes as flat discs/rings/scars and do not cut or deform meshes.
- Runtime validation now checks required fields, enum values, duplicate ids, vector validity, and practical numeric bounds for tank, shell, and scenario JSON before simulation starts.
- Validation is intentionally lightweight and local. It does not yet enforce historical correctness, cross-file compatibility beyond lookup by id, or non-overlap/fit checks between authored internal volumes.
