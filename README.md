# Éter

Vertical slice MMORPG 3D original para navegador. Aurelia es una ciudad segura alrededor de un cristal de Éter, con cuatro regiones exteriores y progresión por combate. Goal #1 verificado: 19 tests de servidor y 7 tests Chrome aprobados. La evidencia y sus límites están en `docs/verification.md`.

## Instalación y ejecución

Requiere Node.js 24 y Chrome de escritorio con WebGL2.

```powershell
npm.cmd install
npm.cmd run dev
```

Abrir http://127.0.0.1:3000. Un único comando inicia servidor y cliente: Node integra Vite en desarrollo. Crear cuenta con contraseña de 10 o más caracteres, crear personaje y entrar. En sistemas donde `npm` funciona sin extensión se puede usar `npm` en lugar de `npm.cmd`.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd start
```

`start` sirve el cliente compilado de `dist` y el servidor multiplayer. Los tests de navegador usan Chrome instalado, puerto 3100 y una DB independiente `data/e2e.sqlite`. Los informes y capturas van en `test-results/`. No comparten cuentas con la DB del juego.

## Segundo cliente multiplayer

Con el servidor local funcionando, abrí el primer cliente en una ventana normal de Chrome en http://127.0.0.1:3000. Para abrir el segundo con cookies independientes en Windows:

```powershell
Start-Process -FilePath "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" -ArgumentList '--incognito','--new-window','http://127.0.0.1:3000'
```

Usá una cuenta distinta en la ventana incógnita. Ambos clientes comparten el mismo servidor, mapa, monstruos y loot. Para automatizar el escenario completo de dos clientes:

```powershell
npm.cmd run test:e2e -- --grep "two actual"
```

## Verificación reproducible

`npm.cmd test` cubre reglas, ownership exacto de 30 segundos, IDs independientes de loot, navegación, diez usuarios, combate disputado y persistencia tras reiniciar. `npm.cmd run test:e2e` compila y ejecuta Chrome sobre el bundle de producción: las tres clases/UI, escenario A/B, seguridad/admin/NPCs, visuales/navegación, diez usuarios con dos clientes renderizando y arranque/reconexión con SwiftShader.

El servidor de aceptación usa `tests/browser/server.ts`, que fija la semilla de `Math.random` solamente en ese proceso de test. Las probabilidades normales de drop y las reglas autoritativas permanecen intactas; `npm start` y `npm run dev` usan aleatoriedad normal. El test visual inicia además un servidor temporal en 3101 con DB temporal, ciclo de 10 segundos, drop de Éter garantizado y aggro desactivado. El Éter se obtiene matando y recogiendo físicamente, sin crédito automático. Esa configuración se elimina al finalizar; la DB principal y el ciclo normal de 10 minutos no se modifican.

`test-results/results.json` incluye resultados, rutas observadas, progreso persistido, métricas y contadores de efectos realmente renderizados. Las capturas incluyen día, noche, ruinas, Éter con/sin nombres, clases y multiplayer. El informe se reemplaza en cada ejecución. Para perfilado local, `/?diagnostics=1` habilita `window.eterDiagnostics()` de solo lectura; no expone comandos ni objetos mutables del juego.

## Arquitectura

- `client/main.ts`: autenticación, personajes, HUD, cuadrículas, NPCs y panel admin.
- `client/scene.ts`: Three.js, geometría original procedural, cámara, picking, animaciones e interpolación.
- `server/index.ts`: HTTP, sesiones, WebSockets, límites y rutas protegidas.
- `server/game.ts`: simulación autoritativa; solo recibe intenciones validadas.
- `server/database.ts`: SQLite, cuentas, personajes, sesiones, configuración y ledger de recursos.
- `server/inventory.ts`: tamaños, ocupación, requisitos, afinidad y durabilidad.
- `shared/content.ts`: contenido, balance y fórmulas centralizadas.
- `shared/world.ts`: mapa, obstáculos y pathfinding compartidos; servidor valida movimiento.
- `shared/protocol.ts`: esquema estricto de comandos de red.

Servidor a 20 ticks/s, snapshots a 10/s y cliente interpolado por frame. El cliente nunca informa daño, EXP, drops, monedas, muerte ni inventario como hechos. Cada cuenta tiene una sola conexión jugable activa. El mundo y los monstruos son comunes; la mochila, Sanctum y recursos son privados. SQLite es adecuado para una sola instancia del slice; escalar a múltiples procesos requerirá separar simulación y repositorio de persistencia.

## Base de datos y variables

SQLite se crea automáticamente en `data/eter.sqlite`, con WAL y consultas parametrizadas. Datos de personaje serializados, tabla de cuentas, sesiones, settings y ledger. Contraseñas con scrypt y salt individual; cookies de sesión HttpOnly y SameSite Strict. No hay cuenta admin ni contraseña predeterminada.

Variables del proceso: `HOST` (127.0.0.1), `PORT` (3000), `DATABASE_PATH` y `COOKIE_SECURE` (`true` con HTTPS). `.env.example` documenta valores; no se carga automáticamente. Ejemplo PowerShell:

```powershell
$env:PORT='3000'
$env:DATABASE_PATH='data/eter.sqlite'
npm.cmd run dev
```

## Administración

Registrá primero una cuenta normal y luego, con la misma ruta de DB:

```powershell
npm.cmd run admin -- nombreDeUsuario
```

Iniciá sesión con esa cuenta y abrí `/admin`. Usuarios normales o anónimos reciben 403. El panel edita JSON validado para monstruos, spots, drop rates, precios, día/noche, EXP, bonus de reset y pérdida al morir. Guardar persiste en DB; reiniciá el servidor para aplicar el contenido de forma coherente. Las herramientas admin actúan sobre personajes conectados: teleport, spawn, añadir recursos, establecer nivel y reset de prueba. Los IDs se pueden mostrar en Opciones del juego para admins.

## Modificar contenido

Editar `shared/content.ts` y reiniciar. Monstruos en `monsters`: HP, daño, defensa, XP, speed, aggroRange, leashRange y attackMs. Spots en `spots`: monsterId, x/z, radius, count y respawnMs. Items en `items`: tamaño, slot, requisitos, affinity, daño/defensa, precio y durabilidad. Skills en `skills`: kind, mana, cooldownMs, range, multiplier, durationMs y slowMs. NPCs en `npcs`: posición, diálogo y catálogo. Obstáculos y mapa en `shared/world.ts`.

EXP usa `experienceBase` y `experienceExponent`; stats y cooldown de ataque están en `formulas`. `pointsPerLevel=5`, `maxLevel=500`, `resetBonusPoints=300`. Reset devuelve stats base y conserva bolsas, equipo y monedas, otorgando bonus acumulativo por cantidad de resets; equipo que ya no cumple requisitos queda sin bonus hasta volver a cumplirlos.

Economía en `balance`: `crownsDropChance`, `etherDropChance`, `repairCostPerPoint`. Loot exclusivo `lootExclusiveMs=30000`. Muerte: `equippedItemDropChanceOnDeath=0.005`; instancias con `deathDropProtected` se excluyen. Mundo: `dayNightCycleDuration` en milisegundos. Cambios guardados por `/admin` prevalecen sobre los defaults en los campos editables; retirar el registro `settings.content` de una copia de DB devuelve defaults. Respaldar DB antes de modificarla manualmente.

## Controles

Clic suelo: caminar. Clic monstruo: seleccionar, acercarse y atacar. Clic loot: acercarse y recoger. Clic NPC: acercarse y conversar. Rueda: zoom. 1–4: habilidades; 0: ataque normal. Q/W: pociones de HP/mana. I: inventario/equipo. C: stats. Escape: cerrar panel y volver al ataque normal. Arrastrar items para ordenar/equipar; doble clic para equipar o, ante Orin, depositar/retirar. Clic slot ocupado para desequipar. Nombres de loot ON por defecto. Audio sintetizado opcional en Opciones.

## Despliegue

Instalar dependencias con lockfile (`npm ci`), compilar y ejecutar `npm start` en un proceso Node persistente con volumen duradero para `data`. Configurar `HOST=0.0.0.0` solo si corresponde, `COOKIE_SECURE=true`, proxy HTTPS con soporte WebSocket para `/ws`, y el mismo host público para HTTP/WS. No usar hosting estático solo: la simulación necesita servidor persistente. Para diez jugadores usar una instancia; las herramientas administrativas deben permanecer protegidas. Hacer backups de SQLite mediante mecanismo coherente con WAL y cerrar el servidor limpiamente para el guardado final.

Arte: todas las figuras, edificios, árboles, cristal y efectos se crean con geometría y materiales propios; sonidos opcionales sintetizados con Web Audio. No se incluyen assets de MU ni otros juegos. Estado de pruebas y pendientes: `docs/verification.md`.
