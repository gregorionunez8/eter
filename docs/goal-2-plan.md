# Éter Goal #2 — implementation and acceptance plan

Status: complete and verified on 2026-10-06. Goal #1 remains the preserved baseline. Final evidence and limits are recorded in `verification.md`; the sequence below records the completed plan.

## Constraints

Keep Three.js/Vite, authoritative Node HTTP/WebSocket simulation, SQLite, authentication, progression, hybrid equipment, loot ownership, NPC services and centralized validated configuration. No Goal #3 systems. Do not promote the owner's account automatically.

## Implementation sequence

1. Re-run baseline server and browser suites. Record results before gameplay changes.
2. Replace `armor` equipment slot with `chest`, preserving item definition IDs and migrating stored character JSON transactionally. Test reopen/idempotence and item preservation.
3. Establish reusable original materials, articulated heroic character rigs and equipment visuals.
4. Rebuild Aurelia architecture/monument/props and region-specific terrain/vegetation/ruins without changing authoritative collision footprints.
5. Distinct articulated monster families; server-driven animations and reactions.
6. Refine lighting, camera, picking, combat feedback, twelve skills, projectiles and physical loot.
7. Original icons and game UI: HUD, bags/paper doll/tooltips, stats, shops/Sanctum, entry and character selection.
8. Structured admin content editors with bounded validation, spot CRUD, player tools and audit records. Retain advanced raw configuration.
9. Regression, browser gameplay pass, performance metrics and actual screenshot review. Iterate on visual shortcomings.
10. Update design, README, progress, verification and asset credits with demonstrated results.

## Evidence required

Run `npm.cmd test` and `npm.cmd run test:e2e`; production build. Inspect login, selection, Aurelia day/night, Greenfields, Whisperwood, Stonepass, Ether Ruins, all three classes, all monster families, inventory/equipment/stats, NPC shops/Sanctum and structured admin. Measure render calls/frame timing under existing multiplayer workload; inspect console and resource disposal.

Completion requires both functional evidence and screenshots that convincingly read as an original classic fantasy PC MMORPG. Code presence alone does not satisfy visual acceptance.
