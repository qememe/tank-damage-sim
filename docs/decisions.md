# Technical Decisions

## 2026-03-11 — TypeScript-first prototype
We start with TypeScript for all packages to maximize speed of development and simplify shared types.
Rust/WASM is postponed until the simulation core proves its shape and bottlenecks.

## 2026-03-11 — File-based pipeline first
The first prototype uses:
- scenario.json as input
- result.json as output

This keeps the engine independent from the UI and makes manual testing easy.

## 2026-03-11 — Lightweight monorepo bootstrap
The repository uses npm workspaces with one root TypeScript configuration and three focused packages:
- `packages/shared`
- `packages/sim-core`
- `packages/dev-viewer`

We intentionally avoid additional build frameworks at this stage.
This keeps package boundaries explicit, preserves the JSON pipeline, and leaves room to replace parts of the stack later if the simulation core moves to Rust/WASM.

## 2026-03-11 — Use npm-compatible local workspace versions instead of `workspace:*`
The monorepo stays on npm workspaces.
Local package dependencies now use the matching package version string `0.1.0` instead of `workspace:*`.

Why:
- `npm install` in this environment failed with `EUNSUPPORTEDPROTOCOL` on `workspace:*`.
- The root workspace configuration itself was valid, so rewriting the repo or changing package managers was unnecessary.

What changed:
- `packages/sim-core` and `packages/dev-viewer` now depend on `@tank-sim/shared` via `0.1.0`.
- Installation is expected from the repository root with `npm install`, which lets npm link the local workspaces correctly and generate a standard `package-lock.json`.

Tradeoff:
- The repo remains npm-native and simple, but package versions must stay aligned when local workspace dependencies change.

## 2026-03-11 — Split shared schemas by simulation domain
The shared contract package now uses separate source files for math primitives, tank definitions, shell definitions, scenario input, and simulation result output.

Why:
- The placeholder single-file contract mixed unrelated concerns and would get harder to maintain as the simulation core and viewer start consuming more of the JSON pipeline.
- Domain-split files keep authored data, runtime inputs, and result payloads explicit without adding frameworks or complex schema tooling.

What changed:
- `packages/shared/src/math.ts` defines `Vec3`, `Ray`, and `AABB`.
- `packages/shared/src/tank.ts`, `shell.ts`, `scenario.ts`, and `result.ts` define the first minimal JSON contracts for authored data and simulation I/O.
- `packages/shared/src/index.ts` now re-exports those contracts as the public package surface.

Tradeoff:
- The types are intentionally compile-time only for now, so malformed JSON is still possible until runtime validation is added later in sim-core or a dedicated validation layer.

## 2026-03-11 — Use coarse AABB volumes for the first executable sim-core pass
The first working simulation core resolves armor, module, and crew hits with explicit axis-aligned bounding boxes instead of meshes, rotated plates, or a physics engine.

Why:
- The milestone is to prove the JSON-driven pipeline and outcome flow first, not to finalize geometry fidelity.
- AABB intersection is simple, deterministic, easy to debug in JSON, and keeps the implementation small enough to validate quickly.
- The authored tank schema already provides position and size values for armor zones and modules, which makes AABB-based loading immediate.

What changed:
- Armor hit selection now uses the first ray/AABB intersection across authored armor zones.
- Internal damage now uses fragment ray checks against module AABBs and a fixed fallback AABB size for crew.
- The debug report records the chosen armor zone, impact angle, effective armor, penetration value, ricochet state, and final reason.

Tradeoff:
- Rotated armor, curved surfaces, exact crew silhouettes, and true internal occlusion are not modeled yet.
- Crew size is not authored in the shared schema, so the current fallback crew box is a deliberate approximation until the schema grows.

## 2026-03-11 — Viewer timeline uses event-based heuristics
The dev viewer animates shell trajectories and fragment lines using the `SimulationEvent.t` timestamps because the current result schema does not publish explicit durations for those paths.
Why:
- The shell path and fragment data arrive as positional traces without an attached clock, so we needed a simple rule to keep the UI responsive without inventing new schema fields.
What changed:
- The viewer derives the timeline end from the latest event (minimum 0.1 s to keep the slider usable).
- Shell visibility is interpolated by the ratio of the current time to the timeline length, and fragment lines appear progressively after the first `internal_damage` event that mentions each fragment.
- Event markers only show once their `t` value has passed, keeping the visualization in sync with the timeline.
Tradeoff:
- This heuristic will drift if future result schemas add independently-timed fragments or multiple overlapping events; we can revisit once the schema explicitly encodes path durations or per-fragment timing metadata.

## 2026-03-12 — Prototype HE uses fuse arming from projected armor resistance
The first HE pass does not reuse AP penetration logic. Instead it checks whether the HE fuse arms from the armor resistance projected onto the impact normal, then branches into `detonation` or `fuse_failure`.

Why:
- We needed the first usable HE scenario to behave observably differently from AP without replacing the AABB-first architecture.
- Fuse behavior had to depend on both armor geometry and authored shell data, and the existing `allowFuseFailure` scenario flag needed to become meaningful.
- A projected-resistance check is simple to explain in JSON/debug output and gives us a controllable failure case for glancing impacts.

What changed:
- `packages/sim-core/src/simulate.ts` now chooses an explicit AP or HE branch from `shell.type`.
- HE compares `armor thickness * cos(impact angle)` against `shell.fuseSensitivity` when `allowFuseFailure` is enabled.
- Armed HE rounds generate a shallow `damageOriginPoint` and a wider, shorter fragment fan instead of an AP-style deep penetration path.
- Results now expose lightweight `hitContext` metadata so the viewer or manual JSON inspection can see the impact geometry and fuse state directly.

Tradeoff:
- This is a prototype convenience model, not a realistic fuse or explosive simulation.
- It does not model fuse delay, shell breakup, overpressure, exterior splash, or a true fragment distribution.
- Because the model still uses coarse AABBs, multiple fragment rays can stack on the same internal target more aggressively than a refined future solver should allow.

## 2026-03-12 — Viewer inspection uses lightweight in-scene billboards plus panel metadata
The dev viewer now explains AP and HE results with small billboard labels inside the 3D scene and a richer right-side inspection panel instead of adding a heavier annotation/UI framework.

Why:
- The immediate problem was readability, not a lack of scene data. The result JSON already exposes hit context, damage lists, and events that the viewer can surface directly.
- We needed labels and markers that stay close to the authored AABB geometry while keeping the existing file-loading and playback flow intact.
- Avoiding a new UI or 3D helper dependency keeps the dev viewer easy to maintain during the prototype phase.

What changed:
- `packages/dev-viewer/src/viewer/SimulationScene.tsx` now renders billboard text sprites for armor zones, modules, crew, impact point, damage origin, impact normal, and the active event.
- `packages/dev-viewer/src/viewer/inspectionUtils.ts` resolves hit-zone labels, damaged target labels, impact/damage-origin fallbacks, and nearest-event selection from the loaded result+tank data.
- `packages/dev-viewer/src/components/ControlPanel.tsx` now shows loaded file names, shell/outcome/fuse/angle summary fields, damaged target lists, a legend, and an event list that highlights the current scrub position.

Tradeoff:
- Billboard labels are lightweight but can overlap when several authored boxes sit close together.
- The viewer still depends on event-time heuristics and coarse AABB placements, so the inspection layer improves readability more than physical fidelity.

## 2026-03-12 — Prototype armor damage stays as surface markers, not geometry edits
Visible armor damage is now represented as lightweight `surfaceDamage` markers in result JSON and rendered as oriented flat overlays in the dev viewer instead of attempting mesh cuts, CSG, or boolean geometry.

Why:
- The viewer needed to distinguish AP perforations, ricochets, dents, and HE scorch/breach states now, but the current milestone is still the simulation core and JSON pipeline, not geometric destruction.
- A small JSON-first marker schema is easy for sim-core to emit, easy for the viewer to render, and leaves the architecture compatible with a later Rust/WASM or mesh-based damage pass.
- The result had to stay debug-friendly and extensible without forcing a redesign of the existing event, fragment, or hit-context structures.

What changed:
- `packages/shared/src/result.ts` now exposes `SurfaceDamage`, `BreachVisual`, and `DamageDecalLikeMarker` types plus a `surfaceDamage` array on `SimulationResult`.
- `packages/sim-core/src/simulate.ts` emits outcome-specific AP/HE markers and a parallel `surfaceDamageLog` in the debug JSON that explains each heuristic.
- `packages/dev-viewer/src/viewer/SimulationScene.tsx` renders those markers as color-coded discs, rings, and scars aligned to the authored armor normal, and the control panel summarizes the emitted marker set.

Tradeoff:
- These markers are descriptive overlays only. They do not deform armor, remove material, or represent real hole geometry.
- Marker timing is still coarse because the result schema does not yet carry per-marker timestamps.
- HE shallow breach and AP spall visuals currently come from simple authored-thickness / penetration heuristics, not a physically rigorous breakup model.
