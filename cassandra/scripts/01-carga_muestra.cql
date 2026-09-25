USE fixture2030_comentarios;

-- La muestra usa claves fijas. Repetir este archivo produce upserts sobre las mismas filas.
INSERT INTO comentarios_por_partido
(partido_id, bucket_minuto, grupo, creado_en, comentario_id, usuario_id,
 usuario_nombre, contenido, estado, likes, respuestas)
VALUES
('F2030-DEMO', '2030-06-13 20:01:00+0000', 1,
 '2030-06-13 20:01:02+0000', 11111111-1111-1111-1111-111111111111,
 aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa, 'Sofia',
 'Gran inicio de partido', 'visible', 4, 1);

INSERT INTO comentarios_por_usuario
(usuario_id, bucket_mes, creado_en, comentario_id, partido_id,
 usuario_nombre, contenido, estado, likes, respuestas)
VALUES
(aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa, '2030-06-01',
 '2030-06-13 20:01:02+0000', 11111111-1111-1111-1111-111111111111,
 'F2030-DEMO', 'Sofia', 'Gran inicio de partido', 'visible', 4, 1);

INSERT INTO comentarios_por_partido
(partido_id, bucket_minuto, grupo, creado_en, comentario_id, usuario_id,
 usuario_nombre, contenido, estado, likes, respuestas)
VALUES
('F2030-DEMO', '2030-06-13 20:01:00+0000', 2,
 '2030-06-13 20:01:08+0000', 22222222-2222-2222-2222-222222222222,
 bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb, 'Mateo',
 'Que buena atajada', 'visible', 7, 0);

INSERT INTO comentarios_por_usuario
(usuario_id, bucket_mes, creado_en, comentario_id, partido_id,
 usuario_nombre, contenido, estado, likes, respuestas)
VALUES
(bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb, '2030-06-01',
 '2030-06-13 20:01:08+0000', 22222222-2222-2222-2222-222222222222,
 'F2030-DEMO', 'Mateo', 'Que buena atajada', 'visible', 7, 0);

INSERT INTO comentarios_por_partido
(partido_id, bucket_minuto, grupo, creado_en, comentario_id, usuario_id,
 usuario_nombre, contenido, estado, likes, respuestas)
VALUES
('F2030-DEMO', '2030-06-13 20:01:00+0000', 3,
 '2030-06-13 20:01:11+0000', 33333333-3333-3333-3333-333333333333,
 aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa, 'Sofia',
 'Se viene el primer gol', 'pendiente', 0, 0);

INSERT INTO comentarios_por_usuario
(usuario_id, bucket_mes, creado_en, comentario_id, partido_id,
 usuario_nombre, contenido, estado, likes, respuestas)
VALUES
(aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa, '2030-06-01',
 '2030-06-13 20:01:11+0000', 33333333-3333-3333-3333-333333333333,
 'F2030-DEMO', 'Sofia', 'Se viene el primer gol', 'pendiente', 0, 0);
