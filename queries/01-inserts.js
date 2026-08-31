// queries/01-inserts.js
// Operaciones de Inserción y Validación de Integridad (RF7, RF9, RNF3)

const databaseName = process.env.MONGO_INITDB_DATABASE || "fixture2030";
const projectDatabase = typeof db !== "undefined" ? db.getSiblingDB(databaseName) : null;

async function runInserts(targetDb) {
  const currentDb = targetDb || projectDatabase;
  print("\n=======================================================");
  print("1. OPERACIÓN DE INSERCIÓN Y VALIDACIÓN DE ESQUEMA (RF9)");
  print("=======================================================");

  // 1.1 Inserción de un nuevo equipo VÁLIDO
  const nuevoEquipoValido = {
    codigo_fifa: "SUI",
    nombre: "Suiza",
    confederacion: "UEFA",
    ranking_fifa: 17,
    grupo: "Grupo N",
    entrenador: {
      nombre: "Murat Yakin",
      nacionalidad: "Suiza",
      edad: 52
    },
    titulos_mundiales: 0,
    estadio_sede_principal: "St. Jakob-Park, Basilea",
    activo: true,
    creado_en: new Date(),
    actualizado_en: new Date()
  };

  try {
    const resEquipo = await currentDb.equipos.updateOne(
      { codigo_fifa: nuevoEquipoValido.codigo_fifa },
      { $set: nuevoEquipoValido },
      { upsert: true }
    );
    print("✓ [ÉXITO] Inserción/Upsert de equipo válido completada (SUI).");
  } catch (err) {
    print("✗ [ERROR] Error al insertar equipo válido: " + err.message);
  }

  // 1.2 Inserción de un nuevo jugador VÁLIDO
  const nuevoJugadorValido = {
    nombre: "Manuel",
    apellido: "Akanji",
    equipo_codigo: "SUI",
    equipo_nombre: "Suiza",
    posicion: "Defensor",
    numero_camiseta: 5,
    edad: 31,
    fecha_nacimiento: "1995-07-19",
    altura_cm: 188,
    peso_kg: 85,
    pie_habil: "Derecho",
    club_actual: {
      nombre: "Manchester City",
      pais: "Inglaterra",
      liga: "Premier League"
    },
    estadisticas_seleccion: {
      partidos_jugados: 65,
      goles: 3,
      asistencias: 2,
      tarjetas_amarillas: 8,
      tarjetas_rojas: 0
    },
    valor_mercado_eur: 38000000,
    capitan: false,
    titular_habitual: true,
    creado_en: new Date(),
    actualizado_en: new Date()
  };

  try {
    const resJugador = await currentDb.jugadores.updateOne(
      { equipo_codigo: nuevoJugadorValido.equipo_codigo, numero_camiseta: nuevoJugadorValido.numero_camiseta },
      { $set: nuevoJugadorValido },
      { upsert: true }
    );
    print("✓ [ÉXITO] Inserción/Upsert de jugador válido completada (Manuel Akanji #5 SUI).");
  } catch (err) {
    print("✗ [ERROR] Error al insertar jugador válido: " + err.message);
  }

  // 1.3 PRUEBA DE RECHAZO POR JSON SCHEMA (Validación estricta de confederación inválida)
  print("\n--- Comprobación de Reglas de Validación (JSON Schema) ---");
  const equipoInvalido = {
    codigo_fifa: "XYZ",
    nombre: "Equipo Ficticio",
    confederacion: "LIGA_INVALIDA", // Valor no permitido por el enum ['CONMEBOL', 'UEFA', ...]
    ranking_fifa: 999,              // Fuera de rango (máx 211)
    grupo: "Grupo Z",               // Patrón regex inválido
    entrenador: {
      nombre: "Test",
      nacionalidad: "Test"
    }
  };

  try {
    await currentDb.equipos.insertOne(equipoInvalido);
    print("✗ [FALLO] El documento inválido fue insertado incorrectamente (el validador no actuó).");
  } catch (err) {
    print("✓ [VALIDACIÓN EXITOSA] El motor rechazó correctamente el documento con datos inválidos.");
    print("  Mensaje del validador: " + (err.errInfo?.details?.schemaRulesNotComplied?.[0]?.missingProperties || err.message));
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { runInserts };
} else {
  runInserts();
}
