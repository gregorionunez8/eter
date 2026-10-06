# Goal #2 — architecture and content guide

Goal #2 is complete and verified on 2026-10-06: 30 server tests, 10 production Chrome scenarios and the final screenshot review. Goal #1's authoritative simulation and persistence remain the foundation. See `verification.md` for measured results and limits.

## Visual architecture

`client/materials.ts` creates deterministic original surface maps at 256px and a 1024px blended world terrain map. A generated original six-surface atlas adds weathered cobble, masonry, wood, slate, grass and earth detail; the compressed atlas is approximately 807 KB, and does not add mesh complexity. Maps share canvases, and all repeated textures receive an upload update after artwork loading. Disposed libraries ignore pending image callbacks. Materials use roughness, metalness and inexpensive bump mapping. `environment.ts` authors buildings within authoritative footprints, carved fountains, the Éter armillary, NPC work props, trees and region details. Large collision objects belong in `shared/world.ts`; do not add invisible client-only barriers. Low grass, flowers and ground litter remain decorative.

`character-art.ts` loads selected CC0 Quaternius anatomy/clothing exports, retains head surfaces and smooth authored clothing weights, bakes a neutral downward-arm pose and rebuilds world-aligned pivots for Éter's animation/equipment code. Sources and immutable body rigs are cached by class/palette/render mode across joins; actors own cloned geometry and skeletons. Scene-specific procedural attachments are created fresh, so cached rigs never retain a disposed scene's materials. The glTF loader is a lazy chunk. Color maps are 1024px JPEG, normal/packed maps 512px PNG; `scripts/optimize-character-textures.ps1` records optimization. The selected assets total approximately 13 MB, not the full authoring archives. Sources/licenses are in `ASSET_CREDITS.md`.

`actors.ts` authors additional armor/weapons, original nonhuman monster families, joints and server-driven motion. Procedural geometry uses rigid-weight `SkinnedMesh` batches; vertex colors preserve tints while one material per surface reduces draws. Weapons and wearables attach to joints, and an equipment signature prevents unnecessary rebuilding. Knees/elbows, attack/cast poses, recoil and death use presentation time; server cooldowns and damage are unchanged. Add an appearance to `ActorFactory.monster` when adding a new monster definition. The procedural human builder remains an internal fallback; normal successful loading uses authored anatomy/clothing.

`effects.ts` consumes additive server effects with source/target/skill identity. Projectiles originate from hands and expire after impact or target removal. Damage numbers follow projected world coordinates. Active effects and numbers are capped at 100 and 35, and geometry/materials are disposed on expiration. Player death can leave a short cosmetic corpse while the authoritative player returns to the city. `loot.ts` caches original item icon textures by definition and presents currencies distinctly. Pickup and reward rules remain server-owned.

The additive `stop` command contains no coordinates or rewards. It clears the authoritative path/target/pending skill without changing position. NPC and loot interactions send it when they reach interaction range, preventing drift while a shop or pickup opens. New clicks cancel old client interaction intents. Movement/attack commands remain compatible.

The main scene merges static scenery, shares materials, instances grass and contact shadows, and uses one directional shadow map and one meaningful crystal light. PMREM provides restrained ambient reflections. Preview renderers, skeleton textures, effects, maps and GPU contexts are disposed on leaving a screen. Software rendering disables shadows/bump/reflections and imported normal/ORM maps, lowers pixel ratio to 0.65 and caps world rendering at 20 FPS; snapshots keep their independent server rate. No per-grass-blade draws or hundreds of lights. The default orthographic half-height is 14, with wheel limits 12–26. Narrow grass blades use a softly lit shared material; ground maps retain textured variation. Wolves use original longitudinal anatomical profiles, a tapered muzzle/tail and dark dorsal/light lower-coat coloring.

`overhaul.css`, `icons.ts`, `item-ui.ts` and `character-sheet.ts` separate game presentation from commands. Inventory cells remain 36px so existing multi-cell drag/drop behavior and server validation remain consistent. Login art is an original generated painting, not a screenshot or substitute for world quality. Asset provenance is in `ASSET_CREDITS.md`.

`audio.ts` supplies optional original synthesized foley and restrained ambient noise. Region music accepts licensed URLs via `setRegionTracks`; no placeholder music loops are supplied. Store commercial-use licenses before adding tracks.

## Administration

Register normally, then explicitly promote the desired account with `npm.cmd run admin -- username`, using the same `DATABASE_PATH` as the game. No account is promoted automatically. Promotion needs no server restart. Open `/admin`; anonymous/non-admin requests receive 403.

Select a section, edit fields, then save the complete draft. Bounded Zod validation checks references, duplicate IDs, spot safety, NPC/spawn walkability and compatibility with owned item sizes/slots. Valid drafts persist in `settings.content`; restart to apply all content together. Changing tabs retains drafts; leaving warns about unsaved edits. Raw Config uses the same validation. Player actions apply immediately to connected characters, while Players can inspect offline persisted characters too. Signed resource adjustments reject insufficient funds and enter the resource ledger; successful admin actions enter `admin_actions` with input/before/after data.

### Balance and farming spots

Balance edits level cap, points, XP curve, movement, ownership and death loss. Economy edits global drop chances, prices, repair and potion values; monster-specific chances can inherit global values. World edits day/night duration and spawn. Resets edits cap and permanent point bonus. Defaults remain in `shared/content.ts`; saved overrides prevail.

Spots supports create, duplicate, disable and delete. Pick a known monster and region, X/Z, count, radius and respawn interval. Spots cannot overlap the city or leave the map. IDs stay stable. Disabled spots create no monsters after restart; deleted spots do not reappear during config upgrade. Keep open paths and a short clear interval between kills and gradual respawns. The map coordinate system is shared with the minimap.

### Monsters, skills, items and shops

Monsters edits names, level, stats, speed, attack interval/range, aggro mode/radius, chase/leash and drop tables. Passive monsters still retaliate. Fixed existing IDs cannot be replaced in the editor because saves and visuals reference them. To add a family, add its definition to `shared/content.ts`, its rig to `actors.ts`, its icon if needed, then a spot; restart and test with the admin spawn action.

Skills edits names, class, multiplier, mana, cooldown, range/radius and applicable duration/slow. Preserve four skills per class and required buff durations. Presentation branches use the skill ID, while the authoritative kind remains code-defined. New mechanics belong in server logic and protocol validation, not the editor.

Items edits names, price, dimensions, slot, requirements, affinity, damage/defense, durability, quality, set family and drop eligibility. Add new definitions in `shared/content.ts`, select their shop/drop eligibility and create icons/visible gear appropriate to the category. Existing version-two configs receive new code-defined items without losing old overrides. Owned items cannot change dimensions/slot through config edits. Starter potion packing follows configured dimensions; configurations that cannot fit all initial consumables are rejected. `armor` migrated to `chest` transactionally; keep existing item IDs. In a mixed imported save, a second distinct legacy chest goes to Sanctum; a full Sanctum aborts instead of deleting gear.

Optional properties (flat/percentage modifiers, Luck, affinity and granted skill) have bounded fields under Items. New instances copy the definition's reserved properties and tooltips display them explicitly as future metadata. Existing instances keep their rolls. These fields do not activate new critical, Luck, upgrade or skill-unlock formulas in Goal #2; the starter skill set remains unchanged.

The last applied item layout is recorded in `settings.content.appliedLayouts`. Restart compares a pending layout with that manifest, so legitimate resized items survive reopening. If an item was acquired using the old layout after a pending resize was saved, startup rejects that incompatible resize instead of corrupting bags. Apply size/slot changes with an immediate restart; revert the pending change from a backup if this protection trips.

NPCs / Shops edits names, role text, position, dialogue and item catalog. Item prices live in Items and the economy multiplier. Existing service IDs retain repair, Sanctum, travel and reset behavior; role text does not assign new engine services. New NPC mechanics require code, not an arbitrary JSON function.

## Reproducible checks

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd start
```

Open `http://127.0.0.1:3000`. Browser tests use production, isolated databases, and Chrome; the visual fixture has accelerated day/night and guaranteed Éter solely for capture. Main accounts and admin flags remain untouched. `/?diagnostics=1` exposes read-only render/memory/animation counters. Artifacts and metrics go to ignored `test-results/`; see `docs/verification.md` for the actual execution status and limitations.
