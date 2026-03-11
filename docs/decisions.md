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
