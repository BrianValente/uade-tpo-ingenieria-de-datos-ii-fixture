// Conteos esperados luego de una o mas ejecuciones de la carga.
MATCH (n)
WHERE n:Equipo OR n:Jugador OR n:Partido OR n:Sede OR n:Evento
WITH labels(n)[0] AS etiqueta, count(*) AS cantidad
RETURN etiqueta,
       cantidad,
       CASE etiqueta
         WHEN 'Equipo' THEN cantidad = 64
         WHEN 'Jugador' THEN cantidad = 1536
         WHEN 'Partido' THEN cantidad = 32
         WHEN 'Sede' THEN cantidad = 8
         WHEN 'Evento' THEN cantidad = 64
         ELSE false
       END AS cumple
ORDER BY etiqueta;

// Conteos de relaciones canonicas.
MATCH ()-[r]->()
WHERE type(r) IN ['PERTENECE_A', 'DISPUTA', 'SE_JUEGA_EN', 'OCURRE_EN', 'INVOLUCRA']
WITH type(r) AS tipo, count(*) AS cantidad
RETURN tipo,
       cantidad,
       CASE tipo
         WHEN 'PERTENECE_A' THEN cantidad = 1536
         WHEN 'DISPUTA' THEN cantidad = 64
         WHEN 'SE_JUEGA_EN' THEN cantidad = 32
         WHEN 'OCURRE_EN' THEN cantidad = 64
         WHEN 'INVOLUCRA' THEN cantidad = 64
         ELSE false
       END AS cumple
ORDER BY tipo;

// Cada jugador debe pertenecer a un equipo existente.
MATCH (j:Jugador)
WHERE NOT (j)-[:PERTENECE_A]->(:Equipo)
RETURN count(j) AS jugadoresSinEquipo,
       count(j) = 0 AS cumple;

// Cada partido debe tener dos equipos y una sede.
MATCH (p:Partido)
OPTIONAL MATCH (:Equipo)-[r:DISPUTA]->(p)
OPTIONAL MATCH (p)-[s:SE_JUEGA_EN]->(:Sede)
WITH p, count(DISTINCT r) AS equipos, count(DISTINCT s) AS sedes
WHERE equipos <> 2 OR sedes <> 1
RETURN count(p) AS partidosInconsistentes,
       count(p) = 0 AS cumple;

// Cada evento debe vincularse con un partido y un protagonista.
MATCH (e:Evento)
OPTIONAL MATCH (e)-[p:OCURRE_EN]->(:Partido)
OPTIONAL MATCH (e)-[j:INVOLUCRA]->(:Jugador)
WITH e, count(DISTINCT p) AS partidos, count(DISTINCT j) AS protagonistas
WHERE partidos <> 1 OR protagonistas <> 1
RETURN count(e) AS eventosInconsistentes,
       count(e) = 0 AS cumple;

SHOW CONSTRAINTS YIELD name, type, labelsOrTypes, properties
RETURN name, type, labelsOrTypes, properties
ORDER BY name;

SHOW INDEXES YIELD name, type, labelsOrTypes, properties, state
RETURN name, type, labelsOrTypes, properties, state
ORDER BY name;

// Una diferencia hace fallar cypher-shell y, por lo tanto, el proceso de carga.
CALL { MATCH (n:Equipo) RETURN count(n) AS equipos }
CALL { MATCH (n:Jugador) RETURN count(n) AS jugadores }
CALL { MATCH (n:Partido) RETURN count(n) AS partidos }
CALL { MATCH (n:Sede) RETURN count(n) AS sedes }
CALL { MATCH (n:Evento) RETURN count(n) AS eventos }
CALL { MATCH ()-[r:PERTENECE_A]->() RETURN count(r) AS pertenencias }
CALL { MATCH ()-[r:DISPUTA]->() RETURN count(r) AS participaciones }
CALL { MATCH ()-[r:SE_JUEGA_EN]->() RETURN count(r) AS programaciones }
CALL { MATCH ()-[r:OCURRE_EN]->() RETURN count(r) AS ocurrencias }
CALL { MATCH ()-[r:INVOLUCRA]->() RETURN count(r) AS intervenciones }
CALL {
  MATCH (j:Jugador)
  WHERE NOT (j)-[:PERTENECE_A]->(:Equipo)
  RETURN count(j) AS jugadoresSinEquipo
}
CALL {
  MATCH (p:Partido)
  OPTIONAL MATCH (:Equipo)-[r:DISPUTA]->(p)
  OPTIONAL MATCH (p)-[s:SE_JUEGA_EN]->(:Sede)
  WITH p, count(DISTINCT r) AS equiposPorPartido, count(DISTINCT s) AS sedesPorPartido
  WHERE equiposPorPartido <> 2 OR sedesPorPartido <> 1
  RETURN count(p) AS partidosInconsistentes
}
CALL {
  MATCH (e:Evento)
  OPTIONAL MATCH (e)-[p:OCURRE_EN]->(:Partido)
  OPTIONAL MATCH (e)-[j:INVOLUCRA]->(:Jugador)
  WITH e, count(DISTINCT p) AS partidosPorEvento, count(DISTINCT j) AS protagonistas
  WHERE partidosPorEvento <> 1 OR protagonistas <> 1
  RETURN count(e) AS eventosInconsistentes
}
CALL apoc.util.validate(
  equipos <> 64 OR jugadores <> 1536 OR partidos <> 32 OR sedes <> 8 OR eventos <> 64 OR
  pertenencias <> 1536 OR participaciones <> 64 OR programaciones <> 32 OR
  ocurrencias <> 64 OR intervenciones <> 64 OR jugadoresSinEquipo <> 0 OR
  partidosInconsistentes <> 0 OR eventosInconsistentes <> 0,
  'La verificacion del subgrafo fallo',
  []
)
RETURN 'Subgrafo valido' AS resultado;
