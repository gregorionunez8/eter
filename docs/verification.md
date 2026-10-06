# Auditoría de aceptación de Éter — Goal #1

Fecha: 2026-10-05. **Goal #1 verificado: 19 tests de servidor/mundo/integración y 7 tests Chrome aprobados en la ejecución final, sin fallos, skips ni resultados flaky.** TypeScript y build de producción aprobados contra el código final. Esta auditoría sustituye los estados preliminares anteriores; el informe original se conserva en PROGRESS.md como historial.

## Evidencia y condiciones

- **S**: `npm.cmd test`: 19 tests de reglas, mundo, SQLite e integración HTTP/WebSocket real. Incluye diez cuentas, combate disputado con EXP única, sesiones/logout/login, reinicio, equipo persistido y configuración aplicada tras reiniciar.
- **UI**: Chrome sobre producción: tres clases, movimiento, inventario, drag/drop, once slots, equipar/desequipar y opciones.
- **AB**: dos contextos Chrome con cookies independientes: caminar fuera de Aurelia antes de promoción/admin/teleport, continuidad de posiciones recibidas, jugadores visibles, mismos monstruos, ataque por mouse, EXP, pickup Crowns/item y equipamiento por ID exacto. B es rechazado antes de la expiración de 30s y recoge ese mismo drop después. A reconecta y vuelve a hacer logout/login conservando EXP, nivel, Crowns y el item equipado; el primer reconnect compara también durabilidad/metadata.
- **NPC**: UI de pociones, puntos manuales, compra, Sanctum, reparación y editor administrativo. **SEC**: protección HTTP de `/admin` y acciones privilegiadas.
- **VIS**: ocho recorridos reales por clic alrededor de cristal, edificio, fuente, NPC, árbol, roca, pilar y pared de ruinas. Cada posición recibida es caminable y la ruta hace un desvío real. También destino bloqueado, zoom 14–34, día/noche, Éter, nombres ON/OFF, pickup/reconnect de Éter, doce skills y proyectiles de magia/flechas presentados en frames renderizados.
- **LOAD**: diez usuarios conectados: dos clientes Chrome renderizando y ocho clientes WebSocket moviéndose. Frecuencia de snapshots, interpolación observada y métricas de frames/draw calls; no equivale a diez navegadores renderizando en una sola PC.
- **SOFT**: Chrome forzado a SwiftShader, dos contextos, primer frame, HUD con datos y dos reconexiones de B. Verifica fallback sin sombras; no constituye un benchmark de PC gamer.
- TypeScript y bundle de producción aprobados. Bundle JS aproximado 544 kB / 143 kB gzip; advertencia de Vite por superar 500 kB, sin error.

Los siete tests de navegador usan Chrome instalado y el bundle real servido por el servidor Node. El entry point `tests/browser/server.ts` fija una semilla de aleatoriedad en el proceso de test para repetir encuentros; conserva tasas normales y reglas de combate, loot e inventario. Las monedas/items se obtienen por combate y pickup, sin acreditación automática. Tras demostrar la salida caminando, AB usa herramientas admin para disponer encuentros/proximidad; no demuestra un recorrido completo de farmeo sin helpers.

VIS usa servidor 3101 y DB temporal propios, ciclo de 10 segundos, Éter al 100% y aggro desactivado para aislar captura y navegación. La creación de Éter sigue pasando por muerte del monstruo, entidad física y pickup persistente. S verifica rareza normal (3.5% frente a 90% Crowns) y exclusividad exacta a 29.999/30 segundos. Los defaults, `data/eter.sqlite`, arranque normal y probabilidades no se cambian. El fixture visual se elimina al terminar.

Los resultados y adjuntos se guardan en `test-results/results.json`. Las capturas quedan en `test-results/`: `multiplayer-final.png`, `aurelia-*.png`, `day.png`, `night.png`, `ether-drop.png`, `ether-without-labels.png`, `ether-ruins.png`, `skills-*.png` y `ten-player-load.png`. Los artefactos son locales e ignorados por git y se reemplazan en cada ejecución.

## Criterios originales (57)

| # | Criterio | Evidencia actual |
| --- | --- | --- |
| 1 | Dependencias instaladas | Lockfile y `npm ls --depth=0`; builds/tests ejecutados |
| 2 | Cliente/servidor sin errores críticos | UI/AB/NPC/VIS/LOAD/SOFT; sin pageerrors en escenarios cubiertos |
| 3 | Build de producción | `tsc --noEmit` + Vite en `test:e2e` |
| 4 | Registro | S + UI/AB/NPC |
| 5 | Login | S + AB después de logout |
| 6 | Crear tres clases | S + UI |
| 7 | Spawn en Aurelia | S + UI |
| 8 | Caminar por clic | UI/AB/VIS/LOAD |
| 9 | Cámara isométrica | Capturas UI/VIS y proyección ortográfica usada en clics reales |
| 10 | Salir caminando de Aurelia | AB: z > 23, Greenfields y trayectoria continua antes de helpers |
| 11 | Múltiples spots | S: nueve spots/ocho enemigos y contenido central |
| 12 | Respawn | S: muerte y reaparición después del tiempo configurado |
| 13 | Aggro y ataques | S: aggro/daño fuera de zona segura; límite de persecución presente en simulación |
| 14 | Ataque normal | S + AB con mouse y muerte compartida |
| 15 | Cuatro skills por clase | S + VIS ejecuta las doce por teclado |
| 16 | Mana/cooldown de skills | S + VIS cooldown confirmado y efecto renderizado |
| 17 | EXP al matar | S + AB |
| 18 | Level up | S; no depende de inspección visual indirecta |
| 19 | Cinco puntos por nivel | S + NPC nivel 2/puntos en UI |
| 20 | Distribuir cuatro stats | S para las cuatro; NPC verifica operación real de UI con Vitalidad |
| 21 | Drops físicos | S + AB/VIS, entidades/IDs propios y presentación 3D |
| 22 | Crowns físicos | AB: pickup de A/B y aumento real del saldo |
| 23 | Éter raro | S/defaults normales; VIS a frecuencia elevada sólo en DB temporal |
| 24 | Distinción visual de Éter | VIS: octaedro emisivo, partículas, capturas con/sin nombres |
| 25 | Exclusividad killer 30s | S exacto; AB rechazo de B y saldo intacto |
| 26 | Pickup público después | S + AB espera reloj del servidor y recoge el mismo ID |
| 27 | Nombres ON/OFF | UI + VIS oculta nombre, conserva entidad física y vuelve a mostrar |
| 28 | Cuadrícula inventario | S + UI |
| 29 | Tamaños diferentes | S + UI armas 1×3/2×3 y pociones 1×1 |
| 30 | Equipar/desequipar | UI + AB recoge/equipa y persiste ID exacto |
| 31 | Requisitos stats | S: rechazo/aceptación según stats |
| 32 | Equipo híbrido | S: sin bloqueo por clase |
| 33 | Bonus afinidad real | S: efectividad adicional cuantificada |
| 34 | Durabilidad | S: baja durabilidad/agotamiento; combate la reduce |
| 35 | Reparación Brom | S + NPC |
| 36 | Pociones | S + NPC Q/W y cantidades desde inventario |
| 37 | Compras Crowns | S + NPC saldo y item en UI |
| 38 | Sanctum | S persistencia + NPC depósito/retiro por UI |
| 39 | Día/noche | VIS ambas fases, diferencia de luz y mínimos jugables; capturas inspeccionadas |
| 40 | Minimapa | UI/VIS capturas: ciudad, regiones, NPCs y jugador |
| 41 | Coordenadas | UI/AB/VIS coherentes con snapshots y destinos |
| 42 | Muerte reaparece | S: respawn en Aurelia y recursos/EXP conservados |
| 43 | Drop equipado configurable | S: máximo uno y exclusión de protegido |
| 44 | Nivel máximo 500 | S |
| 45 | Reset | S: varios resets |
| 46 | Conserva bolsas/recursos | S: comparación de inventario/equipo/Sanctum/monedas |
| 47 | Nivel 1/stats base tras reset | S |
| 48 | Bonus reset configurable | S/configuración validada y puntos acumulados |
| 49 | Dos usuarios visibles | AB etiquetas visibles; SOFT dos snapshots/escenas renderizadas |
| 50 | Mismos monstruos | S diez usuarios + AB IDs y muerte visible en ambos estados |
| 51 | Competencia por monstruos | S HTTP/WS real: dos atacan y EXP otorgada una sola vez |
| 52 | Persistencia logout/reinicio | AB reconnect y logout/login; S SQLite y reinicio de servidor |
| 53 | `/admin` protegido | SEC + S HTTP y comandos |
| 54 | Admin modifica balance | NPC editor guarda/restaura; S valida config y aplica ciclo tras reinicio |
| 55 | Documentación | README/GAME_DESIGN/PROGRESS/requisitos/auditoría reconciliados |
| 56 | Assets originales | Código procedural Three.js/materiales/Web Audio; revisión de fuente/bundle, sin assets de terceros juegos |
| 57 | Sin errores críticos que impidan jugar | Suites cubiertas; alcance de evidencia y límites abajo |

## Correcciones de la reanudación

1. `addLoot` copiaba el MonsterRuntime entero mediante spread: el ID del monstruo sobrescribía el nuevo UUID, el renderer compartía la clave de label y lanzaba errores al reaparecer/remover entidades. Ahora se copian sólo x/z; regresión verifica IDs distintos y que no se filtren campos de runtime.
2. Etiquetas de loot/monstruos/NPCs se apilan con dimensiones reales y medición agrupada, conservando clics alcanzables. HUD/paneles quedan sobre labels. El selector usa hit testing real, no clicks forzados ni dispatch de acciones simuladas.
3. Modelos de otros jugadores dejan pasar clics de caminar. Eventos de sockets/escenas anteriores se ignoran después de salir/reconectar. La prueba espera un frame renderizado, además del primer snapshot/HUD.
4. AB acredita la salida física y el item equipado por ID tras reconnect y login. Los encuentros repetidos seleccionan un Sproutling realmente visible en vez de exigir una etiqueta oculta en un grupo de spawns.

## Rendimiento y límites

Medición final sobre Windows/Chrome headless, NVIDIA RTX 3080 Ti, dos escenas y diez usuarios: medianas de frame 5.0 ms, p95 6.9–7.0 ms, 298–300 draw calls por escena y ~9.96 snapshots/s por cliente de red. La medición completa queda en el adjunto `ten-player-performance`. La escena exterior y Aurelia muestran cantidades distintas de draw calls; el guard verifica menos de 500 además de tiempos de frame y red. Estos tiempos de headless no son una garantía de FPS de pantalla, de otras GPUs ni de carga MMO masiva.

El arranque final de B con SwiftShader fue 4.731 s (Chrome con GPU: 614 ms); recibió snapshots y renderizó después de cada reconnect. El fallback reduce resolución/sombras y apunta a 30 FPS, pero no se promete ese framerate en cualquier CPU.

Se inspeccionaron capturas de día, noche, ruinas y Éter. Sigue siendo arte procedural temporal: animaciones sencillas, modelos pequeños, sonidos sintetizados opcionales, sin arte/música profesionales. La lectura estética del Éter a distintas resoluciones y la sensación subjetiva de animaciones/skills/audio pueden revisarse manualmente; la generación, renderizado, interacción y persistencia están automatizados. Bajo acumulaciones extremas una etiqueta puede desplazarse o quedar fuera del viewport; existe selección de modelos y las pruebas seleccionan una etiqueta visible alcanzable. No se midió una sesión de varias horas ni se certificó un despliegue público.

Party, guilds, trade, PvP avanzado, crafting/upgrades profundos y demás funciones excluidas siguen fuera de Goal #1.
