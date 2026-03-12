# Architecture

## Current shape
- repository root — npm workspaces and shared TypeScript build configuration
- `packages/shared` — shared JSON contract types split into `math.ts`, `tank.ts`, `shell.ts`, `scenario.ts`, `result.ts`, an explicit `validation.ts`, and a barrel `index.ts`; `tank.ts` now carries both simulation hit volumes and an optional primitive `externalShapes` array for viewer-only outer-shell rendering, plus optional authored `rotationDeg` on armor zones, modules, and crew hitboxes
- `packages/sim-core` — working Node.js simulation core with:
  - `src/io.ts` for scenario loading, tank/shell lookup, runtime validation, and result/debug writing
  - `src/math.ts` for explicit vector math plus ray/AABB and ray/oriented-box helpers built from simple local-space ray transforms
  - `src/simulate.ts` for AP vs HE branching, fuse decisions, surface-damage emission, authored rotated box usage for armor/modules/crew, seeded fragment/spall generation, and damage resolution
  - `src/cli.ts` for the workspace simulation command
- `packages/dev-viewer` — Vite-powered React + React Three Fiber dev viewer that loads `SimulationResult` JSON via file picker or bundled sample, renders authored primitive external hull geometry plus armor/module/crew/trace geometry, and layers lightweight inspection helpers on top of the scene through dedicated viewer/components/hooks/loaders modules: billboard labels, impact/damage markers, surface-damage overlays, a compact HUD, and a dev-oriented summary/timeline panel with visibility and x-ray controls.
- `data` — tanks, shells, scenarios, and generated results/debug files
- `docs` — changelog, decisions, architecture, roadmap, testing

## Current flow
1. scenario JSON is loaded from `data/scenarios` and validated immediately
2. tank and shell definitions are scanned from `data/tanks` and `data/shells`, validated as they are read, and matched by authored `id`
3. validation failures stop the run before simulation and surface a single message with entity type, file path, field path, and reason
4. sim-core normalizes the incoming shot ray and finds the first armor-zone oriented-box hit by transforming the ray into each zone's local box space
5. sim-core rotates the authored armor-zone normal when `rotationDeg` is present, computes impact angle/effective armor/projected normal resistance from that rotated normal, then selects the AP or HE branch from the shell definition
6. AP checks ricochet and penetration, then builds a seeded fragment model with a few narrow high-energy `core` fragments plus wider lower-energy `spall` / `side` fragments
7. HE checks whether the fuse arms from projected resistance, then either stops with `fuse_failure` or detonates from a shallow internal origin with a wider, shorter-range seeded `blast` / `spall` fragment model
8. internal fragment and penetration checks resolve modules and crew against authored box volumes in their own rotated local spaces; older JSON still behaves the same because missing `rotationDeg` is treated as zero rotation and crew size still falls back when absent
9. AP core fragments may continue once after a major interaction at reduced energy/reach, while HE fragments stop after the first major interaction
10. sim-core emits prototype `surfaceDamage` markers from the chosen AP/HE branch using simple caliber, angle, penetration, thickness, and explosive-mass heuristics
11. sim-core produces a `SimulationResult` JSON payload from `packages/shared`, including lightweight hit context, optional per-fragment metadata, and `surfaceDamage` metadata for viewer inspection, plus a separate debug report with `fragmentGeneration`, `fragmentLog`, and `surfaceDamageLog`
12. result and debug files are written to `data/results`
13. dev-viewer loads result JSON via file picker or built-in sample tank JSON, then renders the optional primitive external shell layer, authored rotated armor/module/crew boxes, fragments, event markers, and oriented surface-damage markers, and exposes playback plus visibility toggles including an x-ray-like shell fade.
14. viewer inspection helpers resolve the hit zone, damage origin, damaged targets, and primary surface-damage marker from the result metadata so the scene and right-side panel present the same readable debugging context.

## Sim-core notes
- The monorepo is intentionally lightweight: one root workspace, three focused packages, and no extra build tooling beyond TypeScript.
- `packages/shared` is the boundary layer that preserves the JSON pipeline between sim-core and the viewer.
- `packages/shared/src/math.ts` provides the basic JSON-safe geometry primitives reused across the other shared contracts.
- `packages/shared/src/tank.ts` and `packages/shared/src/shell.ts` model authored input data, while `packages/shared/src/validation.ts` adds explicit runtime parsing/validation without introducing a schema framework.
- `packages/shared/src/tank.ts` now separates viewer-only exterior primitives from simulation armor/module/crew volumes so the JSON pipeline can gain a recognizable silhouette without moving hit logic into mesh data, and those authored box volumes can now optionally carry `rotationDeg`.
- Crew members can now author `size`, optional `shapeKind`, and optional `rotationDeg` in tank JSON. The current prototype accepts `shapeKind: "box"` and still treats the volume as a box, but no longer requires it to stay axis-aligned.
- `packages/shared/src/scenario.ts` models a single shot setup with tunable simulation parameters.
- `packages/shared/src/result.ts` models replay/debug-friendly simulation output without embedding engine logic in the viewer. The result payload now includes optional `hitContext` metadata for impact point, impact normal, impact angle, fuse status, damage origin, and optional fragment metadata (`sourceBranch`, `fragmentType`, `energy`, `reach`), plus a small `surfaceDamage` array for visible armor marks and breach proxies.
- `packages/dev-viewer/src/viewer/inspectionUtils.ts` is a viewer-only interpretation layer that converts raw result metadata into display labels, current-event selection, and compact surface-damage summaries without moving simulation logic into the UI.
- `packages/dev-viewer/src/viewer/SimulationScene.tsx` now treats `externalShapes` as a pure render layer: primitive boxes/cylinders for the hull silhouette, semi-transparent in x-ray mode, while the existing armor/module/crew boxes remain the authoritative debug volumes and render with the same authored rotations used by sim-core.
- `packages/shared` now emits `.js`-suffixed relative imports in its compiled ESM output so the existing `npm --workspace @tank-sim/sim-core run simulate -- ...` workflow resolves correctly under Node's ESM loader.
- The current sim-core pass keeps geometry deliberately coarse: authored armor, module, and crew volumes are still simple rectangular boxes, but they are now allowed to rotate as oriented boxes instead of being forced to stay axis-aligned.
- Authored `externalShapes` are currently viewer-only decoration. They do not affect sim-core hit tests, penetration checks, or damage propagation.
- Sim-core now uses authored crew hitbox sizes for internal fragment tests when present. The fallback crew box remains only for older or incomplete tank JSON, and missing crew rotation still resolves to zero rotation for backward compatibility.
- AP internal damage is no longer one flat fan of identical rays. The current prototype builds seeded forward `core` fragments and wider lower-energy `spall` / `side` fragments, with limited one-step continuation for core pieces after the first major hit.
- HE internal damage now uses a visibly different seeded pattern: wider cone, shorter reach, more near-origin `blast` fragments, and explosive-mass-scaled count/energy.
- The debug report now records fragment generation heuristics and a per-fragment log so fragment count, type, energy, reach, stop reason, and hit explanations are inspectable from JSON.
- The first HE pass still does not model true blast propagation. It uses projected armor resistance to decide whether the fuse arms, then emits short-range seeded fragment/spall paths from a shallow point behind the impact.
- Surface damage is still a visualization layer, not a geometry solver: markers are attached to armor planes as flat discs/rings/scars and do not cut or deform meshes.
- Runtime validation now checks required fields, enum values, duplicate ids, vector validity, and practical numeric bounds for tank, shell, and scenario JSON before simulation starts.
- Validation is intentionally lightweight and local. It does not yet enforce historical correctness, cross-file compatibility beyond lookup by id, or non-overlap/fit checks between authored internal volumes.
- Fragment occlusion, armor breakup, target shielding, and true blast pressure are still simplified away. The model remains seeded heuristics over rotated box targets, not a full physics solver.
