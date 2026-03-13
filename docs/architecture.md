# Architecture

## Current shape
- repository root — npm workspaces and shared TypeScript build configuration
- `packages/shared` — shared JSON contract types split into `math.ts`, `tank.ts`, `shell.ts`, `scenario.ts`, `result.ts`, `debug.ts`, an explicit `validation.ts`, and a barrel `index.ts`; `tank.ts` now carries both simulation hit volumes and an optional primitive `externalShapes` array for viewer-only outer-shell rendering, plus optional authored `rotationDeg` on armor zones, modules, and crew hitboxes
- `packages/sim-core` — working Node.js simulation core with:
  - `src/io.ts` for scenario loading, tank/shell lookup, runtime validation, and result/debug writing
  - `src/math.ts` for explicit vector math plus ray/AABB and ray/oriented-box helpers built from simple local-space ray transforms
  - `src/simulate.ts` for AP vs HE branching, fuse decisions, simple AP range-based penetration falloff, surface-damage emission, authored rotated box usage for armor/modules/crew, seeded fragment/spall generation, and damage resolution
  - `src/cli.ts` for the workspace simulation command
  - `src/runBetaRegression.ts` for manifest-driven regeneration of the curated beta scenario pack
- `packages/dev-viewer` — Vite-powered React + React Three Fiber dev viewer that now serves the repository `data/` directory as static viewer content, boots from a lightweight curated manifest, auto-loads a default showcase scenario, renders authored primitive external hull geometry plus armor/module/crew/trace geometry, and layers lightweight inspection helpers on top of the scene through dedicated viewer/components/hooks/loaders modules: billboard labels, impact/damage markers, surface-damage overlays, a compact HUD, a beta-style browser/panel with featured quick access, a compact debug inspector, visibility and x-ray controls, and preserved manual JSON fallback loading
- `data` — tanks, shells, scenarios, generated results/debug files, `beta-content.manifest.json` as the viewer-facing launcher index, and `data/README.md` as a small authored content summary
- `docs` — changelog, decisions, architecture, roadmap, testing

## Current flow
1. scenario JSON is loaded from `data/scenarios` and validated immediately
2. tank and shell definitions are scanned from `data/tanks` and `data/shells`, validated as they are read, and matched by authored `id`
3. validation failures stop the run before simulation and surface a single message with entity type, file path, field path, and reason
4. sim-core normalizes the incoming shot ray and finds the first armor-zone oriented-box hit by transforming the ray into each zone's local box space
5. sim-core rotates the authored armor-zone normal when `rotationDeg` is present, computes impact angle/effective armor/projected normal resistance from that rotated normal, applies any authored per-shell penetration loss across the scenario distance, then selects the AP or HE branch from the shell definition
6. AP checks ricochet and penetration, then builds a seeded fragment model with a few narrow high-energy `core` fragments plus wider lower-energy `spall` / `side` fragments
7. HE checks whether the fuse arms from projected resistance, then either stops with `fuse_failure` or detonates from a shallow internal origin with a wider, shorter-range seeded `blast` / `spall` fragment model
8. internal fragment and penetration checks resolve modules and crew against authored box volumes in their own rotated local spaces; older JSON still behaves the same because missing `rotationDeg` is treated as zero rotation and crew size still falls back when absent
9. AP core fragments may continue once after a major interaction at reduced energy/reach, while HE fragments stop after the first major interaction
10. sim-core emits prototype `surfaceDamage` markers from the chosen AP/HE branch using simple caliber, angle, penetration, thickness, and explosive-mass heuristics
11. sim-core produces a `SimulationResult` JSON payload from `packages/shared`, including lightweight hit context, optional per-fragment metadata, and `surfaceDamage` metadata for viewer inspection, plus a separate shared `SimulationDebugReport` payload with `fragmentGeneration`, `fragmentLog`, and `surfaceDamageLog`
12. result and debug files are written to `data/results`, mirroring the scenario stem so each curated case stays easy to pair by filename
13. `npm run beta:refresh` reads `data/beta-content.manifest.json` as the single curated source of truth, runs sim-core for each listed scenario, refreshes the matching result/debug files, and fails clearly if any case cannot be simulated
14. dev-viewer first fetches `beta-content.manifest.json` from the static `data/` pack, uses it to build the curated scenario browser, and auto-loads the configured default showcase case on startup; if that bootstrap fails it falls back to a bundled beta default result/tank/debug trio rather than the older prototype-only sample
15. selecting a curated scenario loads its matching result JSON, debug JSON, and tank JSON from the manifest-linked `data/results` and `data/tanks` files, while the panel keeps the matching scenario/debug filenames visible for inspection and preserves manual JSON loading as a separate dev path
16. the viewer then renders the optional primitive external shell layer, authored rotated armor/module/crew boxes, fragments, event markers, and oriented surface-damage markers, and exposes playback plus visibility toggles including an x-ray-like shell fade
17. viewer inspection helpers resolve the hit zone, damage origin, damaged targets, and primary surface-damage marker from the result metadata so the scene and panel present the same readable debugging context, while the compact debug inspector summarizes linked debug JSON instead of dumping raw payloads by default

## Sim-core notes
- The monorepo is intentionally lightweight: one root workspace, three focused packages, and no extra build tooling beyond TypeScript.
- `packages/shared` is the boundary layer that preserves the JSON pipeline between sim-core and the viewer.
- The current authored beta slice uses `test_tank_a` as the primary showcase medium tank and `test_tank_b` as the contrasting assault gun, with a small `data/README.md` index keeping tanks, shells, scenarios, and result stems aligned.
- `data/beta-content.manifest.json` is intentionally lightweight and viewer-only. It does not replace authored scenario/result/tank JSON; it only groups and links the curated pack so the viewer can present it like a small beta product instead of a raw file picker.
- `packages/shared/src/math.ts` provides the basic JSON-safe geometry primitives reused across the other shared contracts.
- `packages/shared/src/tank.ts`, `shell.ts`, and `debug.ts` model authored input data plus the cross-package debug payload, while `packages/shared/src/validation.ts` adds explicit runtime parsing/validation without introducing a schema framework.
- `packages/shared/src/tank.ts` now separates viewer-only exterior primitives from simulation armor/module/crew volumes so the JSON pipeline can gain a recognizable silhouette without moving hit logic into mesh data, and those authored box volumes can now optionally carry `rotationDeg`.
- Crew members can now author `size`, optional `shapeKind`, and optional `rotationDeg` in tank JSON. The current prototype accepts `shapeKind: "box"` and still treats the volume as a box, but no longer requires it to stay axis-aligned.
- `packages/shared/src/scenario.ts` models a single shot setup with tunable simulation parameters.
- `packages/shared/src/result.ts` models replay/debug-friendly simulation output without embedding engine logic in the viewer. The result payload now includes optional `hitContext` metadata for impact point, impact normal, impact angle, fuse status, damage origin, and optional fragment metadata (`sourceBranch`, `fragmentType`, `energy`, `reach`), plus a small `surfaceDamage` array for visible armor marks and breach proxies.
- `packages/dev-viewer/src/viewer/inspectionUtils.ts` is a viewer-only interpretation layer that converts raw result metadata into display labels, current-event selection, and compact surface-damage summaries without moving simulation logic into the UI.
- `packages/dev-viewer/src/viewer/SimulationScene.tsx` now treats `externalShapes` as a pure render layer: primitive boxes/cylinders for the hull silhouette, semi-transparent in x-ray mode, while the existing armor/module/crew boxes remain the authoritative debug volumes and render with the same authored rotations used by sim-core.
- `packages/dev-viewer/src/content/betaContent.ts` is a thin loader layer for the beta manifest and the linked tank/result assets. It keeps fetch/path handling out of the UI while avoiding a backend or router.
- `packages/dev-viewer/src/content/betaContent.ts` now also resolves linked debug JSON for curated scenarios and the bundled beta fallback so the compact inspector can stay file-based and local.
- `packages/shared` now emits `.js`-suffixed relative imports in its compiled ESM output so the existing `npm --workspace @tank-sim/sim-core run simulate -- ...` workflow resolves correctly under Node's ESM loader.
- The current sim-core pass keeps geometry deliberately coarse: authored armor, module, and crew volumes are still simple rectangular boxes, but they are now allowed to rotate as oriented boxes instead of being forced to stay axis-aligned.
- Authored `externalShapes` are currently viewer-only decoration. They do not affect sim-core hit tests, penetration checks, or damage propagation.
- Sim-core now uses authored crew hitbox sizes for internal fragment tests when present. The fallback crew box remains only for older or incomplete tank JSON, and missing crew rotation still resolves to zero rotation for backward compatibility.
- AP internal damage is no longer one flat fan of identical rays. The current prototype builds seeded forward `core` fragments and wider lower-energy `spall` / `side` fragments, with limited one-step continuation for core pieces after the first major hit.
- HE internal damage now uses a visibly different seeded pattern: wider cone, shorter reach, more near-origin `blast` fragments, and explosive-mass-scaled count/energy.
- The debug report now records fragment generation heuristics and a per-fragment log so fragment count, type, energy, reach, stop reason, and hit explanations are inspectable from JSON.
- The first HE pass still does not model true blast propagation. It uses projected armor resistance to decide whether the fuse arms, then emits short-range seeded fragment/spall paths from a shallow point behind the impact.
- Surface damage is still a visualization layer, not a geometry solver: markers are attached to armor planes as flat discs/rings/scars and do not cut or deform meshes.
- The beta launcher is still local-static only. There is no persistence, no search/index backend, and no live scenario execution from the browser; it only loads curated authored JSON artifacts that already exist on disk.
- The curated beta manifest is now the source of truth for both launcher grouping and regression regeneration. That keeps the beta pack file-based and lightweight, but it also means scenario metadata quality depends on that single manifest staying accurate.
- Runtime validation now checks required fields, enum values, duplicate ids, vector validity, and practical numeric bounds for tank, shell, and scenario JSON before simulation starts.
- Validation is intentionally lightweight and local. It does not yet enforce historical correctness, cross-file compatibility beyond lookup by id, or non-overlap/fit checks between authored internal volumes.
- Fragment occlusion, armor breakup, target shielding, and true blast pressure are still simplified away. The model remains seeded heuristics over rotated box targets, not a full physics solver.
