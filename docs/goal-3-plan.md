# Goal #3 — Éter con feel de MMORPG estilo MU 99b

## Alcance y regla de aceptación

Refocar el juego existente en cámara, escala, composición, ciudad útil, spots, targeting, movimiento, ataque normal, skills, feedback, personajes, mobs, drops y HUD. La referencia es deliberadamente la experiencia de MU 99b, con mundo, fórmulas, clases, mapas, arte, interfaz, nombres y audio propios de Éter. Una captura que siga leyendo como RTS, editor, city builder o maqueta lejana **no aprueba** este goal. Pasar tests tampoco acredita por sí solo el feel.

Se mantienen Éter, Aurelia, Crowns, el recurso Éter, Vanguard/Arcanist/Ranger, Sanctum, builds híbridas, cuatro stats manuales, máximo 500, resets, administración sectorizada y arquitectura autoritativa/persistente. No agregar party, trade, guilds, PvP complejo, crafting grande, upgrades avanzados, mascotas, monturas, clases, class change ni quests complejas.

## Orden de trabajo

1. Preservar reglas y persistencia; acercar cámara, restringir zoom y comprobar las tres clases.
2. Escala y encuadre de actores/equipo, mobs y drops; controlar oclusiones.
3. Compactar servicios de Aurelia, plazas/caminos y salida al farmeo; densidad que conserve rutas y safe zone.
4. Spots reconocibles con clearings, densidad/respawn y dificultad ascendente en las cuatro regiones.
5. Targeting, hitboxes/labels, rango y auto-approach; movimiento preciso e inmediato; ataque normal importante y feedback corto.
6. Personajes definidos y serios, animaciones de clase y mobs protagonistas.
7. HUD compacto de juego, inventario de grilla, once slots/paper doll, tooltips y stats con impacto legible.
8. Unificar acceso, selección y mundo jugable; audio original sobrio, polish y performance.
9. Tests completos, inspección visual, documentación y auditoría final.

## Cambios ya implementados (todavía sujetos a aceptación final)

- Cámara ortográfica fija a 45° de azimut y ~35.3° de elevación. Half-height inicial 8.5; extremos 7.5–10.5. A 1440×900, una altura de cuerpo de 2.2 unidades ocupa ~95 px por defecto y ~77 px al máximo alejamiento. No se inflan modelos ni colisiones para simular cercanía. `client/presentation.ts` contiene estos valores.
- Edificios se agrupan por identidad para atenuarse a 22% cuando interceptan pies/cuerpo/cabeza del jugador o del objetivo seleccionado. Se restauran al salir de la oclusión; mapa y colisión no cambian por el efecto.
- Pavimento central 19×19, caminos de 4.5 unidades y patios junto a edificios/NPCs, en lugar de pavimentar la ciudad completa de 46×46. Servicios desplazados hacia el núcleo; safe zone y edificios existentes se conservan. Herrero y alquimista quedan a x ±8, comercios de clase a ±12.
- Primer spot en (6,32), radio 4, seis Sproutlings y respawn 10 s. Desde spawn (0,10), el centro queda a ~23 unidades / ~4.6 s de marcha a velocidad nominal. Otros spots se acercan, radios 4.5–5 y respawns 11–22 s. Suelo desgastado integrado al albedo y señales de salida diferencian zonas de leveo.
- Migración de layout mueve solo valores intactos de Goal #2; mantiene shops/diálogos, posiciones personalizadas, spots editados/deshabilitados/eliminados, recursos e instancias. No escribe la DB del propietario como fixture.
- Snapshot expone target autoritativo para orientar personajes/mobs al atacar detenidos. Panel de objetivo muestra HP y rango con chequeo de distancia y línea caminable. Auto-approach y daño siguen en servidor.
- HUD en marco central compacto, vida/mana más contrastadas, ataque normal destacado, minimapa menor, grilla/slots más contrastados y labels/loot más visibles. Arte físico de loot aumentado 20%, sin modificar ownership/pickup autoritativo.
- Encabezado y panel informativo de target permiten clics hacia el mundo; solamente los botones del encabezado capturan mouse. Inventario conserva sus nodos durante drag y se refresca al terminar. Buffs/heal/movilidad instantánea mantienen el modo de ataque anterior.
- Login y selección muestran una captura del Aurelia jugable y los mismos rigs de clase. Se preserva el audio sintetizado existente; el hit de Ranger usa el sonido de arco.
- Radeon R5 integrada: resolución de canvas 0.85×, shadow map 1024 y máximo 30 FPS. SwiftShader: canvas 0.5×, sin sombras dinámicas/bump y máximo 10 FPS. Los labels/HUD HTML conservan su resolución; geometría, cámara, colisión y tick del servidor se preservan. Estos perfiles están implementados pero requieren la medición actual de varios clientes.

## Auditoría de aceptación pendiente

Todos los puntos requieren evidencia actual, no el informe histórico de Goal #2:

| Área | Evidencia necesaria |
| --- | --- |
| Cámara sin lectura RTS/editor; personaje, equipo, mobs y combate protagonistas | Capturas de tres clases, zoom mínimo/default/máximo, 1440×900 y resolución menor; revisión visual del gameplay |
| Aurelia compacta y útil; distancia temprana cómoda; salidas y spots legibles | Recorrido por clic desde spawn al primer spot y regreso a compra/reparación/Sanctum; capturas de las cuatro regiones |
| Target confiable y claro; labels no interceptan; movimiento/auto-approach cómodo | Prueba real de clic, cambio de target, melee/rango, estado de rango, obstáculos y movimiento sostenido |
| Combate directo/repetible, ataque normal satisfactorio, skills cortas por clase | Farmeo normal de las tres clases y doce skills observadas en frames; inspección del timing, impacto, hit reaction y muerte |
| HUD/inventario/equipo/stats MMORPG | Capturas de HUD, grilla, once slots, paper doll, tooltip, puntos manuales, compras y Sanctum |
| Crowns/Éter/items/pociones físicos, legibles y satisfactorios | Capturas con/sin labels y pickups reales; ownership exacto de 30 s y persistencia |
| Acceso/selección coherentes con mundo serio, día/noche y audio sobrio | Inspección de login, selección, Aurelia día/noche, NPCs, golpes, proyectiles y pickups |
| Identidad original y base funcional preservadas | Revisión de fuentes/arte propios; regresiones auth, server, SQLite, inventario, shops, Sanctum, admin, builds, 500 y resets |
| Performance | Dos Chrome con ocho clientes WS, contadores GPU y fallback SwiftShader; medir el costo de oclusión/batching |

Comandos requeridos: `npm.cmd test`, `npm.cmd run test:e2e`. La suite de Chrome trabaja sobre producción y DBs aisladas; fixture visual acelera día/noche y Éter explícitamente. El recorrido normal de cada clase no usa admin. Las rutas largas ahora usan clics sucesivos reales, respetando el encuadre cercano.

Antes de cerrar: inspeccionar login, selección, Aurelia, salida, primer spot, melee, ranged, loot, inventario, stats, shops, Sanctum, minimapa, HUD y día/noche. Reportar cambios en cámara/escala/mundo/combate/UI/presentación, tests, límites, comandos locales y oportunidades de Goal #4. La finalización sigue sin demostrarse mientras falte cualquier evidencia o el resultado visual siga siendo genérico.
