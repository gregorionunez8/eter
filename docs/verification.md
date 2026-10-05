# Auditoría de aceptación de Éter

Estado: en progreso. No declarar Goal completo hasta verificar todos los criterios y escenario final.

## Evidencia obtenida

- `npm.cmd install`: 33 paquetes instalados, auditoría sin vulnerabilidades.
- `npm.cmd test`: 18 pruebas aprobadas, incluyendo servidor HTTP/WebSocket real, diez usuarios, combate concurrente, rechazo de mensajes falsificados y reinicio con persistencia.
- `npm.cmd run build`: tipos y build de producción aprobados; corregida después una advertencia CSS, requiere repetir build final.
- Chrome/Playwright: prueba de las tres clases aprobada (renderizado, movimiento por clic, equipar/desequipar, cuadrícula y nombres ON/OFF). Protección HTTP de admin aprobada. El escenario completo de dos navegadores sigue en diagnóstico; no se considera aprobado.

## Criterios originales (57)

1. Dependencias instaladas — verificado.
2. Cliente y servidor arrancan sin errores críticos — pendiente navegador/runtime.
3. Build de producción — aprobado preliminar; repetir al final.
4. Registro — servidor aprobado; navegador pendiente.
5. Login — servidor aprobado; navegador pendiente.
6. Crear tres clases — servidor aprobado; navegador pendiente.
7. Spawn en Aurelia — servidor aprobado; navegador pendiente.
8. Caminar por clic — pendiente navegador.
9. Cámara isométrica — pendiente inspección visual.
10. Salir caminando de Aurelia — pendiente navegador.
11. Múltiples spots — contenido y test aprobados.
12. Respawn — simulación aprobada.
13. Aggro y ataques — simulación aprobada.
14. Ataque normal — simulación aprobada; navegador pendiente.
15. Cuatro skills por clase — contenido y test aprobados.
16. Mana/cooldown de skills — servidor aprobado.
17. EXP al matar — servidor aprobado.
18. Level up — servidor aprobado.
19. Cinco puntos/nivel — servidor aprobado.
20. Distribución de cuatro stats — servidor aprobado; UI pendiente.
21. Drops físicos — entidades servidor aprobadas; render pendiente.
22. Crowns físicos — servidor aprobado; navegador pendiente.
23. Éter raro — configuración/test aprobados; render pendiente.
24. Distinción visual de Éter — pendiente visual.
25. Exclusividad killer 30s — servidor aprobado; multiplayer real pendiente.
26. Recoger públicamente después — servidor aprobado; multiplayer real pendiente.
27. ON/OFF nombres — pendiente navegador.
28. Cuadrícula inventario — servidor aprobado; UI pendiente.
29. Tamaños diferentes — servidor aprobado; UI pendiente.
30. Equipar/desequipar — servidor aprobado; UI pendiente.
31. Requisitos stats — servidor aprobado.
32. Equipo híbrido — servidor aprobado.
33. Afinidad aporta beneficio — servidor aprobado.
34. Durabilidad — servidor aprobado.
35. Reparación Brom — servidor aprobado; UI pendiente.
36. Pociones — servidor aprobado; UI pendiente.
37. Compras Crowns — servidor aprobado; UI pendiente.
38. Sanctum — servidor aprobado; UI pendiente.
39. Ciclo día/noche — pendiente visual/runtime.
40. Minimapa — pendiente navegador.
41. Coordenadas — pendiente navegador.
42. Muerte reaparece — servidor aprobado.
43. Drop equipado configurable — servidor aprobado.
44. Nivel máximo 500 — servidor aprobado.
45. Reset — servidor aprobado.
46. Reset conserva bolsas/recursos — servidor aprobado.
47. Reset a nivel 1/stats base — servidor aprobado.
48. Bonus reset configurable — servidor aprobado.
49. Dos usuarios simultáneos visibles — pendiente navegador.
50. Mismos monstruos — snapshots servidor aprobado; navegador pendiente.
51. Competencia por monstruos — servidor aprobado preliminar; concurrencia real pendiente.
52. Persistencia logout/reinicio — SQLite aprobado; runtime completo pendiente.
53. /admin protegido — pendiente HTTP/navegador.
54. Admin modifica balance — schema aprobado; panel y reinicio pendientes.
55. Documentación — README y GAME_DESIGN escritos; auditar al finalizar.
56. Assets originales — geometría/materiales/audio generados por código propio; revisar bundle final.
57. Sin errores críticos que impidan jugar — no demostrado hasta completar pruebas finales.

## Gates adicionales de alcance

- Diez jugadores simultáneos con gameplay estable: integración aprobada; cada cliente recibió al menos diez snapshots en dos segundos y el combate compartido otorgó EXP una sola vez.
- Escenario final A recoge Crowns y item, equipa; B ownership 30s y reconexión: pendiente.
- Drag/drop real y colisiones de edificios, árboles y NPCs: pruebas de servidor preliminares, navegador pendiente.
- Edición admin persiste y se aplica al reiniciar: pendiente.
- Rendimiento razonable y movimiento interpolado: implementación presente, medición pendiente.
