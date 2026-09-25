-- Keyspace de laboratorio. Un nodo local requiere factor de replicacion 1.
CREATE KEYSPACE IF NOT EXISTS fixture2030_comentarios
WITH replication = {
    'class': 'SimpleStrategy',
    'replication_factor': 1
};

USE fixture2030_comentarios;

-- Consulta principal: comentarios de un partido, minuto y grupo, mas recientes primero.
CREATE TABLE IF NOT EXISTS comentarios_por_partido (
    partido_id text,
    bucket_minuto timestamp,
    grupo tinyint,
    creado_en timestamp,
    comentario_id uuid,
    usuario_id uuid,
    usuario_nombre text,
    contenido text,
    estado text,
    likes int,
    respuestas int,
    PRIMARY KEY ((partido_id, bucket_minuto, grupo), creado_en, comentario_id)
) WITH CLUSTERING ORDER BY (creado_en DESC, comentario_id ASC)
  AND comment = 'Comentarios por partido, minuto y grupo de distribucion';

-- Consulta secundaria: historial mensual de comentarios de un usuario.
CREATE TABLE IF NOT EXISTS comentarios_por_usuario (
    usuario_id uuid,
    bucket_mes date,
    creado_en timestamp,
    comentario_id uuid,
    partido_id text,
    usuario_nombre text,
    contenido text,
    estado text,
    likes int,
    respuestas int,
    PRIMARY KEY ((usuario_id, bucket_mes), creado_en, comentario_id)
) WITH CLUSTERING ORDER BY (creado_en DESC, comentario_id ASC)
  AND comment = 'Historial mensual de comentarios por usuario';
