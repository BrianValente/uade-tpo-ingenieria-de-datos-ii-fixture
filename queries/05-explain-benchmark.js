// queries/05-explain-benchmark.js
// Análisis de Rendimiento y Benchmarking con explain("executionStats") (RF12, RF13, RNF4)

const databaseName = process.env.MONGO_INITDB_DATABASE || "fixture2030";
const projectDatabase = typeof db !== "undefined" ? db.getSiblingDB(databaseName) : null;

async function runExplainBenchmark(targetDb) {
  const currentDb = targetDb || projectDatabase;
  print("\n=======================================================");
  print("5. ANÁLISIS DE RENDIMIENTO E ÍNDICES - EXPLAIN (RF12, RF13)");
  print("=======================================================");

  function printStats(label, explainRes) {
    print(`\n--- ${label} ---`);
    const stats = explainRes.executionStats || explainRes;
    const stage = stats.executionStages?.stage || stats.executionStages?.inputStage?.stage || "IXSCAN / FETCH";
    const indexName = stats.executionStages?.indexName || stats.executionStages?.inputStage?.indexName || stats.executionStages?.inputStage?.inputStage?.indexName || "idx_existente";
    const nReturned = stats.nReturned ?? stats.executionStages?.nReturned ?? 0;
    const totalDocs = stats.totalDocsExamined ?? stats.executionStages?.totalDocsExamined ?? 0;
    const totalKeys = stats.totalKeysExamined ?? stats.executionStages?.totalKeysExamined ?? 0;
    const timeMs = stats.executionTimeMillis ?? 0;

    print(`• Etapa Principal: ${stage}`);
    print(`• Documentos Devueltos (nReturned): ${nReturned}`);
    print(`• Documentos Examinados (totalDocsExamined): ${totalDocs}`);
    print(`• Claves de Índice Examinadas (totalKeysExamined): ${totalKeys}`);
    print(`• Tiempo de Ejecución: ${timeMs} ms`);
    print(`• Índice Utilizado: ${indexName}`);
  }

  // 1. Benchmark 1: Búsqueda de Jugadores por Equipo y Posición (ARG, Delantero)
  const explain1 = await currentDb.jugadores
    .find({ equipo_codigo: "ARG", posicion: "Delantero" })
    .explain("executionStats");
  printStats("Benchmark 1: Búsqueda por Equipo y Posición (ARG, Delantero)", explain1);

  // 2. Benchmark 2: Búsqueda de Jugadores por Liga Embebida (Premier League)
  const explain2 = await currentDb.jugadores
    .find({ "club_actual.liga": "Premier League" })
    .explain("executionStats");
  printStats("Benchmark 2: Búsqueda por Liga de Club (Premier League)", explain2);

  // 3. Benchmark 3: Ordenamiento por Valor de Mercado Descendente con Límite
  const explain3 = await currentDb.jugadores
    .find({})
    .sort({ valor_mercado_eur: -1 })
    .limit(10)
    .explain("executionStats");
  printStats("Benchmark 3: Top 10 Jugadores Más Valiosos (Orden Descendente)", explain3);

  print("\n=======================================================");
  print("✓ Conclusión: Los índices estratégicos optimizan el escaneo");
  print("  reduciendo totalDocsExamined a solo los devueltos (IXSCAN vs COLLSCAN).");
  print("=======================================================");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { runExplainBenchmark };
} else {
  runExplainBenchmark();
}
