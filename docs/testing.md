# Testing

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
- `miss_test.json` produced `miss` with no armor hit, no fragments, and a matching debug report.

## Expected artifacts
- result JSON
- optional debug log

## Current gaps
- No automated tests yet.
- No validation fixture for ricochet or non-penetration yet.
- `allowFuseFailure` is present in scenario input but not exercised by the current sim-core logic.

## Viewer validation
- `npm install` completed after fixing the React / React Three Fiber version mismatch in `packages/dev-viewer/package.json`.
- `npm --workspace @tank-sim/dev-viewer run typecheck` now passes with the current source and tsconfig.
- `npm --workspace @tank-sim/dev-viewer run build` now passes and emits the viewer bundle after wiring `index.html` to `src/main.tsx`.
- Current note: Vite reports a large chunk warning for the dev-viewer bundle, but this is only a warning and does not block the build.
