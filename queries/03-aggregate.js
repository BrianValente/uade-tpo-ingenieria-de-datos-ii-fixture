const projectDatabase = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "fixture2030");

projectDatabase.jugadores
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
    { $match: { "equipo.participaFixture2030": true } },
    {
      $group: {
        _id: "$equipo.confederacion",
        equipos: { $addToSet: "$equipoId" },
        jugadores: { $sum: 1 },
        alturaPromedioCm: { $avg: "$alturaCm" },
      },
    },
    {
      $project: {
        _id: 0,
        confederacion: "$_id",
        cantidadEquipos: { $size: "$equipos" },
        cantidadJugadores: "$jugadores",
        alturaPromedioCm: { $round: ["$alturaPromedioCm", 1] },
      },
    },
    { $sort: { cantidadJugadores: -1, confederacion: 1 } },
  ])
  .forEach(printjson);
