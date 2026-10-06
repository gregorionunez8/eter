# Éter — diseño del vertical slice

Éter es la energía natural fundamental del mundo. Aurelia creció alrededor de un cristal y brinda seguridad, servicios y un punto de regreso. Un entorno luminoso de piedra clara, vegetación y magia sobria acompaña reglas simples de MMORPG clásico. Goal #2 está completo y conserva la simulación de Goal #1 con una presentación original de fantasía clásica: materiales texturados, personajes articulados/equipados, arquitectura medieval, armilar de Éter y UI compacta. La aceptación y sus límites se registran en `docs/verification.md`.

## Presentación y equipo de Goal #2

Los once slots son Casco, Pechera, Pantalón, Guantes, Botas, Arma, Secundaria, Alas, Collar y dos Anillos. No existe un slot Armor ni un slot Set. IDs como `steel-armor` conservan su identidad de item, usando ahora `chest`; SQLite migra saves antiguos sin perder instancias. Las cinco piezas tienen soporte visual sobre los joints del cuerpo. Arma, escudo y pechera se representan en el mundo y en la selección; requisitos y afinidad conservan builds híbridas. `setId` agrupa piezas para una futura extensión sin activar bonus nuevos. Calidad y Suerte preparan presentación/datos; no implementan upgrades.

La cámara isométrica parte de zoom 16 y limita 12–26. Clic y arrastre sostenido sobre suelo envían intenciones de movimiento; elegir un enemigo mantiene acercamiento y ataque autoritativos. Picking usa volúmenes invisibles más cómodos, independientes de la colisión de juego. Indicador de objetivo y etiquetas separadas mantienen legibilidad. Efectos de daño, proyectiles, animaciones y números consumen eventos de servidor; no deciden resultados ni retrasan los ticks para simular impactos.

Crowns tienen pilas de monedas y cantidades formateadas. Éter es un fragmento flotante sobrio, con halo, motas y sonido propio. Items llevan la ilustración original de su categoría al suelo. Ningún recurso se acredita sin pickup. HUD y bolsas usan iconos originales, cooldown/mana visible, tooltips con requisitos/durabilidad/afinidad y layout de equipo con figura humana central. No hay tutorial obligatorio.

Aurelia mantiene ciudad segura, spawn, NPCs y salidas. Edificios reciben mampostería, vigas, cubiertas inclinadas, ventanas y talleres. Vegetación y caminos rodean claros de farmeo estables. Whisperwood añade árboles grandes y sotobosque; Stonepass cambia a piedra erosionada y bordes de roca; Ether Ruins tiene columnas estriadas, muros rotos y losas. El terreno mezcla colores de región y caminos erosionados sin límites rectangulares de material. Nuevos props y relieves bloqueantes comparten huellas con el servidor.

Administración usa formularios y validación central, con edición avanzada de JSON opcional. El contenido se aplica al reiniciar para mantener coherencia entre clientes, colisión y simulación; acciones de jugadores son inmediatas y registradas. Los valores iniciales de combate/loot y la progresión de resets se conservan; el ritmo básico ya es de encuentros cortos y respawn gradual de 12–25 segundos. No se introduce rebalance definitivo.

## Mundo y recorrido

Un mapa de 160×160 unidades, ciudad segura centrada y cuatro puertas caminables. Greenfields al sur para iniciación, Whisperwood al oeste, Stonepass al este y Ether Ruins al norte. Las coordenadas son las mismas para simulación, minimapa y admin. Los spots fijos crean lugares de farmeo legibles. Los ocho enemigos tienen crecimiento de HP, daño, defensa y EXP. Aggro y leash mantienen la dificultad local; nadie puede combatir dentro de Aurelia.

## Personajes y combate

Vanguard hombre guerrero, Arcanist hombre mago y Ranger mujer arquera. Solo se eligen nombre y clase. Ataque automático al seleccionar monstruo, acercamiento por pathfinding y rango por clase. Cuatro skills propias con mana y cooldown; daño, área, cono, movilidad, control, buffs y curación. Q/W consumen pociones reales. El servidor decide resultados, objetivos, recursos y muerte.

Fuerza incrementa daño físico y permite equipo pesado; Agilidad incrementa precisión, velocidad y defensa; Vitalidad vida y resistencia; Energía mana y daño mágico. Cinco puntos manuales por nivel. Los items requieren stats y otorgan afinidad adicional por clase ideal, permitiendo equipo híbrido. Durabilidad baja reduce bonus y cero elimina el aporte; Brom repara con Crowns.

## Progresión y economía

EXP creciente por fórmula, nivel máximo 500. Reset restaura nivel 1 y stats base, conserva items, Sanctum y recursos, y entrega 300 puntos por reset acumulados. No se pierden recursos o EXP al morir; 0.5% de chance de soltar como máximo un equipado, con exclusión para items especiales.

Crowns y Éter siempre caen al suelo. Éter es mucho más raro y se reconoce por color, emisión y motas discretas. Solo el killer puede recoger durante 30 segundos; luego cualquiera. Cada drop es una entidad compartida. Inventario y Sanctum son cuadrículas de 8×8 con items de tamaño distinto. Orin permite depositar y retirar. NPCs ofrecen tiendas, reparación, almacenamiento, skills, portal local y reset.

## Extensión y límites

Instancias de items contienen modificadores, upgradeLevel, metadata y protección de muerte. El ledger separa transacciones de recursos para extensiones de trade/crafting/combinaciones/upgrades. No se implementan esos sistemas, party, guilds, PvP avanzado, mascotas, monturas, alas funcionales ni mapas independientes. Las skills iniciales están disponibles desde creación para poder probar el slice sin grinding de desbloqueos.

Configuración central en TypeScript y overrides validados en SQLite editables por admin, aplicados con reinicio seguro. Toda operación administrativa exige cuenta admin. Red independiente del frame, interpolación del cliente, límites de payload y frecuencia. Persistencia por usuario y personaje. La aceptación depende de tests de servidor, ejecución de Chrome y prueba multiplayer real, no solo del código escrito.

Las etiquetas interactivas se separan usando su tamaño real para que loot, NPCs y monstruos no se intercepten entre sí. El HUD permanece por encima de las etiquetas. Los modelos de otros jugadores dejan pasar los clics de caminar porque Goal #1 no tiene una acción de clic sobre jugadores. Cada drop copia únicamente coordenadas de su origen y recibe un ID propio, independiente del monstruo.

La prueba A/B usa el mismo bundle de producción y reglas normales, con aleatoriedad reproducible solamente en su entry point de test. La evidencia visual de Éter y día/noche usa un mundo temporal con frecuencia/ciclo acelerados, documentado en README; no modifica los valores normales de Crowns 90%, Éter 3.5%, items 30% ni el ciclo de 600 segundos. Las doce skills tienen efectos originales sincronizados por source/target/skill ID; la auditoría distingue funcionamiento demostrado de revisión artística subjetiva. Un recorrido adicional obtiene niveles, Crowns e item por farmeo normal, equipa y vuelve caminando a tiendas/reparación/Sanctum sin herramientas admin.
