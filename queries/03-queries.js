// queries/03-queries.js
// Operaciones de Recuperación: Identificación, Filtrado, Proyección, Ordenamiento y Paginación (RF10)

const databaseName = process.env.MONGO_INITDB_DATABASE || "fixture2030";
const projectDatabase = typeof db !== "undefined" ? db.getSiblingDB(databaseName) : null;

async function runQueries(targetDb) {
  const currentDb = targetDb || projectDatabase;
  print("\n=======================================================");
  print("3. OPERACIONES DE RECUPERACIÓN Y CONSULTAS (RF10)");
  print("=======================================================");

  // 3.1 Recuperación por Identificador Directo
  print("\n--- 3.1 Búsqueda por Identificador Directo (Código FIFA: 'ARG') ---");
  const equipoArg = await currentDb.equipos.findOne(
    { codigo_fifa: "ARG" },
    { projection: { _id: 0, codigo_fifa: 1, nombre: 1, confederacion: 1, ranking_fifa: 1, grupo: 1, "entrenador.nombre": 1 } }
  );
  print(JSON.stringify(equipoArg, null, 2));

  print("\n--- 3.1.b Búsqueda de Capitán por Equipo y Dorsal ('ARG', #10) ---");
  const capitanArg = await currentDb.jugadores.findOne(
    { equipo_codigo: "ARG", numero_camiseta: 10 },
    { projection: { _id: 0, nombre: 1, apellido: 1, posicion: 1, numero_camiseta: 1, "club_actual.nombre": 1, valor_mercado_eur: 1 } }
  );
  print(JSON.stringify(capitanArg, null, 2));

  // 3.2 Recuperación Filtrada por Condiciones de Negocio
  print("\n--- 3.2 Filtro de Negocio: Selecciones CONMEBOL en el Top 30 del Ranking FIFA ---");
  const seleccionesTopConmebol = await currentDb.equipos.find(
    {
      confederacion: "CONMEBOL",
      ranking_fifa: { $lte: 30 }
    },
    { projection: { _id: 0, codigo_fifa: 1, nombre: 1, ranking_fifa: 1, titulos_mundiales: 1 } }
  ).sort({ ranking_fifa: 1 }).toArray();
  print(JSON.stringify(seleccionesTopConmebol, null, 2));

  // 3.3 Filtro Combinado con Proyección
  print("\n--- 3.3 Filtro y Proyección: Delanteros menores de 25 años en la 'Premier League' o 'LaLiga' ---");
  const delanterosPromesas = await currentDb.jugadores.find(
    {
      posicion: "Delantero",
      edad: { $lt: 25 },
      "club_actual.liga": { $in: ["Premier League", "LaLiga"] }
    },
    {
      projection: {
        _id: 0,
        nombre: 1,
        apellido: 1,
        equipo_nombre: 1,
        edad: 1,
        "club_actual.nombre": 1,
        "club_actual.liga": 1,
        valor_mercado_eur: 1
      }
    }
  ).sort({ valor_mercado_eur: -1 }).limit(5).toArray();
  print(JSON.stringify(delanterosPromesas, null, 2));

  // 3.4 Ordenamiento y Paginación (Simulación de catálogo / UI de jugadores)
  print("\n--- 3.4 Paginación y Ordenamiento: Top Jugadores Más Valiosos del Mundial (Página 1: Tamaño 4) ---");
  const pagina1 = await currentDb.jugadores.find(
    {},
    {
      projection: {
        _id: 0,
        nombre: 1,
        apellido: 1,
        equipo_codigo: 1,
        posicion: 1,
        edad: 1,
        "club_actual.nombre": 1,
        valor_mercado_eur: 1
      }
    }
  )
  .sort({ valor_mercado_eur: -1 })
  .skip(0)
  .limit(4)
  .toArray();
  print("Página 1 (Skip 0, Limit 4):");
  print(JSON.stringify(pagina1, null, 2));

  print("\n--- 3.4.b Paginación: Top Jugadores Más Valiosos del Mundial (Página 2: Tamaño 4) ---");
  const pagina2 = await currentDb.jugadores.find(
    {},
    {
      projection: {
        _id: 0,
        nombre: 1,
        apellido: 1,
        equipo_codigo: 1,
        posicion: 1,
        edad: 1,
        "club_actual.nombre": 1,
        valor_mercado_eur: 1
      }
    }
  )
  .sort({ valor_mercado_eur: -1 })
  .skip(4)
  .limit(4)
  .toArray();
  print("Página 2 (Skip 4, Limit 4):");
  print(JSON.stringify(pagina2, null, 2));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { runQueries };
} else {
  runQueries();
}
