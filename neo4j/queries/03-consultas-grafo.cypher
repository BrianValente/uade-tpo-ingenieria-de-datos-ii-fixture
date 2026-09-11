// Q1. Recorrido de tres relaciones: jugador -> equipo -> partido -> sede.
MATCH path = (j:Jugador {equipoCodigo: 'ARG', dorsal: 9})
  -[:PERTENECE_A]->(e:Equipo)
  -[:DISPUTA]->(p:Partido)
  -[:SE_JUEGA_EN]->(s:Sede)
RETURN j.nombre + ' ' + j.apellido AS jugador,
       e.nombre AS equipo,
       p.id AS partido,
       p.fecha AS fecha,
       s.nombre AS sede,
       path
ORDER BY fecha;

// Q2. Recorrido de eventos de un equipo hasta sus rivales.
MATCH (equipo:Equipo {codigo: 'ARG'})<-[:PERTENECE_A]-(j:Jugador)
  <-[:INVOLUCRA]-(evento:Evento)-[:OCURRE_EN]->(p:Partido)
  <-[:DISPUTA]-(rival:Equipo)
WHERE rival <> equipo
RETURN evento.minuto AS minuto,
       evento.tipo AS tipo,
       j.nombre + ' ' + j.apellido AS protagonista,
       p.id AS partido,
       rival.nombre AS rival
ORDER BY minuto;

// Q3. Programacion por fecha con local, visitante y sede.
MATCH (local:Equipo)-[rl:DISPUTA {condicion: 'local'}]->(p:Partido)
MATCH (visitante:Equipo)-[rv:DISPUTA {condicion: 'visitante'}]->(p)
MATCH (p)-[:SE_JUEGA_EN]->(s:Sede)
WHERE p.fecha >= date('2030-06-13') AND p.fecha <= date('2030-06-16')
RETURN p.id AS partido,
       p.fecha AS fecha,
       local.nombre AS local,
       visitante.nombre AS visitante,
       s.nombre AS sede
ORDER BY fecha, partido;

// Q4. Eventos filtrados por tipo y ordenados dentro del partido.
MATCH (e:Evento {tipo: 'Gol'})-[:OCURRE_EN]->(p:Partido)
MATCH (e)-[:INVOLUCRA]->(j:Jugador)-[:PERTENECE_A]->(equipo:Equipo)
RETURN p.id AS partido,
       e.minuto AS minuto,
       j.nombre + ' ' + j.apellido AS protagonista,
       equipo.nombre AS equipo
ORDER BY partido, minuto;

// Q5. Analisis de conectividad entre dos jugadores rivales.
MATCH (a:Jugador {equipoCodigo: 'ARG', dorsal: 9})
MATCH (b:Jugador {equipoCodigo: 'BRA', dorsal: 4})
MATCH path = shortestPath((a)-[*..6]-(b))
RETURN a.nombre + ' ' + a.apellido AS origen,
       b.nombre + ' ' + b.apellido AS destino,
       length(path) AS cantidadRelaciones,
       [n IN nodes(path) | coalesce(n.id, n.codigo)] AS recorrido,
       path;
