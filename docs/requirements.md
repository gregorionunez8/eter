# Éter — requisitos y verificación

Este documento registra el alcance completo recibido para Goal #1. La evidencia actual de cada criterio está en `docs/verification.md`; este archivo conserva los requisitos originales.

## Visión

MMORPG 3D original para navegador de escritorio, priorizando Chrome. Fantasía medieval relativamente luminosa, colorida y sobria, sin estética infantil ni saturación excesiva. Sensación de MMORPG clásico modernizado.

No copiar assets, mapas, monstruos, personajes, nombres, sonidos, interfaces, textos, código ni diseños exactos de otros juegos. La inspiración se limita a conceptos generales: cámara isométrica, movimiento por clic, spots, niveles, puntos manuales de estadísticas, loot físico, equipamiento, inventario en cuadrícula, habilidades, NPCs, resets y multiplayer persistente.

## Arquitectura

TypeScript, Three.js, Vite, servidor Node.js autoritativo, WebSockets con ws y persistencia SQLite. Contenido separado de la simulación. Panel administrativo implementado y protegido por cuenta. Priorizar simplicidad, estabilidad, continuidad del desarrollo y facilidad para modificar contenido.

El cliente envía intenciones. El servidor calcula y valida daño, experiencia, drops, ownership del loot, dinero, Éter, estadísticas permanentes, muerte, inventario y equipamiento. Las pruebas deben incluir mensajes maliciosos y dos clientes simultáneos.

## Mundo

Éter es el nombre del juego y la energía natural fundamental del universo, presente en criaturas, personas, minerales y lugares. Las criaturas pueden soltar Éter al morir con una frecuencia bastante menor que la moneda común. Su futuro uso incluye comercio entre jugadores, mejoras de equipamiento y combinaciones.

## Evidencia requerida

- Build y comprobación de tipos.
- Pruebas de simulación autoritativa y rechazo de acciones inválidas.
- Pruebas de persistencia tras reconexión y reinicio.
- Sesión real en navegador con renderizado 3D e interacciones.
- Dos clientes conectados y sincronizados.
- Auditoría requisito por requisito al recibir el alcance y los criterios completos.

## Alcance funcional completo recibido

1. Propiedad original y fantasía medieval luminosa, sobria y presentable.
2. Navegador de escritorio, Chrome prioritario; cliente 3D, TypeScript, servidor autoritativo, WebSockets, autenticación, persistencia, configuración, administración.
3. Éter como energía natural y recurso raro; preparar trade, upgrades, crafting, combinaciones y sistemas avanzados sin implementarlos ahora.
4. Aurelia segura, spawn dentro de la ciudad; piedra clara, edificios, vegetación, caminos, fuentes, cristal central y magia sutil. Salidas caminables a Greenfields, Whisperwood, Stonepass y Ether Ruins, con dificultad creciente.
5. Cámara isométrica estable, zoom limitado, clic izquierdo para caminar, pathfinding y colisión con geometría y NPCs.
6. Registro, login, creación y selección; solo nombre y clase. Vanguard hombre cuerpo a cuerpo, Arcanist hombre mago, Ranger mujer arquera, visual definido.
7. Fuerza, Agilidad, Vitalidad y Energía con efectos reales centralizados; cinco puntos manuales por nivel.
8. Builds híbridas por requisitos de stats, sin bloqueo rígido por clase; afinidad con bonus real.
9. Seleccionar monstruo, acercarse y atacar automáticamente; ataque normal, cooldown, daño físico/mágico, HP, mana, muerte, aggro, rango, velocidad. Monstruos agresivos, persecución limitada y balance configurable.
10. Cuatro skills por clase: Heavy Slash, Whirlwind, Charge, War Cry; Ether Bolt, Frost Nova, Arc Surge, Blink; Piercing Arrow, Multi Shot, Quickstep, Nature's Grace.
11. Barra inferior; teclas numéricas; selección, cooldown, costo y tecla visibles.
12. Spots configurables con monsterId, posición, radio, cantidad, respawn. Sproutling/Wild Beetle (1–5), Forest Wolf/Thornling (5–12), Rogue/Stone Beetle (12–20), Orc Scout/Stone Golem (20–35). Varios spots por rango, tiempos razonables.
13. EXP por monstruo y fórmula creciente, nivel máximo 500, ritmo configurable.
14. Reset al 500: vuelve a 1 y stats base; conserva personaje, items, inventario, equipo, Crowns, Éter, Sanctum; incrementa resets y puntos permanentes configurables (300 iniciales). Múltiples resets.
15. Crowns físicos, recoger manualmente, compras y reparaciones.
16. Éter físico raro con brillo, partículas y color propios, persistente y preparado para usos futuros.
17. Todo loot físico con miniatura y nombre, nombres ON por defecto con opción OFF, propiedad del killer durante 30s y público después, validado por servidor.
18. Inventario en cuadrícula, tamaños 1×1/1×3/2×3, drag and drop, equipamiento: casco, armadura, pantalón, guantes, botas, arma, secundaria, alas preparadas, collar y anillos.
19. Modelo flexible: daño extra/porcentual, velocidad, crítico, vida/mana al matar, bonus contra monstruos, skill, suerte, afinidad y extensiones. No implementar upgrades/rareza/rerolls profundos.
20. Durabilidad decrece lentamente, baja efectividad a niveles bajos y cero inutiliza; reparación por Brom con Crowns, configurable.
21. Muerte: reaparece en Aurelia conservando EXP/Crowns/Éter; chance 0.5% configurable de perder máximo un equipado; exclusión futura para items especiales.
22. NPCs visibles con diálogo y función: Brom, Lyra, Orin, Kael, Seraph, Ronan, Elyra, Sylwen, Reset Master.
23. Sanctum personal persistente con cuadrícula, accesible por Orin.
24. Pociones HP/mana, Q/W, cantidades visibles, consumo validado desde inventario.
25. Minimapa: jugador, ciudad, NPCs y zonas; coordenadas coherentes con contenido y administración.
26. Ciclo día/noche agradable y jugable, duración configurable y acelerable.
27. Multiplayer real: jugadores visibles, movimiento y animaciones sincronizados, monstruos, combate y drops compartidos, persistencia separada; probar diez simultáneos. Preparar extensión sin party/guild/trade/PvP.
28. Registro/login/logout y personajes; persistir cuenta, clase, nivel, EXP, resets, stats, puntos, bolsas, equipo, Sanctum, monedas, durabilidad, skills y posición; contraseñas seguras.
29. Configuración central legible de monstruos, spots, items, skills, economía, progresión, muerte, mundo y NPCs, sin fórmulas duplicadas.
30. /admin protegido por cuenta: editar HP/daño/EXP, respawn/cantidad/coordenadas, drops, precios, día/noche y pérdida al morir; guardar/reiniciar permitido.
31. Arte original procedural o legal, coherente, entendible; gameplay prioritario.
32. UI original legible con vitals, nivel/EXP/clase, monedas, skills, inventario/equipo/stats/puntos/Sanctum/minimapa/coordenadas/opciones.
33. Audio original opcional sin bloquear gameplay.
34. Rendimiento razonable en Chrome PC gamer, draw calls razonables, efectos moderados, red a frecuencia independiente e interpolación.
35. Herramientas protegidas: coordenadas, admin, teleport, spawn, monedas, nivel, reset de prueba e IDs.
36. README: arquitectura, instalación, local, DB, env, arranque servidor/cliente, admin, edición de monstruos/spots/items/EXP/drops/resets y despliegue. GAME_DESIGN.md con decisiones.
37. Excluir party, guilds, trade, PvP avanzado, crafting completo, upgrades profundos, monturas, mapas adicionales, quests/bosses complejos, marketplace/auction house, mascotas, alas funcionales y clases avanzadas.
38. Iterar implementando, ejecutando, probando y corrigiendo hasta satisfacer el alcance; gameplay antes de polish.
39. Tests servidor y navegador; compilar no demuestra jugabilidad.
40. Auditoría final de los criterios de aceptación con evidencia individual.
41. Escenario final: A entra, sale, mata, gana EXP, recoge Crowns/item y equipa. B cuenta separada, ambos se ven y ven monstruos; B no recoge loot de A antes de 30s y sí después. Reconectar y verificar progreso.
42. Si hay bloqueo, intentar alternativas, preservar avance, documentar requisito/causa/recurso necesario. No declarar éxito ni reducir alcance.

## Criterios de aceptación y evidencia

Los 57 criterios de la solicitud se auditan en `docs/verification.md`. Un test de servidor demuestra la regla probada; no sustituye la prueba de la interfaz o el escenario final real. La suite actual combina reglas/persistencia/HTTP/WebSocket con Chrome real, A/B, efectos renderizados, navegación por clic y carga de diez usuarios. Los fixtures y límites de cada evidencia se declaran en la auditoría.
