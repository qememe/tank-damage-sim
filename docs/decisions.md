# Technical Decisions

## 2026-03-13 — Keep curated beta regeneration manifest-driven and file-based
The curated beta pack now regenerates from `data/beta-content.manifest.json` through `npm run beta:refresh` instead of a hand-written shell loop.

Why:
- The launcher and the regression runner should operate over the same curated source of truth so the beta pack stays coherent during iteration.
- We needed a pre-commit-friendly command that refreshes every curated result/debug pair and fails clearly on broken authored scenarios without adding a test framework or backend.
- The project still favors explicit JSON files and small local tooling over heavier infrastructure.

What changed:
- `packages/sim-core/src/runBetaRegression.ts` reads the manifest, resolves each curated scenario path, and reruns sim-core across the pack.
- The root workspace now exposes the command as `npm run beta:refresh`.
- The manifest now carries the full 11-scenario curated beta pack, including new roof, rear, and long-range showcase cases.

Tradeoff:
- The manifest has become a more important piece of authored data. If it drifts from the actual files, both the launcher and the regression runner will be wrong in the same place.
- This is still refresh-and-inspect tooling, not a true automated assertion suite with semantic expectations.

## 2026-03-13 — Use authored per-shell penetration falloff for long-range beta contrast
AP shells can now opt into a simple `penetrationLossPer100m` field so the curated beta pack can include range-sensitive outcomes without rewriting the prototype ballistics model.

Why:
- The beta slice needed at least one longer-range case where the outcome changes meaningfully.
- The existing shell model used a fixed penetration number, so distance only affected timing and not the result.
- A tiny authored falloff rule keeps the change explicit, debuggable, and small enough for the prototype.

What changed:
- `packages/shared/src/shell.ts` and `packages/shared/src/validation.ts` now support optional `penetrationLossPer100m`.
- `packages/sim-core/src/simulate.ts` resolves range-adjusted penetration from the scenario distance before AP penetration/no-penetration decisions and writes the adjusted penetration into result/debug output.
- `data/shells/ap_75mm.json` and `data/shells/ap_88mm.json` now opt into simple falloff values, enabling the new `beta_a_ap75_frontal_long_range_no_penetration` showcase.

Tradeoff:
- This is still a prototype heuristic, not a real ballistic table or velocity-based armor penetration model.
- Only authored shells that opt in lose penetration with range; HE still behaves as before unless we decide to model it more deeply later.

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

## 2026-03-12 — Prototype tank exteriors use authored primitive shapes inside tank JSON
Recognizable tank silhouettes in the dev viewer now come from an optional `externalShapes` array on `TankDefinition` instead of a separate mesh asset workflow.

Why:
- The viewer needed an outer shell that reads as a tank immediately, but the milestone still forbids GLTF/OBJ loading and any heavier asset pipeline.
- Keeping the exterior description in tank JSON preserves the existing file-based workflow and keeps the authored viewer shell easy to diff, inspect, and migrate later.
- Separating exterior primitives from armor/module/crew hit volumes lets us improve readability without changing sim-core hit logic.

What changed:
- `packages/shared/src/tank.ts` now supports optional `box` and `cylinder` external shapes with JSON-friendly transforms and grouping metadata.
- `data/tanks/test_tank_a.json` and the bundled viewer sample now author a primitive hull, turret, barrel, and side guards from those shapes.
- `packages/dev-viewer` renders the exterior by default, adds an `External hull` visibility toggle, and uses an `X-ray mode` to fade the shell while keeping internal debug geometry visible.

Tradeoff:
- The exterior shell is decorative for now and does not participate in hit detection, armor solving, or damage deformation.
- Shape variety is intentionally small, so silhouettes are still coarse and not historically accurate.
- A future true low-poly tank workflow may replace or augment this JSON primitive layer with modeled meshes once the simulation contracts are stable.

## 2026-03-12 — Keep runtime JSON validation explicit and shared
Tank, shell, and scenario loading now use a small handwritten validator layer in `packages/shared/src/validation.ts` instead of adding a schema dependency.

Why:
- The prototype needed safer authored JSON immediately, especially clear failure messages for missing fields and invalid numbers, without introducing a second contract system or a heavy validation framework.
- Both sim-core and the viewer already depend on `packages/shared`, so putting the validators beside the types keeps the JSON contract close to the runtime checks.
- The project still favors simple, explicit code and a JSON-first workflow that can migrate later.

What changed:
- `packages/shared` now exports `validateTankDefinition`, `validateShellDefinition`, `validateScenarioInput`, and a `DataValidationError` that includes entity type, file path, field path, and reason.
- `packages/sim-core/src/io.ts` validates scenario, shell, and tank JSON during load before simulation starts.
- The validator checks required fields, enum values, duplicate ids, zero vectors, and practical numeric bounds for authored sizes, hp values, calibers, and other core fields.

Tradeoff:
- The validation rules are explicit and easy to debug, but they are still hand-maintained and must be updated when the schema changes.
- The current checks stay local to one JSON file at a time; they do not yet validate cross-file compatibility beyond lookup by id.

## 2026-03-12 — Crew hitboxes stay authored as optional box volumes for now
Crew members can now author their own hitbox `size` and optional `shapeKind`, but the first pass keeps the runtime shape model to axis-aligned boxes.

Why:
- The existing single fallback crew box made fragment hits too uniform and disconnected from the authored tank layout.
- The prototype needed better target fidelity immediately without replacing the coarse AABB-based sim architecture.
- Keeping the field optional preserves backward compatibility with older or incomplete tank JSON.

What changed:
- `packages/shared/src/tank.ts` now allows crew `size` and optional `shapeKind: "box"`.
- `packages/sim-core/src/simulate.ts` uses authored crew size for internal hit tests when present and only falls back to the legacy size otherwise.
- The sample tank data now defines seated hitbox sizes for commander, gunner, and driver, and the dev viewer renders those authored sizes too.

Tradeoff:
- Crew are still approximated as upright axis-aligned boxes, not capsules, skeletal poses, or rotated seated silhouettes.
- The optional `shapeKind` exists as a forward-compatibility hook, but only `box` is implemented today.

## 2026-03-12 — Keep fragment/spall modeling heuristic, seeded, and branch-specific
AP and HE internal damage now use different seeded fragment models instead of one shared flat fan of near-identical rays.

Why:
- The old internal damage pattern was too uniform, which made AP and HE feel too similar and made debug output less believable.
- We needed better post-impact variation while preserving the existing JSON-first pipeline, AABB target tests, and deterministic replay by seed.
- The prototype still does not justify a full physics or fragment-mass solver.

What changed:
- AP now generates a small group of forward-biased high-energy `core` fragments plus wider, weaker `spall` / `side` fragments.
- HE now generates a wider short-range `blast` cloud plus a smaller `spall` set, both scaled by `explosiveMassKg`.
- Core AP fragments can continue through one extra major interaction at reduced energy/reach; HE fragments stop after the first major interaction.
- Result JSON now carries optional per-fragment metadata (`sourceBranch`, `fragmentType`, `energy`, `reach`) and sim-core debug JSON now includes `fragmentGeneration` and `fragmentLog`.

Tradeoff:
- The model is more believable than the old uniform fan, but it is still heuristic. It does not solve fragment mass, armor breakup, blast pressure, or real target shielding.
- HE and AP branch differences are encoded by tuned rules and seeded jitter rather than empirical ballistics data.

## 2026-03-12 — Rotate authored hit volumes instead of forcing axis alignment
Armor zones, modules, and crew hitboxes now stay box-shaped, but they can carry optional Euler `rotationDeg` values and are resolved as oriented boxes in sim-core and the dev viewer.

Why:
- The previous axis-aligned limitation made frontal plates, breech blocks, and seated crew layouts look and behave less believable than the authored tank JSON already implied.
- We needed a minimal geometry upgrade that preserved the JSON-first pipeline, existing result format, and understandable prototype code without introducing meshes, CSG, or a physics engine.
- Transforming rays into local box space keeps the math small and debuggable while still giving us sloped-plate behavior for impact angle, effective armor, ricochet, and surface-damage orientation.

What changed:
- `packages/shared/src/tank.ts` now allows optional `rotationDeg` on `ArmorZone`, `ModuleDefinition`, and `CrewMember`, and `packages/shared/src/validation.ts` parses it as an optional `Vec3`.
- `packages/sim-core/src/math.ts` now transforms rays into each box's local space for intersection, and `packages/sim-core/src/simulate.ts` rotates authored armor normals before computing impact angle, effective armor, fuse checks, ricochet, and surface-damage markers.
- `packages/dev-viewer/src/viewer/SimulationScene.tsx` now renders armor/module/crew boxes with authored rotations and rotates label offsets with those same transforms.
- `data/tanks/test_tank_a.json` and the bundled viewer sample now include a sloped front hull/hatch and several angled internal hit volumes to exercise the new path.

Tradeoff:
- The runtime shape model is still box-only. Rotated boxes improve plausibility, but they do not represent wedges, curved cast armor, or cutout-heavy geometry.

## 2026-03-13 — Curated beta browser uses a lightweight local manifest over static `data/`
The dev viewer now presents the curated beta pack through a small manifest file and static asset fetches instead of requiring manual file pairing for normal use.

Why:
- The project needed the viewer to feel like a small beta product without adding a backend, router, database, or heavier content system.
- The existing `data/` pack already had the right raw JSON artifacts; the missing piece was a readable launcher index with categories, featured cases, and file links.
- Keeping the source of truth as authored JSON files preserves the existing scenario -> result/debug pipeline and keeps a later Rust/WASM migration uncomplicated.

What changed:
- `data/beta-content.manifest.json` now groups the curated scenarios into readable showcase categories and links each case to its scenario, result, debug, tank, and shell files.
- `packages/dev-viewer/vite.config.ts` now serves the repository `data/` directory as static public content so the browser can fetch the manifest and linked JSON artifacts directly.
- `packages/dev-viewer/src/content/betaContent.ts` provides a thin fetch/path layer, while the control panel uses the manifest to auto-load a default scenario and expose one-click curated switching.

Tradeoff:
- The manifest duplicates a small amount of viewer-facing metadata such as category labels and short scenario descriptions.
- This remains a local-static launcher, not a full content platform. There is still no live sim execution, persistence, or searchable content index.
- Euler-degree rotation is JSON-friendly and easy to author, but it can still produce overlapping or physically awkward layouts if the tank data is authored carelessly.
- This supersedes the strict axis-aligned part of the 2026-03-11 AABB decision while keeping the same box-first prototype boundary and avoiding a mesh collision system.

## 2026-03-12 — Curated beta content uses mirrored scenario/result stems
The first beta-oriented content slice now uses a small naming convention instead of ad hoc scenario fixture names.

Why:
- The old fixture set mixed one-off validation names with showcase intent, which made `data/scenarios` and `data/results` harder to scan once the pack grew beyond a few files.
- We needed a predictable way to pair scenario JSON, result JSON, and debug JSON while keeping the file-based workflow easy to inspect manually.
- A curated beta slice should read like a deliberate pack, not like leftover test artifacts.

What changed:
- Scenario files now use `beta_<tank>_<shell>_<target>_<outcome>.json`.
- Result and debug files mirror the scenario stem in `data/results/<stem>.result.json` and `data/results/<stem>.result.debug.json`.
- `data/README.md` documents the available tanks, shells, and scenario pack so the content is navigable without opening every JSON file.

Tradeoff:
- The convention is intentionally descriptive rather than minimal, so some file names are longer.
- The stems describe the intended showcase case, but they are still only as accurate as the authored scenario and should be validated against real sim output when content changes.
