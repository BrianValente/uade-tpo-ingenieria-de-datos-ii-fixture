const projectDatabase = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "fixture2030");
const argentina = projectDatabase.equipos.findOne({ codigo: "ARG" }, { _id: 1 });
const filter = { equipoId: argentina._id, posicion: "Delantero" };
const indexName = "jugadores_equipo_posicion_dorsal";

function summary(label, explainResult) {
  return {
    medicion: label,
    etapa: explainResult.queryPlanner.winningPlan.stage,
    documentosDevueltos: explainResult.executionStats.nReturned,
    documentosExaminados: explainResult.executionStats.totalDocsExamined,
    clavesExaminadas: explainResult.executionStats.totalKeysExamined,
  };
}

if (!projectDatabase.jugadores.getIndexes().some((index) => index.name === indexName)) {
  throw new Error(`Falta el indice ${indexName}. Ejecute la carga antes de medir.`);
}

const withoutUsingSecondaryIndex = projectDatabase.jugadores
  .find(filter)
  .sort({ dorsal: 1 })
  .hint({ $natural: 1 })
  .explain("executionStats");

const withSecondaryIndex = projectDatabase.jugadores
  .find(filter)
  .sort({ dorsal: 1 })
  .explain("executionStats");

printjson(summary("Plan forzado sin usar el indice (hint $natural)", withoutUsingSecondaryIndex));
printjson(summary("Con indice compuesto", withSecondaryIndex));
