// CREATE: el identificador fijo permite repetir la demostracion sin duplicar.
MATCH (p:Partido {id: 'F2030-001'})
MATCH (j:Jugador {equipoCodigo: 'ARG', dorsal: 9})
MERGE (e:EventoDemo {id: 'DEMO-EVENTO-001'})
ON CREATE SET e.tipo = 'Gol', e.minuto = 88, e.detalle = 'Evento temporal de demostracion'
MERGE (e)-[:OCURRE_EN]->(p)
MERGE (e)-[:INVOLUCRA]->(j)
RETURN e.id AS creado, e.tipo AS tipo, p.id AS partido;

// READ: recuperacion precisa del nodo de demostracion y sus relaciones.
MATCH (e:EventoDemo {id: 'DEMO-EVENTO-001'})-[:OCURRE_EN]->(p:Partido)
MATCH (e)-[:INVOLUCRA]->(j:Jugador)
RETURN e.id AS evento, e.minuto AS minuto, p.id AS partido,
       j.nombre + ' ' + j.apellido AS protagonista;

// UPDATE: modifica solo el nodo de demostracion.
MATCH (e:EventoDemo {id: 'DEMO-EVENTO-001'})
SET e.minuto = 89,
    e.detalle = 'Evento temporal actualizado'
RETURN e.id AS actualizado, e.minuto AS minuto, e.detalle AS detalle;

// DELETE: el patron queda limitado por etiqueta e identificador de demostracion.
MATCH (e:EventoDemo {id: 'DEMO-EVENTO-001'})
DETACH DELETE e
RETURN 'DEMO-EVENTO-001' AS eliminado;
