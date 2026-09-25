USE fixture2030_comentarios;

-- CREATE: la aplicacion escribe la misma vista en las dos tablas.
INSERT INTO comentarios_por_partido
(partido_id, bucket_minuto, grupo, creado_en, comentario_id, usuario_id,
 usuario_nombre, contenido, estado, likes, respuestas)
VALUES
('F2030-DEMO', '2030-06-13 20:02:00+0000', 13,
 '2030-06-13 20:02:15+0000', dddddddd-dddd-dddd-dddd-dddddddddddd,
 cccccccc-cccc-cccc-cccc-cccccccccccc, 'Lucia',
 'Comentario temporal para CRUD', 'visible', 0, 0);

INSERT INTO comentarios_por_usuario
(usuario_id, bucket_mes, creado_en, comentario_id, partido_id,
 usuario_nombre, contenido, estado, likes, respuestas)
VALUES
(cccccccc-cccc-cccc-cccc-cccccccccccc, '2030-06-01',
 '2030-06-13 20:02:15+0000', dddddddd-dddd-dddd-dddd-dddddddddddd,
 'F2030-DEMO', 'Lucia', 'Comentario temporal para CRUD', 'visible', 0, 0);

-- READ: cada lectura conoce la clave de particion completa.
SELECT * FROM comentarios_por_partido
WHERE partido_id = 'F2030-DEMO'
  AND bucket_minuto = '2030-06-13 20:02:00+0000'
  AND grupo = 13
LIMIT 10;

-- UPDATE: se identifica la fila completa y se mantienen ambas vistas.
UPDATE comentarios_por_partido SET likes = 1
WHERE partido_id = 'F2030-DEMO'
  AND bucket_minuto = '2030-06-13 20:02:00+0000'
  AND grupo = 13
  AND creado_en = '2030-06-13 20:02:15+0000'
  AND comentario_id = dddddddd-dddd-dddd-dddd-dddddddddddd;

SELECT partido_id, creado_en, comentario_id, likes
FROM comentarios_por_partido
WHERE partido_id = 'F2030-DEMO'
  AND bucket_minuto = '2030-06-13 20:02:00+0000'
  AND grupo = 13
  AND creado_en = '2030-06-13 20:02:15+0000'
  AND comentario_id = dddddddd-dddd-dddd-dddd-dddddddddddd;

UPDATE comentarios_por_usuario SET likes = 1
WHERE usuario_id = cccccccc-cccc-cccc-cccc-cccccccccccc
  AND bucket_mes = '2030-06-01'
  AND creado_en = '2030-06-13 20:02:15+0000'
  AND comentario_id = dddddddd-dddd-dddd-dddd-dddddddddddd;

-- DELETE: el borrado preciso genera tombstones en ambas vistas.
DELETE FROM comentarios_por_partido
WHERE partido_id = 'F2030-DEMO'
  AND bucket_minuto = '2030-06-13 20:02:00+0000'
  AND grupo = 13
  AND creado_en = '2030-06-13 20:02:15+0000'
  AND comentario_id = dddddddd-dddd-dddd-dddd-dddddddddddd;

SELECT partido_id, creado_en, comentario_id
FROM comentarios_por_partido
WHERE partido_id = 'F2030-DEMO'
  AND bucket_minuto = '2030-06-13 20:02:00+0000'
  AND grupo = 13
  AND creado_en = '2030-06-13 20:02:15+0000'
  AND comentario_id = dddddddd-dddd-dddd-dddd-dddddddddddd;

DELETE FROM comentarios_por_usuario
WHERE usuario_id = cccccccc-cccc-cccc-cccc-cccccccccccc
  AND bucket_mes = '2030-06-01'
  AND creado_en = '2030-06-13 20:02:15+0000'
  AND comentario_id = dddddddd-dddd-dddd-dddd-dddddddddddd;
