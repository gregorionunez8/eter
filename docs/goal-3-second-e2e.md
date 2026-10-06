# Goal #3: segunda corrida completa

2026-10-06. `npm.cmd run test:e2e` ejecutó TypeScript, build de producción y los once escenarios Chrome. Resultado: **4 aprobados, 7 fallidos**, 30,4 minutos. Goal #3 sigue pendiente; estos resultados no sustituyen la aceptación visual ni el historial de Goal #2.

Pasaron farmeo normal de Vanguard/Arcanist/Ranger con cámara cercana, target, EXP y pickups; clic sostenido; protección del admin; formularios admin, contenido y auditoría.

Fallos observados:

- Cámara/las tres clases: comparación exacta de zoom tras rueda, 8,5000000305 frente a 8,5. Se corrigió la comparación con tolerancia de cinco decimales; se mantienen los límites reales.
- Multiplayer: después de dos reconexiones, el segundo cliente envió una intención de movimiento y permaneció en el spawn durante la espera. La causa no está demostrada. El observador ahora descarta frames de conexiones anteriores y registra notices/último snapshot.
- Servicios: una petición admin recibió `ECONNRESET`; la suite continuó, por lo que no demuestra caída del servidor.
- Inspección visual extensa: agotó 180 segundos después de rutas, zoom, oclusión, día/noche y parte de regiones. Se amplió el presupuesto total a 360 segundos y se garantiza limpieza aunque la página ya esté cerrada. No se reducen validaciones.
- Diez jugadores: preparación de clientes WS no finalizó dentro del presupuesto; no produjo métricas válidas. No se afirma cumplimiento de los límites de rendimiento.
- Software: el segundo cliente recibió frames observados por Chrome, pero el HUD quedó vacío durante la espera de 90 segundos. Pendiente de diagnóstico; aumentar el tiempo total no resolvió la condición.
- Recorrido principiante: alcanzó nivel 2, equipo, asignación manual de puntos, regreso y compra; el clic sobre Brom quedó cubierto por el encabezado transparente. Se corrigió `pointer-events` del encabezado conservando interacción en sus botones.

Las capturas revisadas de login, ciudad a 1280×720 y primer combate muestran mayor presencia de actores y HUD compacto. Falta revisar y aprobar el conjunto final. Copia local del JSON y capturas de esta corrida en `data/goal-3-second-e2e/` (artefactos excluidos de Git). Los tests usan DBs aisladas; no se prepararon imágenes modificando la DB del propietario.
