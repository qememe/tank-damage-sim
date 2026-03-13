# Testing

## Commands used on 2026-03-13
- `npm run beta:refresh`
- `npm run typecheck`
- `npm run build`
- `npm --workspace @tank-sim/dev-viewer run typecheck`
- `npm --workspace @tank-sim/dev-viewer run build`

## Commands used on 2026-03-12
- `npm run typecheck`
- `npm run build`
- `for scenario in data/scenarios/*.json; do stem=$(basename "$scenario" .json); npm --workspace @tank-sim/sim-core run simulate -- "../../$scenario" "../../data/results/${stem}.result.json" "../../data/results/${stem}.result.debug.json"; done`

## Commands used on 2026-03-11
- `npm install`
- `npm --workspace @tank-sim/dev-viewer run typecheck`
- `npm --workspace @tank-sim/dev-viewer run build`
- `npm run typecheck`
- `npm run build`
- `npm --workspace @tank-sim/sim-core run simulate -- ../../data/scenarios/ap_front_plate.json ../../data/results/ap_front_plate.result.json`
- `npm --workspace @tank-sim/sim-core run simulate -- ../../data/scenarios/miss_test.json ../../data/results/miss_test.result.json`

## Validated cases
- `beta_a_ap75_frontal_penetration.json` produced `penetration`, hit `hull_front` at `19.948 deg`, defeated `87.234 mm` effective armor, destroyed `transmission`, and incapacitated `driver`.
- `beta_a_ap75_glacis_ricochet.json` produced `ricochet`, hit `hull_front` at `71.248 deg`, and emitted AP ricochet surface damage without any internal hits.
- `beta_a_ap75_right_side_module_damage.json` produced `penetration`, hit `hull_side_right` at `0 deg`, and destroyed `fuel_tank` plus `engine` without any crew casualty.
- `beta_a_ap88_turret_crew_knockout.json` produced `penetration`, hit `turret_front` at `9.936 deg`, and incapacitated `gunner` without recording ammo-rack damage.
- `beta_a_he75_driver_hatch_detonation.json` produced `detonation`, hit `driver_hatch`, armed the fuse because projected resistance reached `32.9 mm`, and damaged both `driver` and `transmission`.
- `beta_a_he75_glacis_fuse_failure.json` produced `fuse_failure`, hit `hull_front` at `71.248 deg`, and stopped because projected resistance fell to `26.361 mm`, below the shell's `30 mm` fuse sensitivity.
- `beta_b_ap75_frontal_no_penetration.json` produced `no_penetration`, hit `upper_glacis` at `34.004 deg`, and fell short of Tank B's `114.596 mm` effective frontal armor.
- `beta_a_ap75_rear_engine_damage.json` produced `penetration`, hit `rear_plate` at `0 deg`, and destroyed `engine` from the rear with no crew casualty.
- `beta_a_ap75_frontal_long_range_no_penetration.json` produced `no_penetration`, hit `hull_front` at `19.948 deg`, and stopped because range-adjusted AP penetration fell to `80.5 mm`, below the plate's `87.234 mm` effective armor.
- `beta_b_ap88_roof_crew_knockout.json` produced `penetration`, hit `casemate_roof` at `0 deg`, and incapacitated `gunner` through the roof while also damaging `gun_breech`.
- `beta_b_he105_right_side_blast.json` produced `detonation`, hit `hull_side_right` at `0 deg`, armed the heavier HE fuse, and destroyed `ammo_rack_right` on Tank B's weak side.
- The curated beta pack now gives one clean A vs B front comparison with the same baseline `ap_75mm` family: Tank A's front case penetrates while Tank B's front case does not.
- The curated beta pack now also gives one explicit short-vs-long-range comparison on Tank A with the same `ap_75mm` shell family: `120 m` penetrates while `950 m` does not.

## Expected artifacts
- result JSON
- optional debug log

## Current gaps
- No automated tests yet.
- HE damage remains heuristic rather than a true pressure, fragmentation-mass, or shielding model.
- AP continuation is still limited to one reduced-energy follow-through for core fragments.
- Runtime validation does not check whether authored internal volumes overlap unrealistically or whether the content is historically accurate.
- The beta pack still lacks a dedicated curated miss case and any historically researched vehicle/shell data.
- Primitive exteriors remain viewer-only boxes/cylinders and do not participate in hit resolution.

## Viewer validation
- Startup target: launch the dev viewer, confirm it auto-loads the default curated scenario from `beta-content.manifest.json`, and verify the panel opens on the beta intro plus grouped scenario browser instead of requiring manual file selection.
- Default reset target: switch to another curated case or the bundled beta fallback, click `Reset to default scenario`, and confirm the viewer returns to `beta_a_ap75_frontal_penetration`.
- Best showcase target: use the `Best Showcase` quick-access strip and confirm featured scenarios load without needing to scan the full grouped list.
- Curated launcher target: click at least one scenario in each major category (`AP penetration`, `AP ricochet / no penetration`, `HE detonation`, `HE fuse failure`, `module damage`, `crew knockout`, `comparison cases`) and confirm each click swaps both the result replay and the matching tank automatically.
- Debug inspector target: for a curated scenario with linked debug JSON, open the `Debug Inspector` details and confirm hit context, fuse status, damage summary, fragment generation summary, and surface-damage summary read cleanly without exposing raw JSON by default.
- Session panel target: after selecting a curated scenario, confirm the session block shows the linked scenario/result/tank/debug filenames and the expected tank/shell names without extra file picking.
- Manual fallback target: load a custom result JSON and tank JSON through the manual file inputs after using the curated browser and confirm playback, labels, legend, visibility toggles, and x-ray mode still work.
- Manual check target for the current beta slice: load a result JSON and matching tank JSON, confirm the hit armor zone highlights, impact and damage-origin markers appear when present, damaged module/crew boxes switch to their damage colors, and the event list follows the current scrubber position.
- Manual Tank A comparison target: load `beta_a_ap75_frontal_penetration.result.json` and `beta_a_ap75_glacis_ricochet.result.json` with `data/tanks/test_tank_a.json` to compare a clean penetration versus a front-glacis ricochet on the same vehicle.
- Manual HE comparison target: load `beta_a_he75_driver_hatch_detonation.result.json` and `beta_a_he75_glacis_fuse_failure.result.json` with `data/tanks/test_tank_a.json` and confirm the panel exposes different fuse states, fragment counts, and surface-damage marker sets.
- Manual A vs B comparison target: load `beta_a_ap75_frontal_penetration.result.json` with `data/tanks/test_tank_a.json` and `beta_b_ap75_frontal_no_penetration.result.json` with `data/tanks/test_tank_b.json` to confirm the baseline AP shell penetrates Tank A but fails on Tank B's front.
- Manual range comparison target: load `beta_a_ap75_frontal_penetration.result.json` and `beta_a_ap75_frontal_long_range_no_penetration.result.json` with `data/tanks/test_tank_a.json` to confirm the same shell family flips outcome when the authored engagement range increases.
- Manual roof/rear target: load `beta_b_ap88_roof_crew_knockout.result.json` with `data/tanks/test_tank_b.json` and `beta_a_ap75_rear_engine_damage.result.json` with `data/tanks/test_tank_a.json` to confirm the new beta pack covers roof-entry and rear-entry vulnerability stories.
- Manual side-damage target: load `beta_a_ap75_right_side_module_damage.result.json` or `beta_b_he105_right_side_blast.result.json` and confirm the damaged module boxes line up with the right-side impact path and differ between AP and HE.
- Current note: Vite reports a large chunk warning for the dev-viewer bundle, but this is only a warning and does not block the build.
