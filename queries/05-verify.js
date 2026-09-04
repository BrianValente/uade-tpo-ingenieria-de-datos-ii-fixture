const projectDatabase = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "fixture2030");

/**
 * Cuenta documentos existentes que no cumplen el validador activo.
 *
 * `collMod` aplica el validador a escrituras futuras, pero no corrige documentos
 * anteriores. Por eso esta comprobacion recupera el `$jsonSchema` configurado y
 * lo aplica tambien al estado que ya esta guardado en la coleccion.
 *
 * @param {string} collectionName Nombre de la coleccion que se debe comprobar.
 * @returns {number} Cantidad de documentos que incumplen el esquema actual.
 * @throws {Error} Si la coleccion no tiene un validador configurado.
 */
function invalidDocumentCount(collectionName) {
  const collectionInfo = projectDatabase.getCollectionInfos({ name: collectionName })[0];
  const validator = collectionInfo?.options?.validator;
  if (!validator) throw new Error(`La coleccion ${collectionName} no tiene validador.`);
  const collection = projectDatabase.getCollection(collectionName);
  return collection.countDocuments({ $nor: [validator] });
}

const participatingTeams = projectDatabase.equipos.countDocuments({ participaFixture2030: true });
const participatingTeamIds = projectDatabase.equipos
  .find({ participaFixture2030: true }, { _id: 1 })
  .toArray()
  .map((team) => team._id);
const participatingPlayers = projectDatabase.jugadores.countDocuments({
  equipoId: { $in: participatingTeamIds },
});
const orphanPlayers = projectDatabase.jugadores
  .aggregate([
    {
      $lookup: {
        from: "equipos",
        localField: "equipoId",
        foreignField: "_id",
        as: "equipo",
      },
    },
    { $match: { equipo: { $size: 0 } } },
    { $count: "cantidad" },
  ])
  .toArray()[0]?.cantidad || 0;
const inconsistentReferences = projectDatabase.jugadores
  .aggregate([
    {
      $lookup: {
        from: "equipos",
        localField: "equipoId",
        foreignField: "_id",
        as: "equipo",
      },
    },
    { $unwind: "$equipo" },
    { $match: { $expr: { $ne: ["$equipoCodigo", "$equipo.codigo"] } } },
    { $count: "cantidad" },
  ])
  .toArray()[0]?.cantidad || 0;
const invalidSquads = projectDatabase.jugadores
  .aggregate([
    { $match: { equipoId: { $in: participatingTeamIds } } },
    { $group: { _id: "$equipoId", jugadores: { $sum: 1 } } },
    { $match: { jugadores: { $ne: 24 } } },
    { $count: "cantidad" },
  ])
  .toArray()[0]?.cantidad || 0;
const invalidTeams = invalidDocumentCount("equipos");
const invalidPlayers = invalidDocumentCount("jugadores");

const result = {
  equiposParticipantes: participatingTeams,
  jugadoresDeParticipantes: participatingPlayers,
  jugadoresSinEquipo: orphanPlayers,
  referenciasInconsistentes: inconsistentReferences,
  plantelesConCantidadDistintaDe24: invalidSquads,
  equiposInvalidosSegunSchema: invalidTeams,
  jugadoresInvalidosSegunSchema: invalidPlayers,
};

printjson(result);

if (
  participatingTeams !== 64 ||
  participatingPlayers !== 1536 ||
  orphanPlayers !== 0 ||
  inconsistentReferences !== 0 ||
  invalidSquads !== 0 ||
  invalidTeams !== 0 ||
  invalidPlayers !== 0
) {
  throw new Error("La verificacion de volumen o integridad fallo.");
}
