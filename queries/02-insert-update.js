const crypto = require("crypto");
const projectDatabase = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "fixture2030");
const namespace = "d650d6d8-e518-5f7d-8917-7ff4cc50bc94";

/**
 * Genera el mismo UUID v5 que usa la carga principal para una clave logica.
 *
 * Este archivo conserva la funcion local para poder ejecutarse de forma
 * independiente con `mongosh`. El namespace y la clave determinan por completo
 * el resultado, por lo que la demostracion no crea IDs distintos al repetirse.
 *
 * @param {string} logicalKey Clave estable con prefijo de tipo de entidad.
 * @returns {string} UUID v5 en formato canonico.
 */
function uuidV5(logicalKey) {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = crypto
    .createHash("sha1")
    .update(Buffer.concat([namespaceBytes, Buffer.from(logicalKey, "utf8")]))
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hexadecimal = hash.subarray(0, 16).toString("hex");
  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join("-");
}

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
    fuente: { url: "local://demostracion", revision: "demo-1" },
    actualizadoEn: new Date(),
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
    codigo: "TST-01",
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
    actualizadoEn: new Date(),
  });
  if (!insertPlayerResult.acknowledged) throw new Error("No se pudo insertar el jugador de demostracion.");
  playerInserted = true;
}

const updateTeamResult = projectDatabase.equipos.updateOne(
  { _id: teamId },
  { $set: { sedeEntrenamiento: "Sede de prueba", actualizadoEn: new Date() } },
);
const updatePlayerResult = projectDatabase.jugadores.updateOne(
  { _id: playerId, equipoId: teamId },
  { $set: { disponible: false, actualizadoEn: new Date() } },
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
