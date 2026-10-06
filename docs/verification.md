# Verificación de Éter — Goal #2 completo

2026-10-06. **Goal #2 completo y verificado.** Goal #1 y su arquitectura se preservan; su auditoría histórica se conserva debajo. La aceptación se basa en regresión, juego real en Chrome y revisión de imágenes del mundo jugable, no solamente en código o pintura de entrada.

## Ejecución final y condiciones de Goal #2

- Baseline antes de cambiar: **19/19 servidor y 7/7 Chrome** verdes.
- `npm.cmd test`: **30/30 aprobados**. Reglas/persistencia/multiplayer originales, migración transaccional `armor` → `chest`, instancias/idempotencia, validación/config persistente, spots, pasivos que se defienden, layouts pendientes adquiridos antes de reinicio, metadata futura y stop autoritativo sin coordenadas ni recompensas.
- `npm.cmd run test:e2e`: **10/10 aprobados**, 0 fallos, 0 skips, 0 flaky. Ejecución final comenzó `2026-10-06T04:04:38.496Z`, duración **419.894 s**. Incluye TypeScript y Vite production. JS principal **704.94 kB / 194.12 kB gzip**, admin 16.94/6.71 kB y GLTFLoader 43.80/12.88 kB en chunks separados. Advertencia de Vite >500 kB, sin error de build.
- Se conservaron los siete escenarios originales. Los tres nuevos cubren movimiento sostenido por clic, formularios admin/CRUD/auditoría y el recorrido principiante sin helpers. Las pruebas no reducen validación ni autoridad del servidor.
- Se inspeccionaron imágenes reales de entrada/selección, tres clases, Aurelia día/noche, cuatro regiones, ocho familias, equipo inicial/mejorado, tooltip, stats, tienda, Sanctum y administración. Se corrigieron humanos demasiado simples, pelo flotante, anatomía redonda del lobo, hierba negra, pavimento demasiado grande, IDs SVG y batching incompatible. La cámara inicial ahora usa half-height 14, límites 12–26.
- Los eventos de las doce skills se ejecutaron por teclado y se verificaron efectos presentados en frames, cooldown y proyectiles de Arcanist/Ranger. Éter apareció mediante muerte y pickup real, permaneciendo físico al ocultar nombres y persistiendo tras reconnect. Ocho rutas de obstáculos se caminaron con posiciones autoritativas caminables.

### Gameplay principiante sin admin

El décimo escenario registra Vanguard nivel 1, sale caminando, usa War Cry, selecciona/ataca Sproutlings, obtiene EXP y recoge los drops físicos. En la corrida final: **6 bajas**, **nivel 2**, **+5 Vitalidad**, espada de hierro obtenida/equipada por ID exacto y **109 Crowns** al terminar. Regresa caminando, compra una poción por 15 Crowns, repara y deposita/retira el mismo item en Sanctum. Recorrido observado **30.842 s**, sin promoción, teleport, spawn ni créditos admin. La semilla de test hace el resultado repetible; no garantiza ese drop/tiempo en partidas con azar normal.

La revisión encontró una deriva al llegar a NPC/loot: el jugador abría el servicio y seguía caminando. Ahora envía la intención estricta `stop` al llegar; el servidor limpia path/target/skill pendiente manteniendo la posición actual. Un nuevo clic cancela intenciones viejas del cliente. La regresión de servidor verifica ausencia de movimiento posterior y rechazo de coordenadas inyectadas.

### Performance medida

RTX 3080 Ti, Chrome headless con ANGLE D3D11, 1440×900, sombras activas. **Dos navegadores renderizando y ocho clientes WS** moviéndose; no diez navegadores gráficos.

| Métrica | Chrome A | Chrome B |
| --- | --- | --- |
| Frame mediano | 21.3 ms | 21.9 ms |
| Frame p95 | 34.0 ms | 35.9 ms |
| Render mediano | 14.0 ms | 14.3 ms |
| Draw calls | 356 | 364 |
| Triángulos renderizados | 620,820 | 624,300 |

Las ocho conexiones WS recibieron **10.01 snapshots/s**; interpolación observada. Contadores GPU antes/después del intervalo: **610/610 geometrías y 214/214 texturas**. No errores Three/WebGL recurrentes ni pageerrors en los escenarios cubiertos. Los 401 del sondeo de sesión antes del registro son respuestas esperadas. El escenario SwiftShader inició dos mundos, mantuvo HUD y reconectó B dos veces; segundo arranque **22.096 s**. El fallback limita a 20 FPS, pixel ratio 0.65 y elimina sombras/bump/reflejos/normal-ORM importados.

Hay mayor costo que el prototipo de Goal #1 (~5 ms y ~13k triángulos) por el contenido/modelos nuevos. Esto verifica carga local estable, **no 60 FPS garantizados, hardware mínimo ni auditoría prolongada de heap**. Rendering CPU es más lento y no representa una PC gamer con GPU.

### Aceptación visual y funcional (secciones 74–81)

| Área | Resultado revisado |
| --- | --- |
| Mundo | Aurelia con mampostería, vigas, ventanas, puertas, tejados, fuentes, carros/mesas/jardineras; armilar de Éter; materiales texturados; campos, bosque, roca y ruinas con identidades distintas; noche legible y luces emisivas graduales |
| Personajes | Vanguard masculino armado, Arcanist masculino con túnica/staff, Ranger femenina con capucha/bow; anatomía y ropa CC0 con pesos suaves, añadidos originales, caminar/atacar/castear/hit/muerte/interactuar y equipo visible |
| Monstruos | Ocho familias originales reconocibles; lobo con torso/morro/cola esculpidos, insectos segmentados, plantas y golem rocoso; humanoides Rogue/Orc adaptados; idle/locomoción/ataque/hit/muerte |
| Combate | Picking ampliado e indicadores, acercamiento/rango autoritativos, trails/impacto, números diferenciados, doce skills y proyectiles desde manos/objetivos válidos |
| Movimiento/cámara | Clic y clic sostenido, parada precisa de interacción, ocho rutas de obstáculos, límites 12–26 y framing inicial más cercano |
| UI | Login pintado, selección 3D, HUD compacto, iconos originales, cooldown/mana/selección, bolsas multi-cell, once slots/paper doll, Pechera sin Armor/Set adicional, tooltip, stats, NPCs y Sanctum |
| Admin | Trece secciones, formularios/search/drafts, CRUD de spots, bounded validation, persistencia/reinicio, inspección de jugadores y herramientas auditadas; JSON avanzado; no-admin rechazado |
| Regresión/performance | 30 servidor + 10 Chrome, build, multiplayer/persistencia, estados de equipo distintos, dos clientes GPU/CPU y recursos estables en intervalo observado |

### Capturas y límites

Artifacts locales ignorados por git, reemplazados por cada corrida: `test-results/results.json` y PNGs. Login/selección: `login.png`, `selection-{vanguard,arcanist,ranger}.png`; mundo: `aurelia-*.png`, `day.png`, `night.png`, `region-*.png`; combate/loot: `skills-*.png`, `ether-drop.png`, `ether-without-labels.png`; UI: `inventory-equipment-*.png`, `equipment-armored.png`, `vanguard-armored.png`, `character-sheet.png`, `npc-shop.png`, `sanctum.png`; admin: `admin-monsters.png`, `admin-spots.png`, `admin-player-tools.png`; experiencia natural: `beginner-farming.png`, `beginner-sanctum.png`. Adjuntos JSON incluyen rutas, efectos, performance, software-startup y natural-beginner-loop.

Los fixtures de arte usan configuración temporal (3101, ciclo 10 s, Éter 100%, aggro 0); equipo/admin usan herramientas declaradas en DB de test. No cambian cuentas/config del propietario. `tests/browser/server.ts` rechaza resetear cualquier DB que no sea `data/e2e.sqlite`. Una consulta de solo lectura al final observó `gregoriorr.admin=1`; esta tarea no ejecutó promoción sobre `data/eter.sqlite`. Promover roles no requiere reiniciar; aplicar config guardada y cargar este código nuevo sí.

La pintura de entrada es arte atmosférico original, no evidencia del mapa. Fuentes y CC0: `ASSET_CREDITS.md`. Música por región tiene arquitectura, sin tracks suministrados; foley/ambiente sintetizados opcionales. Sets futuros, Luck y modifiers son metadata preparada, sin upgrades ni fórmulas nuevas. No se agregaron features de Goal #3. Modelos/armaduras y animación son una base funcional clásica; futuras inversiones profesionales beneficiarían sets específicos, animaciones hand-keyed, criaturas y audio. No quedan bloqueos funcionales conocidos en los escenarios de aceptación cubiertos.

# Auditoría de aceptación de Éter — Goal #1 (historial)

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
