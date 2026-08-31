// 01-schema-validation.js
// Configuración de colecciones y validación estricta con JSON Schema Validator

const databaseName = process.env.MONGO_INITDB_DATABASE || "fixture2030";
const projectDatabase = db.getSiblingDB(databaseName);

print(`=======================================================`);
print(`Aplicando JSON Schema Validator en la base: ${databaseName}`);
print(`=======================================================`);

// 1. Definición del Esquema para la colección 'equipos'
const equiposSchema = {
  $jsonSchema: {
    bsonType: "object",
    required: ["codigo_fifa", "nombre", "confederacion", "ranking_fifa", "grupo", "entrenador"],
    properties: {
      codigo_fifa: {
        bsonType: "string",
        pattern: "^[A-Z]{3}$",
        description: "Código FIFA de 3 letras mayúsculas único (ej: ARG, BRA, FRA)"
      },
      nombre: {
        bsonType: "string",
        minLength: 2,
        maxLength: 60,
        description: "Nombre oficial del país o selección nacional"
      },
      confederacion: {
        enum: ["CONMEBOL", "UEFA", "CONCACAF", "CAF", "AFC", "OFC"],
        description: "Confederación continental oficial a la que pertenece"
      },
      ranking_fifa: {
        bsonType: "int",
        minimum: 1,
        maximum: 211,
        description: "Puesto en el Ranking FIFA oficial (entero entre 1 y 211)"
      },
      grupo: {
        bsonType: "string",
        pattern: "^Grupo [A-P]$",
        description: "Grupo asignado en el Fixture 2030 (Grupos A a P para 64 equipos)"
      },
      entrenador: {
        bsonType: "object",
        required: ["nombre", "nacionalidad"],
        properties: {
          nombre: {
            bsonType: "string",
            description: "Nombre y apellido del director técnico"
          },
          nacionalidad: {
            bsonType: "string",
            description: "Nacionalidad del director técnico"
          },
          edad: {
            bsonType: "int",
            minimum: 25,
            maximum: 95,
            description: "Edad del director técnico"
          }
        }
      },
      titulos_mundiales: {
        bsonType: "int",
        minimum: 0,
        description: "Cantidad de Copas del Mundo obtenidas"
      },
      estadio_sede_principal: {
        bsonType: "string",
        description: "Estadio o sede designada para la fase de grupos"
      },
      activo: {
        bsonType: "bool",
        description: "Estado de participación en el fixture"
      },
      creado_en: {
        bsonType: "date"
      },
      actualizado_en: {
        bsonType: "date"
      }
    }
  }
};

// 2. Definición del Esquema para la colección 'jugadores'
const jugadoresSchema = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "nombre",
      "apellido",
      "equipo_codigo",
      "equipo_nombre",
      "posicion",
      "numero_camiseta",
      "edad",
      "club_actual"
    ],
    properties: {
      nombre: {
        bsonType: "string",
        minLength: 2,
        maxLength: 50,
        description: "Nombre de pila del jugador"
      },
      apellido: {
        bsonType: "string",
        minLength: 2,
        maxLength: 50,
        description: "Apellido del jugador"
      },
      equipo_codigo: {
        bsonType: "string",
        pattern: "^[A-Z]{3}$",
        description: "Referencia foránea por Código FIFA al equipo correspondiente"
      },
      equipo_nombre: {
        bsonType: "string",
        description: "Campo desnormalizado para consultas rápidas sin requerir lookup"
      },
      posicion: {
        enum: ["Arquero", "Defensor", "Mediocampista", "Delantero"],
        description: "Posición principal del jugador en el campo de juego"
      },
      numero_camiseta: {
        bsonType: "int",
        minimum: 1,
        maximum: 99,
        description: "Dorsal asignado en la selección (entero 1 a 99)"
      },
      edad: {
        bsonType: "int",
        minimum: 15,
        maximum: 50,
        description: "Edad del jugador"
      },
      fecha_nacimiento: {
        bsonType: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Fecha de nacimiento en formato YYYY-MM-DD"
      },
      altura_cm: {
        bsonType: "int",
        minimum: 140,
        maximum: 230,
        description: "Altura del jugador en centímetros"
      },
      peso_kg: {
        bsonType: "int",
        minimum: 50,
        maximum: 130,
        description: "Peso del jugador en kilogramos"
      },
      pie_habil: {
        enum: ["Derecho", "Izquierdo", "Ambidiestro"],
        description: "Pie hábil del jugador"
      },
      club_actual: {
        bsonType: "object",
        required: ["nombre", "pais", "liga"],
        properties: {
          nombre: { bsonType: "string" },
          pais: { bsonType: "string" },
          liga: { bsonType: "string" }
        }
      },
      estadisticas_seleccion: {
        bsonType: "object",
        properties: {
          partidos_jugados: { bsonType: "int", minimum: 0 },
          goles: { bsonType: "int", minimum: 0 },
          asistencias: { bsonType: "int", minimum: 0 },
          tarjetas_amarillas: { bsonType: "int", minimum: 0 },
          tarjetas_rojas: { bsonType: "int", minimum: 0 }
        }
      },
      valor_mercado_eur: {
        bsonType: "number",
        minimum: 0,
        description: "Valor de mercado estimado en Euros"
      },
      capitan: {
        bsonType: "bool",
        description: "Indica si es el capitán de la selección"
      },
      titular_habitual: {
        bsonType: "bool",
        description: "Indica si suele formar parte del once titular"
      },
      creado_en: {
        bsonType: "date"
      },
      actualizado_en: {
        bsonType: "date"
      }
    }
  }
};

// Aplicar validaciones a 'equipos'
if (!projectDatabase.getCollectionNames().includes("equipos")) {
  projectDatabase.createCollection("equipos", {
    validator: equiposSchema,
    validationLevel: "strict",
    validationAction: "error"
  });
  print("✓ Colección 'equipos' creada con validación JSON Schema.");
} else {
  projectDatabase.runCommand({
    collMod: "equipos",
    validator: equiposSchema,
    validationLevel: "strict",
    validationAction: "error"
  });
  print("✓ Validación JSON Schema aplicada exitosamente a la colección existente 'equipos'.");
}

// Aplicar validaciones a 'jugadores'
if (!projectDatabase.getCollectionNames().includes("jugadores")) {
  projectDatabase.createCollection("jugadores", {
    validator: jugadoresSchema,
    validationLevel: "strict",
    validationAction: "error"
  });
  print("✓ Colección 'jugadores' creada con validación JSON Schema.");
} else {
  projectDatabase.runCommand({
    collMod: "jugadores",
    validator: jugadoresSchema,
    validationLevel: "strict",
    validationAction: "error"
  });
  print("✓ Validación JSON Schema aplicada exitosamente a la colección existente 'jugadores'.");
}

print(`=======================================================`);
print(`Validaciones JSON Schema inicializadas correctamente.`);
print(`=======================================================`);
