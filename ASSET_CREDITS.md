# Éter asset provenance

Goal #2 combines original project art with selected CC0 human anatomy and clothing. No proprietary MMORPG assets, maps, music, source code or character designs are imported.

| Asset | Creator/source | License / provenance |
| --- | --- | --- |
| `public/art/aurelia-entry.png` | OpenAI built-in imagegen, generated for this project on 2026-10-05 | Original generated artwork; no external asset license. Use subject to the applicable OpenAI service terms. |
| `public/art/material-atlas.jpg` | OpenAI built-in imagegen, generated for this project on 2026-10-06 | Original generated six-surface artwork. JPEG optimization only; sampled into 256px maps. Same applicable OpenAI service terms. |
| Procedural surface and foliage maps | Éter project, `client/materials.ts` | Original project source; deterministic canvas textures, no third-party images. |
| Human anatomy, eyes and eyebrows (`public/models/base`) | Quaternius, [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html), free Standard exports | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Male/female anatomy supplies the retained head surfaces; no nude body is presented in gameplay. |
| Textured male Ranger/Peasant and female Ranger clothing (`public/models/outfits`) | Quaternius, [Modular Character Outfits — Fantasy](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html), free Standard exports | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), commercial use allowed. Éter retargets smooth skin weights, combines its own armor/weapons and class presentation, and optimizes atlases. Paid Source assets are not used. |
| Character retargeting, armor additions, weapons and nonhuman monster families | Éter project, `client/character-art.ts` and `client/actors.ts` | Original adaptation code, gear geometry, animation and original procedural monsters. Rogue/Orc humanoids share the credited anatomy/clothing foundation. |
| Aurelia architecture, roof tiles, work areas, vegetation and props | Éter project, `client/environment.ts` | Original procedural geometry; authoritative footprints preserved. |
| Item, currency, skill and paper-doll illustrations | Éter project, `client/icons.ts` | Original hand-authored SVG paths and gradients; no icon pack, font-symbol assets or external illustrations. |
| Skill, impact, projectile, death and pickup effects | Éter project, `client/effects.ts` and `client/loot.ts` | Original geometry and bounded procedural effects. |
| Foley, footsteps, pickup cues and ambient sound | Éter project, `client/audio.ts` | Original Web Audio synthesis; no imported recordings or music. |
| Three.js room-based environment/reflection generator | Installed Three.js addon `RoomEnvironment` | Three.js MIT license, preserved in dependency package. Procedural environment only, no downloaded HDRI. |

The generated entry painting is atmospheric artwork, not a screenshot of the playable map. The live world must independently meet the visual acceptance criteria.

Selected upstream exports are included, not the 280 MB/122 MB authoring archives or unused outfits. Color atlases are capped at 1024px (JPEG quality 92), normal/packed maps at 512px (PNG). `scripts/optimize-character-textures.ps1` documents the conversion. Selected runtime models/maps total approximately 13 MB before HTTP compression; source export names and attribution are retained.

## Entry artwork prompt

Built-in imagegen (not API/CLI fallback), no reference images:

> Original fantasy PC MMORPG login background for Éter. Polished panoramic cinematic fantasy illustration, landscape 16:9. Aurelia is a welcoming believable medieval city at blue hour, with pale weathered stone, timber-framed buildings, slate and terracotta roofs, detailed cobbled lanes, market awnings, planters and warm window lights. Central landmark is an elegant modest floating elongated turquoise Éter crystal above a carved stone plinth, surrounded by a thin bronze armillary ring and subtle luminous runes. Grounded realistic scale, adventurous magical atmosphere, sophisticated classic fantasy MMORPG art with modern material detail, mountains and wooded wilderness beyond the city. Pedestrian-height elevated terrace overlooking the plaza. Detail mostly in the left and middle two thirds; quieter darker right third for login controls. Restrained teal, antique gold, natural stone and warm lamps. No people, lettering, UI, logo, watermark, proprietary game designs, cartoon, chibi or low-poly style.

The full generated source is retained locally under Codex generated images; the consumed asset is copied into the project's `public/art` directory.

## Material artwork prompt

Built-in imagegen, no reference images:

> Create ORIGINAL production-quality fantasy MMORPG material texture atlas. EXACT 3 columns by 2 rows of equally sized SQUARE material swatches, edge-to-edge, no gaps, no borders, no labels, no text. Landscape image 3:2 aspect. Every swatch an orthographic, evenly lit top-down seamless tileable albedo surface, detailed realistic weathering, restrained grounded colors, no cast shadows, no perspective objects. Top row left: irregular worn pale limestone street cobblestones with rounded chipped edges, narrow dusty mortar, natural varied stone colors and faint moss. Top row center: weathered medieval sandstone rectangular masonry bricks in staggered courses, pale warm gray, pitted grain and fine cracks, narrow recessed mortar. Top row right: old timber planks, rich gray-brown wood grain, splits and knots, soft wear, muted warm color. Bottom row left: overlapping dark slate roof tiles, chipped edges and mineral grain, grounded gray with restrained blue undertones. Bottom row center: natural patchy short meadow grass ground, varied olive greens, scattered dry blades and dark soil, small natural mottling, not neon or cartoon. Bottom row right: worn earth dirt path, muted sandy gray brown fine gravel, pebbles and tiny dried fragments, no large rocks. Fine material detail intended to remain visible when sampled as 512px tiles. Original assets, no resemblance to a proprietary game texture, no UI.
