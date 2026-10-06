# Primera corrida completa de Goal #3 (historial de iteración)

2026-10-06, `npm.cmd run test:e2e`, Chrome sobre producción, AMD Radeon R5 / ANGLE D3D11. **5/11 aprobados**, 6 fallos, aproximadamente 34.6 minutos. Este resultado no acredita el estado posterior a las correcciones.

| Escenario | Resultado y observación |
| --- | --- |
| Tres clases, cámara y grillas | Falló el drag de una poción en Arcanist. Se estabilizó el panel durante drag y se verificó el mismo ID. Una corrida posterior aprobó las tres clases. |
| Farmeo normal melee/ranged y pickups, tres clases | Aprobado. Imágenes de Vanguard, Arcanist y Ranger inspeccionadas. Mediana de frame 40.2 / 33.9 / 40.9 ms y 86 / 91 / 89 draw calls en este hardware. No es benchmark de dos clientes. |
| Movimiento sostenido por clic | Aprobado. |
| Dos clientes, combate/ownership/persistencia | Falló una ruta de B por timeout de posición; requiere diagnóstico de comandos y nueva ejecución. No se da por acreditado. |
| Seguridad de admin | Aprobado. |
| Shops/pociones/stats/Sanctum/reparación/admin | Aprobado. |
| Formularios admin y auditoría | Aprobado. |
| Visuales: rutas, día/noche, Éter, doce skills | El servidor visual aislado perdió una conexión HTTP. Nueva ejecución debe conservar logs/exitCode para determinar la causa. |
| Diez conexiones con dos renderizando | Excedió el presupuesto total al preparar clientes. Se aumentó el presupuesto de setup; límites medidos de frames/red/draw calls no se relajaron. Performance final pendiente. |
| SwiftShader | Excedió el presupuesto total. Se redujo el render continuo del preview por CPU y se aumentó el presupuesto total de setup; gates individuales de readiness permanecen. Arranque final pendiente. |
| Loop principiante sin admin | El panel de target persistía al regresar y podía tapar un NPC. Se limpia selección al caminar/interactuar. En otra corrida se obtuvieron drops, nivel 4 y 15 puntos, pero el fixture rechazaba arcos/bastones por exigir stats iniciales; ahora distribuye puntos ganados antes de equipar un drop real. Recorrido completo posterior pendiente. |

Después: superficies de ciudad se difuminan y clearings se integran al albedo, acceso/select usan el mapa jugable, sesión se comprueba antes de descargar modelos, skills de soporte/movilidad mantienen modo de ataque y Ranger usa sonido de arco. **33/33 tests de servidor aprobados**; la segunda suite completa debe validar el conjunto. El goal permanece activo.
