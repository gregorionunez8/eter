# Éter — diseño del vertical slice

Éter es la energía natural fundamental del mundo. Aurelia creció alrededor de un cristal y brinda seguridad, servicios y un punto de regreso. Un entorno luminoso de piedra clara, vegetación y magia sobria acompaña reglas simples de MMORPG clásico. El arte temporal usa geometría original procedural.

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

La prueba A/B usa el mismo bundle de producción y reglas normales, con aleatoriedad reproducible solamente en su entry point de test. La evidencia visual de Éter y día/noche usa un mundo temporal con frecuencia/ciclo acelerados, documentado en README; no modifica los valores normales de Crowns 90%, Éter 3.5%, items 30% ni el ciclo de 600 segundos. Los efectos de skills son básicos y procedurales; la auditoría distingue funcionamiento demostrado de revisión artística subjetiva.
