-- Evidencia del esquema y de la version observada.
SHOW VERSION;
DESCRIBE KEYSPACE fixture2030_comentarios;

USE fixture2030_comentarios;

-- Cada UUID de la muestra se ubica en el grupo indicado por su resto modulo 16.
SELECT COUNT(*) AS comentarios_grupo_1
FROM comentarios_por_partido
WHERE partido_id = 'F2030-DEMO'
  AND bucket_minuto = '2030-06-13 20:01:00+0000'
  AND grupo = 1;

SELECT COUNT(*) AS comentarios_grupo_2
FROM comentarios_por_partido
WHERE partido_id = 'F2030-DEMO'
  AND bucket_minuto = '2030-06-13 20:01:00+0000'
  AND grupo = 2;

SELECT COUNT(*) AS comentarios_grupo_3
FROM comentarios_por_partido
WHERE partido_id = 'F2030-DEMO'
  AND bucket_minuto = '2030-06-13 20:01:00+0000'
  AND grupo = 3;

-- El historial mensual de Sofia debe devolver dos filas.
SELECT COUNT(*) AS comentarios_usuario
FROM comentarios_por_usuario
WHERE usuario_id = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
  AND bucket_mes = '2030-06-01';
