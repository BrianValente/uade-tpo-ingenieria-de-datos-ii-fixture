const projectDatabase = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "fixture2030");

let rejected = false;
try {
  projectDatabase.jugadores.insertOne({
    _id: "identificador-invalido",
    codigo: "BAD-01",
    equipoId: "equipo-inexistente",
    equipoCodigo: "BAD",
    nombre: "Dato",
    apellido: "Invalido",
    posicion: "Posicion inexistente",
    dorsal: NumberInt(0),
  });
} catch (error) {
  if (error.code !== 121) throw error;
  rejected = true;
  print("Documento invalido rechazado por MongoDB con codigo 121.");
}

if (!rejected || projectDatabase.jugadores.countDocuments({ codigo: "BAD-01" }) !== 0) {
  throw new Error("El validador acepto un documento invalido.");
}
