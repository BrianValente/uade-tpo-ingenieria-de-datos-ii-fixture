const databaseName = process.env.MONGO_INITDB_DATABASE || "fixture2030";
const projectDatabase = db.getSiblingDB(databaseName);

const uuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

const validators = {
  equipos: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "_id",
        "codigo",
        "nombre",
        "confederacion",
        "origenSeleccion",
        "etapaClasificacion",
        "participaFixture2030",
      ],
      properties: {
        _id: { bsonType: "string", pattern: uuidPattern },
        codigo: { bsonType: "string", pattern: "^[A-Z]{3}$" },
        nombre: { bsonType: "string", minLength: 2, maxLength: 80 },
        confederacion: {
          enum: ["AFC", "CAF", "CONCACAF", "CONMEBOL", "OFC", "UEFA"],
        },
        origenSeleccion: {
          enum: ["clasificado_2026", "adicional_eliminatorias", "demostracion"],
        },
        etapaClasificacion: { bsonType: "string", minLength: 2, maxLength: 120 },
        participaFixture2030: { bsonType: "bool" },
        sedeEntrenamiento: { bsonType: "string", minLength: 2, maxLength: 100 },
      },
    },
  },
  jugadores: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "_id",
        "codigo",
        "equipoId",
        "equipoCodigo",
        "nombre",
        "apellido",
        "fechaNacimiento",
        "posicion",
        "dorsal",
        "alturaCm",
        "pieHabil",
        "convocado",
        "disponible",
        "datosSinteticos",
      ],
      properties: {
        _id: { bsonType: "string", pattern: uuidPattern },
        codigo: { bsonType: "string", pattern: "^[A-Z]{3}-[0-9]{2}$" },
        equipoId: { bsonType: "string", pattern: uuidPattern },
        equipoCodigo: { bsonType: "string", pattern: "^[A-Z]{3}$" },
        nombre: { bsonType: "string", minLength: 2, maxLength: 80 },
        apellido: { bsonType: "string", minLength: 2, maxLength: 80 },
        fechaNacimiento: { bsonType: "date" },
        posicion: { enum: ["Arquero", "Defensor", "Mediocampista", "Delantero"] },
        dorsal: { bsonType: "int", minimum: 1, maximum: 99 },
        alturaCm: { bsonType: "int", minimum: 150, maximum: 220 },
        pieHabil: { enum: ["Derecho", "Izquierdo"] },
        convocado: { bsonType: "bool" },
        disponible: { bsonType: "bool" },
        datosSinteticos: { bsonType: "bool" },
      },
    },
  },
};

for (const [collectionName, validator] of Object.entries(validators)) {
  if (!projectDatabase.getCollectionNames().includes(collectionName)) {
    projectDatabase.createCollection(collectionName, {
      validator,
      validationLevel: "strict",
      validationAction: "error",
    });
  } else {
    projectDatabase.runCommand({
      collMod: collectionName,
      validator,
      validationLevel: "strict",
      validationAction: "error",
    });
  }
}

projectDatabase.equipos.createIndex(
  { codigo: 1 },
  { name: "equipos_codigo_unico", unique: true },
);
projectDatabase.jugadores.createIndex(
  { codigo: 1 },
  { name: "jugadores_codigo_unico", unique: true },
);
projectDatabase.jugadores.createIndex(
  { equipoId: 1, posicion: 1, dorsal: 1 },
  { name: "jugadores_equipo_posicion_dorsal" },
);

print(`Colecciones y validaciones configuradas en ${databaseName}.`);
