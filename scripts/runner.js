// scripts/runner.js
// Ejecutor unificado de Inicialización, Carga y Consultas para Fixture 2030

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Cargar variables de entorno si existe .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [k, ...v] = trimmed.split('=');
      process.env[k.trim()] = v.join('=').trim();
    }
  });
}

const user = process.env.MONGO_ROOT_USERNAME || 'admin';
const pass = process.env.MONGO_ROOT_PASSWORD || 'password';
const host = process.env.MONGO_HOST || '127.0.0.1';
const port = process.env.MONGO_PORT || '27017';
const dbName = process.env.MONGO_DATABASE || 'fixture2030';

const uri = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/?authSource=admin`;

async function getClient() {
  const client = new MongoClient(uri);
  await client.connect();
  return client;
}

global.print = console.log;

async function seedData(db) {
  print("=======================================================");
  print("Iniciando Carga Inicial de Datos en " + dbName);
  print("=======================================================");

  const dataDir = path.join(__dirname, '..', 'data');
  const rawEquipos = JSON.parse(fs.readFileSync(path.join(dataDir, 'equipos.json'), 'utf-8'));
  const rawJugadores = JSON.parse(fs.readFileSync(path.join(dataDir, 'jugadores.json'), 'utf-8'));

  const equiposToInsert = rawEquipos.map(e => ({
    ...e,
    creado_en: new Date(e.creado_en),
    actualizado_en: new Date(e.actualizado_en)
  }));

  const jugadoresToInsert = rawJugadores.map(j => ({
    ...j,
    creado_en: new Date(j.creado_en),
    actualizado_en: new Date(j.actualizado_en)
  }));

  const equiposOps = equiposToInsert.map(equipo => ({
    updateOne: {
      filter: { codigo_fifa: equipo.codigo_fifa },
      update: { $set: equipo },
      upsert: true
    }
  }));

  const equiposRes = await db.collection('equipos').bulkWrite(equiposOps);
  const totalEquipos = await db.collection('equipos').countDocuments();
  print(`✓ Equipos procesados: ${equiposRes.upsertedCount + equiposRes.matchedCount} | Total en DB: ${totalEquipos}`);

  const jugadoresOps = jugadoresToInsert.map(jugador => ({
    updateOne: {
      filter: { equipo_codigo: jugador.equipo_codigo, numero_camiseta: jugador.numero_camiseta },
      update: { $set: jugador },
      upsert: true
    }
  }));

  const jugadoresRes = await db.collection('jugadores').bulkWrite(jugadoresOps);
  const totalJugadores = await db.collection('jugadores').countDocuments();
  print(`✓ Jugadores procesados: ${jugadoresRes.upsertedCount + jugadoresRes.matchedCount} | Total en DB: ${totalJugadores}`);

  print("=======================================================");
  print("✓ Carga Inicial Completada con Éxito sin Duplicados.");
  print("=======================================================");
}

async function setupValidation(db) {
  print("=======================================================");
  print("Configurando Validación JSON Schema...");
  print("=======================================================");
  
  // Esquema Equipos
  const equiposSchema = {
    $jsonSchema: {
      bsonType: "object",
      required: ["codigo_fifa", "nombre", "confederacion", "ranking_fifa", "grupo", "entrenador"],
      properties: {
        codigo_fifa: { bsonType: "string", pattern: "^[A-Z]{3}$" },
        nombre: { bsonType: "string", minLength: 2, maxLength: 60 },
        confederacion: { enum: ["CONMEBOL", "UEFA", "CONCACAF", "CAF", "AFC", "OFC"] },
        ranking_fifa: { bsonType: "int", minimum: 1, maximum: 211 },
        grupo: { bsonType: "string", pattern: "^Grupo [A-P]$" },
        entrenador: {
          bsonType: "object",
          required: ["nombre", "nacionalidad"],
          properties: {
            nombre: { bsonType: "string" },
            nacionalidad: { bsonType: "string" },
            edad: { bsonType: "int", minimum: 25, maximum: 95 }
          }
        },
        titulos_mundiales: { bsonType: "int", minimum: 0 },
        estadio_sede_principal: { bsonType: "string" },
        activo: { bsonType: "bool" }
      }
    }
  };

  // Esquema Jugadores
  const jugadoresSchema = {
    $jsonSchema: {
      bsonType: "object",
      required: ["nombre", "apellido", "equipo_codigo", "equipo_nombre", "posicion", "numero_camiseta", "edad", "club_actual"],
      properties: {
        nombre: { bsonType: "string", minLength: 2, maxLength: 50 },
        apellido: { bsonType: "string", minLength: 2, maxLength: 50 },
        equipo_codigo: { bsonType: "string", pattern: "^[A-Z]{3}$" },
        equipo_nombre: { bsonType: "string" },
        posicion: { enum: ["Arquero", "Defensor", "Mediocampista", "Delantero"] },
        numero_camiseta: { bsonType: "int", minimum: 1, maximum: 99 },
        edad: { bsonType: "int", minimum: 15, maximum: 50 },
        club_actual: {
          bsonType: "object",
          required: ["nombre", "pais", "liga"],
          properties: {
            nombre: { bsonType: "string" },
            pais: { bsonType: "string" },
            liga: { bsonType: "string" }
          }
        }
      }
    }
  };

  const collections = (await db.listCollections().toArray()).map(c => c.name);

  if (!collections.includes('equipos')) {
    await db.createCollection('equipos', { validator: equiposSchema, validationLevel: 'strict', validationAction: 'error' });
  } else {
    await db.command({ collMod: 'equipos', validator: equiposSchema, validationLevel: 'strict', validationAction: 'error' });
  }

  if (!collections.includes('jugadores')) {
    await db.createCollection('jugadores', { validator: jugadoresSchema, validationLevel: 'strict', validationAction: 'error' });
  } else {
    await db.command({ collMod: 'jugadores', validator: jugadoresSchema, validationLevel: 'strict', validationAction: 'error' });
  }

  print("✓ Validaciones JSON Schema aplicadas estrictamente.");
}

async function setupIndexes(db) {
  print("=======================================================");
  print("Creando Índices Estratégicos...");
  print("=======================================================");

  await db.collection('equipos').createIndex({ codigo_fifa: 1 }, { unique: true, name: "idx_equipos_codigo_fifa_unique" });
  await db.collection('equipos').createIndex({ confederacion: 1 }, { name: "idx_equipos_confederacion" });
  await db.collection('equipos').createIndex({ grupo: 1, ranking_fifa: 1 }, { name: "idx_equipos_grupo_ranking" });

  await db.collection('jugadores').createIndex({ equipo_codigo: 1, posicion: 1 }, { name: "idx_jugadores_equipo_posicion" });
  await db.collection('jugadores').createIndex({ equipo_codigo: 1, numero_camiseta: 1 }, { unique: true, name: "idx_jugadores_equipo_dorsal_unique" });
  await db.collection('jugadores').createIndex({ apellido: 1, nombre: 1 }, { name: "idx_jugadores_apellido_nombre" });
  await db.collection('jugadores').createIndex({ "club_actual.liga": 1 }, { name: "idx_jugadores_club_liga" });
  await db.collection('jugadores').createIndex({ valor_mercado_eur: -1 }, { name: "idx_jugadores_valor_mercado_desc" });
  await db.collection('jugadores').createIndex({ edad: 1 }, { name: "idx_jugadores_edad" });

  print("✓ Índices creados y verificados exitosamente.");
}

async function main() {
  const action = process.argv[2] || 'all';
  console.log(`Conectando a MongoDB en ${host}:${port}...`);
  
  let client;
  try {
    client = await getClient();
    const db = client.db(dbName);
    console.log(`✓ Conexión establecida con la base de datos '${dbName}'.\n`);

    if (action === 'init' || action === 'all') {
      await setupValidation(db);
      await setupIndexes(db);
      await seedData(db);
    }

    if (action === 'queries' || action === 'all') {
      const targetDb = {
        equipos: db.collection('equipos'),
        jugadores: db.collection('jugadores')
      };

      // 1. Inserciones
      const { runInserts } = require('../queries/01-inserts');
      await runInserts(targetDb);

      // 2. Updates
      const { runUpdates } = require('../queries/02-updates');
      await runUpdates(targetDb);

      // 3. Queries
      const { runQueries } = require('../queries/03-queries');
      await runQueries(targetDb);

      // 4. Aggregations
      const { runAggregations } = require('../queries/04-aggregations');
      await runAggregations(targetDb);

      // 5. Benchmark explain
      const { runExplainBenchmark } = require('../queries/05-explain-benchmark');
      await runExplainBenchmark(targetDb);
    }

    console.log("\n=======================================================");
    console.log("✓ EJECUCIÓN DEL MÓDULO DOCUMENTAL COMPLETADA CON ÉXITO");
    console.log("=======================================================");
  } catch (err) {
    console.error("✗ Error en la ejecución:", err);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

if (require.main === module) {
  main();
}
