// Equipos participantes del Hito 4. El UUID se conserva sin cambios.
LOAD CSV WITH HEADERS FROM 'file:///equipos.csv' AS row
WITH row
WHERE row.participaFixture2030 = 'true'
MERGE (e:Equipo {id: row._id})
SET e.codigo = row.codigo,
    e.nombre = row.nombre,
    e.confederacion = row.confederacion,
    e.origen = 'Hito 4 - MongoDB';

// Jugadores de los 64 equipos participantes.
LOAD CSV WITH HEADERS FROM 'file:///jugadores.csv' AS row
MATCH (e:Equipo {id: row.equipoId})
MERGE (j:Jugador {id: row._id})
SET j.nombre = row.nombre,
    j.apellido = row.apellido,
    j.posicion = row.posicion,
    j.dorsal = toInteger(row.dorsal),
    j.equipoCodigo = row.equipoCodigo,
    j.origen = 'Hito 4 - MongoDB'
MERGE (j)-[:PERTENECE_A]->(e);

// Sedes academicas distribuidas entre las tres regiones del Hito 3.
LOAD CSV WITH HEADERS FROM 'file:///sedes.csv' AS row
MERGE (s:Sede {id: row.id})
SET s.nombre = row.nombre,
    s.ciudad = row.ciudad,
    s.pais = row.pais,
    s.region = row.region;

// Cada equipo participa en un partido de la muestra.
LOAD CSV WITH HEADERS FROM 'file:///partidos.csv' AS row
MATCH (local:Equipo {codigo: row.localCodigo})
MATCH (visitante:Equipo {codigo: row.visitanteCodigo})
MATCH (s:Sede {id: row.sedeId})
MERGE (p:Partido {id: row.id})
SET p.fecha = date(row.fecha),
    p.hora = time(row.hora),
    p.fase = row.fase
MERGE (local)-[rl:DISPUTA]->(p)
SET rl.condicion = 'local'
MERGE (visitante)-[rv:DISPUTA]->(p)
SET rv.condicion = 'visitante'
MERGE (p)-[:SE_JUEGA_EN]->(s);

// Los eventos se vinculan con su partido y con un protagonista.
LOAD CSV WITH HEADERS FROM 'file:///eventos.csv' AS row
MATCH (p:Partido {id: row.partidoId})
MATCH (j:Jugador {
  equipoCodigo: row.equipoCodigo,
  dorsal: toInteger(row.dorsal)
})
MERGE (e:Evento {id: row.id})
SET e.tipo = row.tipo,
    e.minuto = toInteger(row.minuto),
    e.detalle = row.detalle,
    e.datosSinteticos = true
MERGE (e)-[:OCURRE_EN]->(p)
MERGE (e)-[r:INVOLUCRA]->(j)
SET r.rol = 'protagonista';
