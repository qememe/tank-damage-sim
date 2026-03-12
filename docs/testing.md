# Testing

## Commands used on 2026-03-12
- `npm --workspace @tank-sim/shared run build`
- `npm --workspace @tank-sim/dev-viewer run typecheck`
- `npm --workspace @tank-sim/dev-viewer run build`
- `npm run typecheck`
- `npm run build`
- `npm --workspace @tank-sim/sim-core run simulate -- ../../data/scenarios/ap_front_plate.json ../../data/results/ap_front_plate.result.json ../../data/results/ap_front_plate.result.debug.json`
- `npm --workspace @tank-sim/sim-core run simulate -- ../../data/scenarios/he_driver_hatch.json ../../data/results/he_driver_hatch.result.json ../../data/results/he_driver_hatch.result.debug.json`
- `npm --workspace @tank-sim/sim-core run simulate -- ../../data/scenarios/he_front_plate_no_fuse.json ../../data/results/he_front_plate_no_fuse.result.json ../../data/results/he_front_plate_no_fuse.result.debug.json`
- `npm --workspace @tank-sim/sim-core run simulate -- ../../data/scenarios/miss_test.json ../../data/results/miss_test.result.json ../../data/results/miss_test.result.debug.json`

## Commands used on 2026-03-11
- `npm install`
- `npm --workspace @tank-sim/dev-viewer run typecheck`
- `npm --workspace @tank-sim/dev-viewer run build`
- `npm run typecheck`
- `npm run build`
- `npm --workspace @tank-sim/sim-core run simulate -- ../../data/scenarios/ap_front_plate.json ../../data/results/ap_front_plate.result.json`
- `npm --workspace @tank-sim/sim-core run simulate -- ../../data/scenarios/miss_test.json ../../data/results/miss_test.result.json`

## Validated cases
- `ap_front_plate.json` produced `penetration`, hit `hull_front`, generated fragment paths, destroyed `ammo_rack`, and damaged `driver`.
- `ap_front_plate.json` now also emits AP `surfaceDamage` markers for an exterior impact mark, penetration hole, and interior spall exit.
- `miss_test.json` produced `miss` with no armor hit, no fragments, and a matching debug report.
- `he_driver_hatch.json` produced `detonation`, hit the authored `driver_hatch`, armed the HE fuse at normal incidence, emitted a shallow HE fragment fan, and heavily damaged `driver`.
- `he_driver_hatch.json` now also emits HE `surfaceDamage` markers for an exterior detonation scorch and a shallow breach marker on the vulnerable hatch.
- `he_front_plate_no_fuse.json` produced `fuse_failure`, hit `hull_front` at a glancing angle, and stopped before any HE fragment generation because the projected resistance stayed below authored fuse sensitivity.
- `he_front_plate_no_fuse.json` now also emits a single HE dent marker so the viewer can distinguish fuse failure from a clean miss.

## Expected artifacts
- result JSON
- optional debug log

## Current gaps
- No automated tests yet.
- No validation fixture for ricochet or non-penetration yet.
- `allowFuseFailure` is now exercised only by the prototype HE branch.
- HE damage is still a deterministic forward cone rather than a true omnidirectional blast or fragment mass model.
- Repeated fragments can stack damage on the same crew/module AABB when multiple rays intersect the same target.
- Surface damage markers are not yet timestamped independently from the event log, so the viewer currently reveals them after the first armor-hit event instead of with per-marker timing.
- Primitive external hull geometry is still limited to authored boxes and cylinders, so more distinctive tank silhouettes will need additional primitives or a later mesh pipeline.

## Viewer validation
- `npm install` completed after fixing the React / React Three Fiber version mismatch in `packages/dev-viewer/package.json`.
- `npm --workspace @tank-sim/dev-viewer run typecheck` now passes with the current source and tsconfig.
- `npm --workspace @tank-sim/dev-viewer run build` now passes and emits the viewer bundle after wiring `index.html` to `src/main.tsx`.
- Manual check target for the current viewer pass: load a result JSON and matching tank JSON, confirm the hit armor zone highlights, impact and damage-origin markers appear when present, damaged module/crew boxes switch to their damage colors, and the event list follows the current scrubber position.
- Manual HE check target: load `he_driver_hatch.result.json` or `he_front_plate_no_fuse.result.json` with the matching tank JSON and confirm the panel exposes shell type, fuse status, impact angle, event count, fragment count, and the current event label while scrubbing.
- Manual surface-damage check target: confirm AP penetration shows an exterior ring + hole + interior spall marker, HE detonation shows a scorch plus shallow breach on the hatch case, and HE fuse failure shows only a dent/impact marker without fragment geometry.
- Manual exterior-shell check target: load the sample tank or `data/tanks/test_tank_a.json`, confirm the outer shell reads as a tank in normal view, toggle `External hull` off to inspect the original debug boxes alone, toggle `X-ray mode` on to make armor/modules/crew readable through the shell, and confirm surface-damage markers remain visible on top of the shell.
- Current note: Vite reports a large chunk warning for the dev-viewer bundle, but this is only a warning and does not block the build.
