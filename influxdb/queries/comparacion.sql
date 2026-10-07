-- La muestra tiene seis observaciones equidistantes por equipo.
-- MAX solo representa el ultimo contador en esta muestra sin correcciones ni reinicios.
SELECT equipo_id, COUNT(*) AS muestras,
       AVG(posesion_pct) AS posesion_promedio,
       MAX(tiros_acumulados) AS tiros_final,
       SUM(pases_intervalo) AS pases
FROM estadisticas_equipo
WHERE partido_id = $partido
  AND time >= CAST($inicio AS TIMESTAMP)
  AND time < CAST($fin AS TIMESTAMP)
GROUP BY equipo_id
ORDER BY equipo_id;
