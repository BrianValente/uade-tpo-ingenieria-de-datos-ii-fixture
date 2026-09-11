// Restricciones de identidad compartida con el modulo documental.
CREATE CONSTRAINT equipo_id_unico IF NOT EXISTS
FOR (e:Equipo) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT jugador_id_unico IF NOT EXISTS
FOR (j:Jugador) REQUIRE j.id IS UNIQUE;

CREATE CONSTRAINT partido_id_unico IF NOT EXISTS
FOR (p:Partido) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT sede_id_unico IF NOT EXISTS
FOR (s:Sede) REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT evento_id_unico IF NOT EXISTS
FOR (e:Evento) REQUIRE e.id IS UNIQUE;

// Indices vinculados con filtros y recorridos frecuentes.
CREATE INDEX jugador_equipo_dorsal IF NOT EXISTS
FOR (j:Jugador) ON (j.equipoCodigo, j.dorsal);

CREATE INDEX partido_fecha IF NOT EXISTS
FOR (p:Partido) ON (p.fecha);

CREATE INDEX evento_tipo IF NOT EXISTS
FOR (e:Evento) ON (e.tipo);
