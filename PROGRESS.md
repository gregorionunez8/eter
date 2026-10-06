# Éter — Goal #2 completo y verificado

Actualizado el 2026-10-06. **Goal #2 completo y verificado.** Se preservaron Three.js/Vite, Node HTTP/WebSocket autoritativo, SQLite y todos los sistemas de Goal #1. La transformación incluye anatomía/ropa humana CC0 adaptada, monstruos originales animados, equipo visible, migración segura `armor` → `chest`, Aurelia detallada, armilar de Éter, regiones distintas, materiales originales, iluminación, combate/loot/audio e interfaces de juego y administración nuevas.

- `npm.cmd test`: **30/30 aprobados**, incluyendo migración/reopen/idempotencia, configuración validada/persistente, layouts pendientes seguros, metadata futura, aggro y stop autoritativo. Se conservaron las regresiones de Goal #1.
- `npm.cmd run test:e2e`: **10/10 aprobados**, cero fallos/skips/flaky, 7.0 minutos. TypeScript y build final aprobados; JS principal 704.94 kB / 194.12 kB gzip, con advertencia de tamaño de Vite. Admin y GLTFLoader son chunks separados.
- Dos Chrome renderizando + ocho WS: mediana **21.3–21.9 ms**, p95 **34.0–35.9 ms**, 356–364 draws, ~621–624k triángulos, ~10.01 snapshots/s. RTX 3080 Ti; no es benchmark de hardware mínimo. Conteos GPU estables: 610 geometrías/214 texturas antes y después del intervalo observado.
- SwiftShader: dos clientes y dos reconexiones aprobados; segundo arranque **22.096 s**. Fallback 20 FPS, ratio 0.65 y materiales simplificados; no se promete rendimiento gamer con render por CPU.
- Recorrido real sin helpers admin: salir caminando en nivel 1, War Cry, seis bajas, drops y pickup manual, nivel 2, +5 Vitalidad, equipar el ID de espada obtenido, volver, comprar poción, reparar y depositar/retirar el mismo item en Sanctum. Loop observado ~30.8 s; balance sigue provisional.

Se inspeccionaron capturas reales de entrada, selección/tres clases, ciudad día/noche, todas las regiones/familias, skills, inventario/equipo/stats, tiendas, Sanctum y admin. La revisión llevó a reemplazar humanos demasiado simples, retargetear pesos suaves, corregir pelo flotante, adelgazar la anatomía del lobo, reducir el tamaño del pavimento, aclarar hierba oscura y corregir deriva al interactuar. También se corrigieron IDs SVG y batching incompatibles. La pintura de entrada no sustituye evidencia del mundo jugable.

Guías: `docs/goal-2-development.md`; aceptación/evidencia/límites: `docs/verification.md`; fuentes: `ASSET_CREDITS.md`. No se introdujeron features de Goal #3. Quedan oportunidades profesionales en animación, sets completos, criaturas y foley/música; no se suministró música de baja calidad. Una consulta de solo lectura observó `gregoriorr.admin = 1`; esta tarea no ejecutó promoción sobre la DB del propietario. Promociones y cambios de fixtures quedaron en DBs aisladas. Los informes de Goal #1 que siguen son historial.

# Éter — estado después de reanudar Goal #1 (historial)

Actualizado el 2026-10-05. **Goal #1 verificado.** Se continuó desde los commits `a07b287` y `8bffb35`, preservando Three.js/Vite, Node HTTP/WebSockets, SQLite, simulación autoritativa y contenido compartido. La auditoría vigente es `docs/verification.md`; el informe de la sesión anterior permanece íntegro debajo como historial, y sus pendientes ya resueltos no describen el estado actual.

## Resultado final observado

- `npm.cmd test`: **19/19 aprobados**, incluyendo la regresión de IDs de loot, navegación contra todos los tipos relevantes, diez usuarios reales HTTP/WS, combate disputado, sesiones/admin y persistencia/configuración tras reiniciar.
- `npm.cmd run test:e2e`: **7/7 aprobados**, 0 fallos, 0 skips y 0 flaky; duración aproximada 2.5 minutos. Incluye TypeScript y build final. Bundle JS 543.59 kB, 142.74 kB gzip; advertencia de tamaño de Vite sin error.
- Escenario A/B completo: salida caminando con snapshots continuos antes de cualquier promoción/helper/teleport; ambos jugadores visibles y mismos monstruos; selección de Sproutling alcanzable mediante mouse; muerte/EXP compartida; B rechazado antes de 30s y pickup público después del reloj de expiración; A recoge Crowns y un item, equipa ese ID, reconecta y conserva equipo/durabilidad/metadata, EXP/nivel y Crowns. También logout/login real de A con progreso conservado.
- Primer frame/HUD y dos reconexiones adicionales de B con A activo. Arranque final de B con GPU: 614 ms. Chrome forzado a SwiftShader: segundo cliente en 4.731 s y dos reconexiones correctas con fallback sin sombras.
- Ocho rutas reales por clic alrededor de cristal, edificio, fuente, NPC, árbol, roca, pilar y pared de ruinas. Posiciones caminables y desvío observado. Destino bloqueado rechazado y zoom limitado a 14–34.
- Día y noche con ciclo aislado de 10s, luz mínima jugable, capturas inspeccionadas. Éter físico emisivo con partículas; capturas con/sin nombres, hit testing, pickup manual y persistencia tras reconnect. Las doce skills ejecutadas y sus efectos realmente renderizados; proyectiles de Arcanist y Ranger presentes en frames.
- Dos Chrome renderizando con ocho clientes WS adicionales: diez usuarios, interpolación observada, ~9.96 snapshots/s por cliente de red. RTX 3080 Ti/headless: frame mediano 5.0 ms, p95 6.9–7.0 ms, 298–300 draw calls por escena. No equivale a diez navegadores gráficos ni a un benchmark de todas las PCs.
- README, GAME_DESIGN, requisitos y los 57 criterios de aceptación reconciliados. `test-results/results.json` y capturas/adjuntos contienen evidencia local reproducible, ignorada por git.

## Correcciones concretas

`addLoot` copiaba un MonsterRuntime mediante spread y sobrescribía el UUID nuevo con el ID del monstruo. Eso compartía la clave del label entre entidad y drop y causaba errores de JavaScript/recolección. Ahora copia únicamente x/z y cada drop mantiene ID independiente; se agregó una regresión.

Las etiquetas interactivas usan dimensiones reales y separación agrupada para evitar intercepción mutua. HUD/paneles quedan por encima de labels. Los modelos de jugadores dejan pasar clics de caminar (no existe acción de clic sobre jugadores en este slice). Los callbacks de sockets/escenas anteriores se ignoran al salir o reconectar. Se espera un frame renderizado además del snapshot/HUD al acreditar arranque.

La prueba A/B selecciona un Sproutling verdaderamente alcanzable y verifica el item por ID exacto, incluyendo reconnect/logout/login. El test entry point `tests/browser/server.ts` fija la aleatoriedad exclusivamente en el proceso de aceptación para repetir encuentros, conservando las probabilidades normales y las reglas. `npm start` y `npm run dev` mantienen aleatoriedad normal. VIS usa otro servidor/DB temporal, Éter garantizado, aggro desactivado y ciclo acelerado para capturas; obtiene los drops por muerte/pickup real y elimina el fixture. La DB principal y los defaults no se modifican.

## Límites y trabajo futuro

No quedan criterios funcionales bloqueantes de Goal #1 en los escenarios cubiertos. Arte, animaciones y audio son procedurales básicos; lectura estética del Éter en distintas pantallas y sensación subjetiva de efectos/audio admiten revisión humana adicional. Se inspeccionaron capturas de día/noche, ruinas y el pequeño cristal de Éter visible junto a Crowns. Bajo acumulaciones extremas los labels pueden desplazarse fuera de viewport; se conserva picking de modelos y selección de labels visibles. No se hizo una sesión de varias horas ni despliegue público. Persiste la advertencia de tamaño del bundle.

Party, trade, guilds, PvP, crafting y upgrades avanzados continúan fuera del alcance. Comandos de uso local/segundo cliente y fixtures: README. No hay una continuación de Goal #1 pendiente por un timeout de multiplayer.

---

# Informe histórico de la sesión detenida en la otra computadora

Lo siguiente se conserva como evidencia histórica; sus afirmaciones de Goal incompleto y pasos pendientes corresponden al momento anterior a la reanudación.

# Éter — estado del desarrollo

Este informe se basa exclusivamente en el trabajo y los resultados observados durante esta sesión. No se ejecutaron comandos, tests, builds, navegadores ni servidores para escribirlo. No se inspeccionó ni verificó nuevamente el repositorio.

**El Goal no está completado.** La aceptación completa y el escenario final multiplayer todavía no están demostrados. El trabajo se detiene por instrucción del usuario.

## Implementado

- Proyecto TypeScript con dependencias instaladas y lockfile generado.
- Cliente Three.js y Vite; servidor Node.js con HTTP y WebSockets mediante `ws`.
- Registro, login, logout, creación y selección de personajes. Seis personajes como máximo por cuenta y una conexión jugable activa por cuenta.
- Contraseñas derivadas con scrypt y salt individual; sesiones persistentes en cookies HttpOnly y SameSite Strict.
- SQLite con tablas de cuentas, personajes, sesiones, configuración y ledger de recursos. Guardado periódico, por acciones relevantes y al desconectar.
- Protocolo estricto con Zod, validación de intenciones, límites de payload y frecuencia, controles de ownership y autorización administrativa.
- Simulación autoritativa de movimiento, combate, daño, EXP, niveles, stats, muerte, drops, monedas, inventario y equipamiento.
- Aurelia segura con spawn dentro de la ciudad, cristal central, edificios, caminos, fuentes, árboles, rocas y NPCs procedurales originales.
- Regiones exteriores Greenfields, Whisperwood, Stonepass y Ether Ruins dentro del mismo mapa. Se agregaron obstáculos y geometría de ruinas en una iteración posterior.
- Cámara isométrica, zoom limitado, clic para caminar, A* compartido y validación de segmentos contra obstáculos. Los obstáculos incluyen edificios, cristal, fuentes, vegetación y NPCs.
- Vanguard, Arcanist y Ranger con stats iniciales y figuras propias. Ranger usa una figura más esbelta; no existe personalización estética.
- Ataque normal, selección de enemigo, acercamiento automático, rangos, cooldowns, precisión, daño físico/mágico, HP y mana.
- Aggro, persecución con límite, ataques de monstruos, retorno y regeneración. Ocho tipos de enemigos y nueve spots configurados con respawn.
- Las doce skills solicitadas, incluyendo daño individual, área, cono, Charge, Blink, buffs, control y curación. Mana y cooldowns calculados por el servidor.
- EXP creciente mediante fórmula, cinco puntos manuales por nivel, cuatro stats y nivel máximo 500.
- Resets múltiples con bonus configurable, restauración de nivel y stats base, conservando inventario, equipo, Sanctum y monedas.
- Crowns, Éter e items como entidades físicas de loot. Ownership exclusivo del killer durante 30 segundos y pickup público después. Nombres ON por defecto y opción OFF.
- Éter representado mediante cristal pequeño, emisión de color y partículas discretas.
- Inventario y Sanctum de 8×8, items de distintos tamaños, drag and drop, equipar/desequipar y transferencia mediante Orin.
- Once slots de equipamiento, incluido el slot preparado para alas. Requisitos por stats y bonus de afinidad sin bloqueo rígido por clase.
- Durabilidad, menor aporte con durabilidad baja, aporte cero al agotarse y reparación con Crowns mediante Brom.
- Pociones de vida y mana desde inventario, teclas Q/W, cantidades visibles y cooldown compartido configurable.
- NPCs Brom, Lyra, Orin, Kael, Seraph, Ronan, Elyra, Sylwen y Maestro de Reset, con nombre, posición, diálogo y función.
- Tiendas, venta de items, reparación, almacenamiento, portal local, información de skills y reset.
- Muerte con respawn en Aurelia, conservación de EXP y monedas, y probabilidad configurable de soltar como máximo un equipado. Protección de items especiales prevista en el modelo.
- HUD con HP, mana, nombre, clase, nivel, EXP, resets, Crowns, Éter, skills, stats, inventario, equipo, minimapa, coordenadas y opciones.
- Ciclo día/noche configurable con iluminación mínima para mantener la visibilidad.
- Interpolación de jugadores y monstruos y animaciones básicas sincronizadas. Red a 10 snapshots/s y simulación nominal a 20 ticks/s.
- Agrupación de geometría estática para reducir draw calls, liberación de recursos al salir y ajustes para renderizadores por software.
- `/admin` protegido, editor JSON validado de parámetros principales, guardado persistente y aplicación mediante reinicio.
- Herramientas admin: teleport, spawn de monstruos, añadir Crowns/Éter, establecer nivel, reset de prueba y visualización de IDs.
- Audio opcional sintetizado para algunos eventos; no depende de assets externos.
- Modelo de items preparado para modificadores, upgrades, metadata, skills, suerte y afinidad futura. Ledger preparado para futuras transacciones de recursos.
- README, GAME_DESIGN.md, `.env.example`, documentación de requisitos y auditoría de aceptación.

## Verificado anteriormente

### Instalación y build

- `npm.cmd install` terminó correctamente: 33 paquetes instalados y auditoría sin vulnerabilidades en ese momento.
- Varios builds de producción y comprobaciones TypeScript terminaron correctamente durante la sesión.
- El último build confirmado antes de las últimas modificaciones generó un bundle JavaScript de aproximadamente 540 kB, unos 141 kB gzip. Vite emitió una advertencia de tamaño de chunk; no fue un error de build.
- **No hay un build final confirmado que cubra todas las últimas ediciones.** Se agregaron cambios después de builds aprobados, y la última ejecución solicitada fue interrumpida.

### Servidor: 18 tests aprobados en una ejecución anterior

- Autenticación, revocación de sesiones, creación de las tres clases y aislamiento por cuenta.
- Rechazo de mensajes falsificados, coordenadas inválidas y campos adicionales.
- Acercamiento, ataque normal, muerte de monstruo compartido, EXP y loot físico.
- Ownership exclusivo hasta 29.999 segundos y pickup público a los 30 segundos, sin doble recogida.
- Crowns y Éter con persistencia y entradas en el ledger.
- Level up, cinco puntos por nivel, validación de distribución y límite 500.
- Ocupación de items de distintos tamaños, requisitos, equipamiento híbrido y bonus de afinidad real.
- Compras, ventas, reparación, pociones, Sanctum y validación de proximidad.
- Mana y cooldown de las cuatro skills de cada clase.
- Aggro, seguridad de Aurelia, muerte y conservación de recursos.
- Pérdida de máximo un equipado y exclusión de items protegidos.
- Resets múltiples y conservación de bolsas, equipo y monedas.
- Persistencia de SQLite después de cerrar y reabrir la base.
- Validación de configuración administrativa y rechazo de spots peligrosos sobre la ciudad.
- Pathfinding alrededor del cristal y rechazo de destinos inválidos.
- Configuración de progresión, rareza relativa de Éter, skills y spots.
- Integración con servidor HTTP/WebSocket real y **diez usuarios simultáneos**: movimiento, snapshots regulares, monstruos comunes y EXP otorgada una sola vez en combate disputado.
- Protección de admin, logout, login y persistencia de los diez usuarios después de reiniciar el servidor aislado.
- Persistencia y aplicación de un cambio administrativo de duración del ciclo al reiniciar.

Esta suite pasó antes de cambios posteriores en renderizado, contenido, efectos y algunas partes de la simulación. Debe repetirse para acreditar el estado final.

### Chrome / Playwright

Una ejecución sobre producción obtuvo **tres tests aprobados y uno fallido**:

1. Las tres clases: escena 3D, spawn, movimiento por clic, cuatro botones de skills, inventario, once slots, equipar/desequipar, drag and drop y nombres de loot ON/OFF.
2. Protección de `/admin` y rechazo de comandos administrativos de usuarios normales.
3. Servicios mediante UI: pociones, puntos manuales, compras, Sanctum, reparación y editor administrativo.

Se inspeccionó visualmente una captura de Aurelia con Vanguard. También se observaron capturas de Arcanist en el diagnóstico multiplayer.

En una prueba multiplayer posterior, ambos navegadores llegaron a recibir snapshots y el cliente A volvió a conectarse como admin. La prueba avanzó hasta la selección de monstruos, pero **no completó el escenario final**.

## Parcialmente implementado o aún sin evidencia suficiente

- El escenario completo A/B existe como test, pero sigue sin aprobación. Se amplió para que A recoja Crowns, encuentre y equipe un item, y reconecte conservando progreso.
- Se implementaron ajustes del arranque para recibir estado antes de iniciar el renderizado y un fallback sin sombras a 30 FPS para renderizadores por software. Falta una validación estable de esos cambios en toda la suite.
- Se añadieron proyectiles visuales de magia y flechas después de un build confirmado. No hay verificación posterior de esos efectos.
- Se intentó una última corrección para separar nombres de loot superpuestos y seleccionar en el test un Sproutling realmente alcanzable con el mouse. La herramienta fue interrumpida por el usuario: **no se verificó si esa operación se aplicó completa ni si inició la ejecución posterior**.
- El ciclo día/noche está implementado y su configuración/reinicio se probaron, pero falta demostrar visualmente ambas fases y la visibilidad nocturna.
- El drop raro de Éter y su pickup están probados en servidor con aleatoriedad controlada. Falta evidencia visual específica del Éter en una sesión de navegador.
- El pathfinding está probado alrededor del cristal; falta ampliar la prueba real de navegación contra edificios, árboles, fuentes, NPCs y las nuevas ruinas.
- La salida caminable de Aurelia está implementada y el test final intenta recorrerla, pero falta una aserción clara de salida por clic sin usar teleport para demostrar ese criterio.
- La interpolación y las animaciones están implementadas; falta una medición de rendimiento y observación visual final con dos clientes.
- La presentación es procedural temporal. No hay arte profesional, música ni sistema completo de pasos y ambiente.
- Los modificadores avanzados y futuras transacciones están previstos en el modelo; no se implementaron crafting, trade ni upgrades profundos, conforme al alcance.

## Bugs y problemas conocidos

- **Prueba multiplayer pendiente:** la última falla observada fue un timeout al clicar un nombre de Sproutling. Otro nombre de monstruo interceptaba el mouse; Playwright también esperaba estabilidad durante el seguimiento de cámara. Es un problema real de solapamiento/interacción que debe resolverse o comprobarse con selección de una etiqueta visible alcanzable.
- Los nombres de varios drops cercanos pueden superponerse. Se intentó una corrección de apilado en la última operación interrumpida; su aplicación y resultado son inciertos.
- El arranque del segundo cliente de Chrome resultó intermitentemente lento y dejó el HUD inicial vacío durante las esperas. Se trabajó en diferir el primer render, actualizar el HUD antes de la escena, evitar lecturas de layout repetidas y reducir el costo en software. Falta demostrar que el problema quedó resuelto de forma estable.
- Las primeras pruebas usaban Vite en desarrollo y las ediciones disparaban recargas que invalidaban las sesiones. Playwright se cambió para probar producción y evitar esa interferencia.
- Los primeros nombres de personajes de test excedían el límite y se truncaban, generando duplicados. Se corrigieron a nombres cortos; las pruebas posteriores de creación pasaron.
- Un observador auxiliar mediante HTTP sufrió `ECONNRESET` en una ejecución. Se eliminó ese tercer cliente auxiliar y se pasó a observar los frames WebSocket reales de A. No se demostró una causa definitiva del reset de conexión.
- Hay una advertencia de Vite por el tamaño del bundle. No impidió compilar; cualquier cambio de particionado debe justificarse con mediciones.
- El entorno restringido bloqueó npm por EACCES y tsx por una llamada de información del usuario del sistema. Instalación y tests pudieron ejecutarse con permisos autorizados. Esto es una limitación del entorno, no una regla del juego.
- La auditoría `docs/verification.md` tiene estados que quedaron desactualizados respecto de las últimas pruebas. No debe usarse como prueba de aceptación final sin reconciliarla.

## Arquitectura

| Área | Archivos | Responsabilidad |
| --- | --- | --- |
| Cliente | `client/main.ts`, `client/style.css` | Auth, selección, HUD, inventarios, NPCs, controles y admin |
| Renderizado | `client/scene.ts` | Three.js, modelos originales, cámara, picking, labels, efectos, interpolación y ciclo visual |
| Transporte | `server/index.ts` | HTTP, cookies, WebSockets, autorización, rate limits, ticks y publicación de snapshots |
| Simulación | `server/game.ts` | Autoridad de movimiento, combate, skills, progresión, muerte, loot, economía y resets |
| Persistencia | `server/database.ts` | SQLite, scrypt, cuentas, sesiones, personajes, settings y ledger |
| Inventario | `server/inventory.ts` | Ocupación, requisitos, afinidad y efectividad por durabilidad |
| Administración | `server/config.ts`, `server/admin-cli.ts` | Validación de overrides, aplicación al arrancar y promoción de una cuenta existente |
| Contenido | `shared/content.ts` | Clases, fórmulas, balance, skills, enemigos, spots, items y NPCs |
| Mundo | `shared/world.ts` | Coordenadas, spawn, seguridad, obstáculos, colisiones y A* |
| Modelo y protocolo | `shared/model.ts`, `shared/protocol.ts` | Datos persistentes/extensibles y comandos estrictos |
| Tests | `tests/*.test.ts`, `tests/browser/game.spec.ts` | Reglas, persistencia, integración de diez clientes y navegador |

SQLite es local y adecuado para una instancia del slice. La base principal se crea en `data/eter.sqlite`; Playwright usa `data/e2e.sqlite` y puerto 3100. La integración de diez clientes usa una base temporal y puerto 3200. El cliente comparte datos y geometría para representar el mundo, pero los resultados permanentes se deciden en el servidor.

## Comandos para usar el proyecto más adelante

Los siguientes comandos son documentación; **no se ejecutaron al crear este informe**.

```powershell
npm.cmd install
npm.cmd run dev
```

Abrir `http://127.0.0.1:3000`. `dev` inicia servidor y cliente integrado con Vite. Crear cuenta, crear personaje y entrar.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd start
```

- `test`: suite de servidor, mundo e integración HTTP/WS.
- `build`: TypeScript y compilación del cliente.
- `test:e2e`: compila y ejecuta Playwright con Chrome instalado y servidor de producción aislado.
- `start`: servidor de producción que sirve `dist`; requiere build previo.

Para promover una cuenta ya registrada:

```powershell
npm.cmd run admin -- nombreDeUsuario
```

Después iniciar sesión y abrir `/admin`. No hay credenciales administrativas predeterminadas.

Variables: `HOST`, `PORT`, `DATABASE_PATH`, `COOKIE_SECURE`. Se leen del proceso; `.env.example` no se carga automáticamente. Con HTTPS, configurar `COOKIE_SECURE=true`. El despliegue requiere proceso Node persistente, WebSocket, proxy HTTPS y volumen duradero para SQLite; no alcanza hosting estático.

## Qué permanece fuera del alcance

No construir party, guilds, trade, PvP avanzado, crafting completo, upgrades profundos, monturas, múltiples mapas independientes, quests/bosses complejos, marketplace, auction house, mascotas, alas funcionales ni clases avanzadas.

## Próximos pasos exactos, solo cuando el usuario autorice retomar

1. Inspeccionar el repositorio y confirmar si la última corrección de labels y selección del test se aplicó completa. No asumirlo a partir del intento interrumpido.
2. Identificar si sobrevivió algún proceso de la ejecución interrumpida antes de iniciar otra prueba. No asumir que todos los servidores/navegadores se cerraron ni lanzar duplicados.
3. Revisar el test final A/B: seleccionar un monstruo realmente alcanzable sin etiquetas superpuestas; verificar que las etiquetas de loot permitan recoger el objeto correcto y que el seguimiento de cámara no invalide el click.
4. Ejecutar TypeScript/build y la suite de 18 tests contra las últimas ediciones. Corregir fallas concretas y repetir solo lo necesario.
5. Ejecutar primero el escenario multiplayer sobre producción con dos clientes. Probar y acreditar: ambos visibles, movimiento, monstruos comunes, kill/EXP de A, pickup Crowns/item y equipamiento de A, rechazo inmediato de B, pickup de B después de 30 segundos y reconexión con progreso intacto.
6. Si vuelve a fallar el arranque de B, medir dónde se bloquea: creación WebGL, primer render, despacho del snapshot o construcción de entidades. Considerar dos procesos Chrome independientes para representar dos usuarios, conservando el mismo servidor y las reglas normales del juego.
7. Repetir la suite de navegador completa con las últimas correcciones: las tres clases, drag/drop, equipamiento, servicios NPC, stats, pociones, Sanctum y admin. Capturar errores de JS, frames y artefactos útiles sin recargas de desarrollo.
8. Agregar/verificar una aserción de salida real por clic desde Aurelia, zoom limitado y navegación alrededor de cada tipo relevante de obstáculo.
9. Obtener evidencia visual de Éter físico, partículas y nombres ON/OFF. Verificar la integración con pickup persistente sin sustituir el drop raro normal por acreditación automática.
10. Acelerar el ciclo en una configuración de prueba aislada y comprobar visualmente día y noche, manteniendo la noche jugable. Verificar que los valores normales del proyecto sigan siendo los previstos.
11. Verificar los proyectiles de Arcanist/Ranger y las nuevas ruinas; medir rendimiento e interpolación en Chrome y mantener la prueba de diez usuarios aprobada.
12. Reconciliar `docs/verification.md` requisito por requisito con evidencia actual. Mantener pendientes los criterios que solo tengan evidencia indirecta o faltante.
13. Revisar README y GAME_DESIGN contra los comandos y comportamiento finales. Ejecutar los checks finales correspondientes al estado definitivo.
14. Completar el Goal únicamente cuando todos los criterios originales y la prueba final estén demostrados. Si falta evidencia o hay errores críticos, continuar iterando sin reducir el alcance.

## Estado al detenerse

El código y la documentación creados se preservan. La última llamada de herramientas fue interrumpida y podría haberse aplicado parcialmente o haber iniciado un proceso; no se verificó ese estado. Este informe no afirma que haya procesos vivos ni que estén todos cerrados. No se iniciaron, inspeccionaron ni detuvieron procesos para redactarlo.
