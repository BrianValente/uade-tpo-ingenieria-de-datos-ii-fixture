USE fixture2030_comentarios;

-- Secuencia descendente dentro de una particion concreta del feed.
SELECT creado_en, comentario_id, usuario_nombre, contenido, estado, likes
FROM comentarios_por_partido
WHERE partido_id = 'F2030-DEMO'
  AND bucket_minuto = '2030-06-13 20:01:00+0000'
  AND grupo = 1
LIMIT 20;

-- Ventana temporal compatible con las columnas de clustering.
SELECT creado_en, comentario_id, usuario_nombre, contenido
FROM comentarios_por_partido
WHERE partido_id = 'F2030-DEMO'
  AND bucket_minuto = '2030-06-13 20:01:00+0000'
  AND grupo = 2
  AND creado_en >= '2030-06-13 20:01:00+0000'
  AND creado_en <  '2030-06-13 20:01:10+0000'
LIMIT 20;

-- Acceso secundario: historial mensual de un usuario, sin ALLOW FILTERING.
SELECT creado_en, comentario_id, partido_id, contenido, estado, likes
FROM comentarios_por_usuario
WHERE usuario_id = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
  AND bucket_mes = '2030-06-01'
LIMIT 20;
