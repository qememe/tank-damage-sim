# Testing

## Commands used on 2026-03-11
- `npm run typecheck`
- `npm run build`
- `npm --workspace @tank-sim/sim-core run simulate -- ../../data/scenarios/ap_front_plate.json ../../data/results/ap_front_plate.result.json`
- `npm --workspace @tank-sim/sim-core run simulate -- ../../data/scenarios/miss_test.json ../../data/results/miss_test.result.json`

## Validated cases
- `ap_front_plate.json` produced `penetration`, hit `hull_front`, generated fragment paths, destroyed `ammo_rack`, and damaged `driver`.
- `miss_test.json` produced `miss` with no armor hit, no fragments, and a matching debug report.

## Expected artifacts
- result JSON
- optional debug log

## Current gaps
- No automated tests yet.
- No validation fixture for ricochet or non-penetration yet.
- `allowFuseFailure` is present in scenario input but not exercised by the current sim-core logic.
