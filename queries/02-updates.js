// queries/02-updates.js
// Operaciones de Actualización Atómica y Mantenimiento de Integridad (RF9, RNF3)

const databaseName = process.env.MONGO_INITDB_DATABASE || "fixture2030";
const projectDatabase = typeof db !== "undefined" ? db.getSiblingDB(databaseName) : null;

async function runUpdates(targetDb) {
  const currentDb = targetDb || projectDatabase;
  print("\n=======================================================");
  print("2. OPERACIONES DE ACTUALIZACIÓN Y MODIFICACIÓN (RF9)");
  print("=======================================================");

  // 2.1 Actualizar información del Director Técnico de una Selección (Argentina)
  print("\n--- 2.1 Actualización de Entrenador en Selección (ARG) ---");
  const resUpdateTeam = await currentDb.equipos.updateOne(
    { codigo_fifa: "ARG" },
    {
      $set: {
        "entrenador.edad": 53,
        estadio_sede_principal: "Estadio Mâs Monumental, Buenos Aires",
        actualizado_en: new Date()
      }
    }
  );
  print(`✓ Equipo ARG actualizado. Matched: ${resUpdateTeam.matchedCount}, Modified: ${resUpdateTeam.modifiedCount}`);

  // 2.2 Actualización de estadísticas y valor de mercado de un jugador (Incremento atómico $inc)
  print("\n--- 2.2 Actualización de Estadísticas de Jugador (Dorsal 10 de Argentina) ---");
  const resUpdatePlayer = await currentDb.jugadores.updateOne(
    { equipo_codigo: "ARG", numero_camiseta: 10 },
    {
      $inc: {
        "estadisticas_seleccion.partidos_jugados": 1,
        "estadisticas_seleccion.goles": 2,
        "estadisticas_seleccion.asistencias": 1
      },
      $set: {
        valor_mercado_eur: 65000000,
        actualizado_en: new Date()
      }
    }
  );
  print(`✓ Jugador ARG #10 actualizado con $inc. Matched: ${resUpdatePlayer.matchedCount}, Modified: ${resUpdatePlayer.modifiedCount}`);

  // 2.3 Traspaso de club de un jugador (Actualización de objeto embebido)
  print("\n--- 2.3 Traspaso de Club (Jugador #9 de Brasil) ---");
  const resTransfer = await currentDb.jugadores.updateOne(
    { equipo_codigo: "BRA", numero_camiseta: 9 },
    {
      $set: {
        club_actual: {
          nombre: "Real Madrid",
          pais: "España",
          liga: "LaLiga"
        },
        valor_mercado_eur: 110000000,
        actualizado_en: new Date()
      }
    }
  );
  print(`✓ Club de jugador BRA #9 actualizado. Matched: ${resTransfer.matchedCount}, Modified: ${resTransfer.modifiedCount}`);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { runUpdates };
} else {
  runUpdates();
}
