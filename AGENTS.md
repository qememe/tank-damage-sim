# Project: Tank Damage Simulator

## Goal
We are building a desktop-first browser-based sandbox for realistic WWII tank damage simulation.

Current milestone:
- build a simulation core first
- input: scenario JSON
- output: result JSON + debug report
- simple dev viewer for replay, camera, time control, and inspection

## Tech defaults
- TypeScript everywhere for the first prototype
- Node.js for sim-core
- React + TypeScript + Three.js / React Three Fiber for dev-viewer
- JSON-based data definitions
- Keep architecture modular and easy to migrate later to Rust/WASM if needed

## Repository rules
- Do not add unnecessary frameworks
- Prefer simple, explicit code over abstraction-heavy code
- Keep each package focused
- Do not break the JSON pipeline
- Never hide simulation logic inside UI components
- Shared types must live in packages/shared

## Documentation rules
After every meaningful change, update docs:
- append a dated entry to `docs/changelog.md`
- update `docs/architecture.md` if structure changed
- update `docs/decisions.md` if a technical decision was made
- explain what changed, why it changed, and what remains unfinished

Even for small changes, write a short note in changelog.

## Working style
When implementing features:
1. explain the plan briefly
2. make the smallest workable version first
3. run or describe validation steps
4. update docs
5. summarize changed files

## Simulation scope for now
First prototype supports:
- 2 tanks max
- 2 shell types max: AP and HE
- ray-based hit selection
- basic impact angle calculation
- effective armor calculation
- ricochet check
- penetration / no penetration result
- simple fragment/spall generation
- damage to crew and modules
- event log for replay
- result JSON for viewer

## File conventions
- `data/tanks/*.json` for tank definitions
- `data/shells/*.json` for shell definitions
- `data/scenarios/*.json` for scenario inputs
- `data/results/*.json` for generated outputs

## Viewer scope for now
The viewer is a dev tool, not a final game UI.
It must support:
- load result JSON
- orbit/free camera
- time scrubber
- pause/play
- speed control
- shell path and fragment path visualization
- basic x-ray or transparency mode later

## Quality bar
Do not pretend features are complete if they are stubbed.
Mark placeholders clearly.
Prefer working ugly prototype over fake completeness.

## Docs and current references
If work touches OpenAI API, Codex, Apps SDK, MCP, or OpenAI platform integration:
Always use the OpenAI developer documentation MCP server instead of memory.

## Reviews
When asked to review, check:
- architecture consistency
- type safety
- JSON schema clarity
- debugability
- whether docs were updated