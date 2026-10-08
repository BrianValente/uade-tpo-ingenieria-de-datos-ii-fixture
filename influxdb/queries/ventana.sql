-- Una ventana es [inicio, fin): incluye inicio y excluye fin.
SELECT time, equipo_id, posesion_pct, tiros_acumulados, pases_intervalo
FROM estadisticas_equipo
WHERE partido_id = $partido AND equipo_id = $equipo
  AND time >= CAST($inicio AS TIMESTAMP)
  AND time < CAST($fin AS TIMESTAMP)
ORDER BY time;
