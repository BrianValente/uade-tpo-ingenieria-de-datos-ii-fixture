load("/workspace/lib/uuid.js");

const projectDatabase = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "fixture2030");

const teamId = uuidV5("equipo:TST");
const playerId = uuidV5("jugador:TST:01");

const existingTeam = projectDatabase.equipos.findOne({ _id: teamId });
let teamInserted = false;
if (!existingTeam) {
  const insertTeamResult = projectDatabase.equipos.insertOne({
    _id: teamId,
    codigo: "TST",
    nombre: "Equipo de demostracion",
    confederacion: "CONMEBOL",
    origenSeleccion: "demostracion",
    etapaClasificacion: "Registro ajeno a los 64 participantes",
    participaFixture2030: false,
  });
  if (!insertTeamResult.acknowledged) throw new Error("No se pudo insertar el equipo de demostracion.");
  teamInserted = true;
}

const existingPlayer = projectDatabase.jugadores.findOne({ _id: playerId });
if (existingPlayer && (existingPlayer.equipoId !== teamId || existingPlayer.equipoCodigo !== "TST")) {
  throw new Error("El jugador de demostracion ya existe con una relacion diferente.");
}

let playerInserted = false;
if (!existingPlayer) {
  const insertPlayerResult = projectDatabase.jugadores.insertOne({
    _id: playerId,
    equipoId: teamId,
    equipoCodigo: "TST",
    nombre: "Jugador",
    apellido: "De demostracion",
    fechaNacimiento: ISODate("2000-01-01T00:00:00Z"),
    posicion: "Arquero",
    dorsal: NumberInt(1),
    alturaCm: NumberInt(185),
    pieHabil: "Derecho",
    convocado: false,
    disponible: true,
    datosSinteticos: true,
  });
  if (!insertPlayerResult.acknowledged) throw new Error("No se pudo insertar el jugador de demostracion.");
  playerInserted = true;
}

const updateTeamResult = projectDatabase.equipos.updateOne(
  { _id: teamId },
  { $set: { sedeEntrenamiento: "Sede de prueba" } },
);
const updatePlayerResult = projectDatabase.jugadores.updateOne(
  { _id: playerId, equipoId: teamId },
  { $set: { disponible: false } },
);

if (updateTeamResult.matchedCount !== 1 || updatePlayerResult.matchedCount !== 1) {
  throw new Error("La actualizacion de demostracion no encontro los documentos esperados.");
}

printjson({
  equipoInsertadoEnEstaEjecucion: teamInserted,
  jugadorInsertadoEnEstaEjecucion: playerInserted,
  equipoInsertadoYActualizado: projectDatabase.equipos.findOne({ _id: teamId }),
  jugadorInsertadoYActualizado: projectDatabase.jugadores.findOne({ _id: playerId }),
});
