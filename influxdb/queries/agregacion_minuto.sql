-- Calcula un resumen. No lo almacena en la base historica.
SELECT date_trunc('minute', time) AS minuto, equipo_id,
       COUNT(*) AS muestras, AVG(posesion_pct) AS posesion_promedio,
       MAX(tiros_acumulados) AS tiros_final, SUM(pases_intervalo) AS pases
FROM estadisticas_equipo
WHERE partido_id = $partido
  AND time >= CAST($inicio AS TIMESTAMP)
  AND time < CAST($fin AS TIMESTAMP)
GROUP BY date_trunc('minute', time), equipo_id
ORDER BY minuto, equipo_id;
