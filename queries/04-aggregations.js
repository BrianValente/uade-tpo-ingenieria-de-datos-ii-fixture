// queries/04-aggregations.js
// Pipelines de Agregación Analítica (RF11)

const databaseName = process.env.MONGO_INITDB_DATABASE || "fixture2030";
const projectDatabase = typeof db !== "undefined" ? db.getSiblingDB(databaseName) : null;

async function runAggregations(targetDb) {
  const currentDb = targetDb || projectDatabase;
  print("\n=======================================================");
  print("4. PIPELINES DE AGREGACIÓN ANALÍTICA (RF11)");
  print("=======================================================");

  // Pipeline 1: Análisis Económico y Demográfico por Confederación Continental
  print("\n--- Pipeline 1: Métricas Consolidadas por Confederación Continental ---");
  const pipelineConfederaciones = [
    {
      $lookup: {
        from: "equipos",
        localField: "equipo_codigo",
        foreignField: "codigo_fifa",
        as: "info_equipo"
      }
    },
    { $unwind: "$info_equipo" },
    {
      $group: {
        _id: "$info_equipo.confederacion",
        total_jugadores: { $sum: 1 },
        total_equipos_unicos: { $addToSet: "$equipo_codigo" },
        edad_promedio: { $avg: "$edad" },
        valor_mercado_total_eur: { $sum: "$valor_mercado_eur" },
        goles_totales: { $sum: "$estadisticas_seleccion.goles" },
        promedio_goles_por_jugador: { $avg: "$estadisticas_seleccion.goles" }
      }
    },
    {
      $project: {
        confederacion: "$_id",
        _id: 0,
        total_jugadores: 1,
        total_selecciones: { $size: "$total_equipos_unicos" },
        edad_promedio: { $round: ["$edad_promedio", 1] },
        valor_mercado_total_millones_eur: {
          $round: [{ $divide: ["$valor_mercado_total_eur", 1000000] }, 2]
        },
        goles_totales: 1,
        promedio_goles_por_jugador: { $round: ["$promedio_goles_por_jugador", 2] }
      }
    },
    { $sort: { valor_mercado_total_millones_eur: -1 } }
  ];

  const resConfederaciones = await currentDb.jugadores.aggregate(pipelineConfederaciones).toArray();
  print(JSON.stringify(resConfederaciones, null, 2));

  // Pipeline 2: Top 5 Ligas de Clubes que más jugadores aportan al Mundial 2030
  print("\n--- Pipeline 2: Top Ligas de Clubes con Mayor Presencia en el Fixture 2030 ---");
  const pipelineLigas = [
    {
      $group: {
        _id: "$club_actual.liga",
        total_jugadores_aportados: { $sum: 1 },
        clubes_distintos: { $addToSet: "$club_actual.nombre" },
        valor_acumulado_eur: { $sum: "$valor_mercado_eur" }
      }
    },
    {
      $project: {
        liga: "$_id",
        _id: 0,
        total_jugadores_aportados: 1,
        cantidad_clubes: { $size: "$clubes_distintos" },
        valor_acumulado_millones_eur: {
          $round: [{ $divide: ["$valor_acumulado_eur", 1000000] }, 2]
        }
      }
    },
    { $sort: { total_jugadores_aportados: -1 } },
    { $limit: 5 }
  ];

  const resLigas = await currentDb.jugadores.aggregate(pipelineLigas).toArray();
  print(JSON.stringify(resLigas, null, 2));

  // Pipeline 3: Desglose Táctico y Estadístico por Selección (Grupo A)
  print("\n--- Pipeline 3: Desglose Táctico y Valor por Selección (Grupo A) ---");
  const pipelineGrupoA = [
    { $match: { grupo: "Grupo A" } },
    {
      $lookup: {
        from: "jugadores",
        localField: "codigo_fifa",
        foreignField: "equipo_codigo",
        as: "plantel"
      }
    },
    {
      $project: {
        _id: 0,
        codigo_fifa: 1,
        nombre: 1,
        ranking_fifa: 1,
        total_convocados: { $size: "$plantel" },
        valor_plantel_millones_eur: {
          $round: [{ $divide: [{ $sum: "$plantel.valor_mercado_eur" }, 1000000] }, 2]
        },
        promedio_edad_plantel: {
          $round: [{ $avg: "$plantel.edad" }, 1]
        },
        max_goles_jugador: { $max: "$plantel.estadisticas_seleccion.goles" }
      }
    },
    { $sort: { ranking_fifa: 1 } }
  ];

  const resGrupoA = await currentDb.equipos.aggregate(pipelineGrupoA).toArray();
  print(JSON.stringify(resGrupoA, null, 2));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { runAggregations };
} else {
  runAggregations();
}
