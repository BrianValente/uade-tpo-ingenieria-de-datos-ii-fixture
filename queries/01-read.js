load("/workspace/lib/uuid.js");

const projectDatabase = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "fixture2030");

print("1. Recuperacion directa de un equipo por codigo:");
printjson(projectDatabase.equipos.findOne({ codigo: "ARG" }));

print("2. Recuperacion directa de un jugador por _id:");
printjson(projectDatabase.jugadores.findOne({ _id: uuidV5("jugador:ARG:10") }));

print("3. Equipos de CONMEBOL seleccionados para el Fixture:");
projectDatabase.equipos
  .find(
    { confederacion: "CONMEBOL", participaFixture2030: true },
    { _id: 0, codigo: 1, nombre: 1, origenSeleccion: 1 },
  )
  .sort({ nombre: 1 })
  .forEach(printjson);

print("4. Segunda pagina del plantel de Argentina, ordenada por posicion y dorsal:");
const argentina = projectDatabase.equipos.findOne({ codigo: "ARG" }, { _id: 1 });
projectDatabase.jugadores
  .find(
    { equipoId: argentina._id },
    { _id: 0, nombre: 1, apellido: 1, posicion: 1, dorsal: 1 },
  )
  .sort({ posicion: 1, dorsal: 1 })
  .skip(5)
  .limit(5)
  .forEach(printjson);
