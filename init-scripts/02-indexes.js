// 02-indexes.js
// Script de creación de índices para optimizar consultas frecuentes y garantizar integridad

const databaseName = process.env.MONGO_INITDB_DATABASE || "fixture2030";
const projectDatabase = db.getSiblingDB(databaseName);

print(`=======================================================`);
print(`Creando índices para colecciones en: ${databaseName}`);
print(`=======================================================`);

// 1. Índices en la colección 'equipos'
print("Creando índices en 'equipos'...");

// Índice único por Código FIFA (Identificador natural de negocio)
projectDatabase.equipos.createIndex(
  { codigo_fifa: 1 },
  { unique: true, name: "idx_equipos_codigo_fifa_unique" }
);

// Índice para filtros rápidos por confederación
projectDatabase.equipos.createIndex(
  { confederacion: 1 },
  { name: "idx_equipos_confederacion" }
);

// Índice compuesto para consultas de fixture por grupo y ordenadas por ranking
projectDatabase.equipos.createIndex(
  { grupo: 1, ranking_fifa: 1 },
  { name: "idx_equipos_grupo_ranking" }
);

// 2. Índices en la colección 'jugadores'
print("Creando índices en 'jugadores'...");

// Índice compuesto para buscar plantel por equipo y posición
projectDatabase.jugadores.createIndex(
  { equipo_codigo: 1, posicion: 1 },
  { name: "idx_jugadores_equipo_posicion" }
);

// Índice compuesto único para garantizar que no haya dorsales repetidos dentro de una misma selección
projectDatabase.jugadores.createIndex(
  { equipo_codigo: 1, numero_camiseta: 1 },
  { unique: true, name: "idx_jugadores_equipo_dorsal_unique" }
);

// Índice para búsquedas por apellido y nombre
projectDatabase.jugadores.createIndex(
  { apellido: 1, nombre: 1 },
  { name: "idx_jugadores_apellido_nombre" }
);

// Índice sobre campo embebido para filtros y agregaciones por liga del club
projectDatabase.jugadores.createIndex(
  { "club_actual.liga": 1 },
  { name: "idx_jugadores_club_liga" }
);

// Índice descendente para ordenar por valor de mercado (Top jugadores más valiosos)
projectDatabase.jugadores.createIndex(
  { valor_mercado_eur: -1 },
  { name: "idx_jugadores_valor_mercado_desc" }
);

// Índice para filtros por edad (ej: jugadores Sub-23 o veteranos)
projectDatabase.jugadores.createIndex(
  { edad: 1 },
  { name: "idx_jugadores_edad" }
);

print("✓ Índices creados y verificados exitosamente.");
