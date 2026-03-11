# Tank Damage Simulator

A browser-based sandbox project for realistic WWII tank damage simulation.

## Current status
Prototype stage.

## Planned pipeline
- input: scenario JSON
- simulation core runs impact and post-penetration logic
- output: result JSON + debug data
- dev viewer loads result JSON for replay and inspection

## Repository structure
- `packages/shared` — shared types and schemas
- `packages/sim-core` — simulation core
- `packages/dev-viewer` — simple result viewer
- `data` — tank, shell, scenario, and result files
- `docs` — architecture, decisions, changelog, testing, roadmap
