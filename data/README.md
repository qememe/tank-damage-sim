# Data Pack

## Beta browser manifest
- `beta-content.manifest.json` is the lightweight viewer-facing index for the curated beta browser.
- It groups showcase scenarios into readable categories, marks featured comparison cases, and links each scenario to its matching tank, result, and optional debug JSON.
- The raw simulation pipeline remains unchanged: scenario inputs still live in `data/scenarios`, results in `data/results`, tanks in `data/tanks`, and shells in `data/shells`.

## Tanks
- `test_tank_a` — primary showcase medium tank with a readable weak driver hatch, balanced glacis, and a turret layout that supports crew-focused AP cases.
- `test_tank_b` — low casemate assault gun with a tougher frontal package than Tank A and a weaker right side that exposes fuel and reserve ammunition.

## Shells
- `ap_75mm` — baseline AP round for the A vs B frontal comparison, most side-penetration checks, and the new short-vs-long-range frontal contrast on Tank A. It now carries a simple authored penetration falloff so range changes can alter the outcome meaningfully inside the beta pack.
- `ap_88mm` — stronger AP round for crew-focused turret penetrations, tougher front plates, and the new top-down roof-entry showcase.
- `he_75mm` — lighter HE round for hatch detonation and fuse-failure contrast cases.
- `he_105mm` — heavier HE round for short-range side-blast showcase scenarios.

## Scenario naming
- Scenario files use `beta_<tank>_<shell>_<target>_<outcome>.json`.
- Generated artifacts reuse the same stem in `data/results/<stem>.result.json` and `data/results/<stem>.result.debug.json`.

## Curated beta scenarios
- `beta_a_ap75_frontal_penetration` — baseline AP front hit on Tank A.
- `beta_a_ap75_glacis_ricochet` — shallow AP front hit on Tank A.
- `beta_a_ap75_frontal_long_range_no_penetration` — long-range version of the Tank A frontal AP baseline where the same shell family now stops on the glacis.
- `beta_a_he75_driver_hatch_detonation` — vulnerable-area HE detonation on Tank A.
- `beta_a_he75_glacis_fuse_failure` — HE fuse failure on Tank A's stronger glacis.
- `beta_a_ap75_right_side_module_damage` — AP side hit on Tank A that is intended to cut through modules.
- `beta_a_ap75_rear_engine_damage` — AP rear hit on Tank A that runs directly into the engine bay.
- `beta_a_ap88_turret_crew_knockout` — stronger AP shot on Tank A's turret intended to incapacitate crew without centering on the ammo rack.
- `beta_b_ap75_frontal_no_penetration` — Tank B frontal comparison case against the same baseline AP family.
- `beta_b_ap88_roof_crew_knockout` — top-down AP entry through Tank B's thin casemate roof.
- `beta_b_he105_right_side_blast` — heavier HE side-blast case on Tank B's weak side.

## Regression command
- `npm run beta:refresh` reads `data/beta-content.manifest.json`, runs sim-core across every curated beta scenario listed there, refreshes the matching result/debug files in `data/results`, and fails clearly if any scenario cannot be simulated.
