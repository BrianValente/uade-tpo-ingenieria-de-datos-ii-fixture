const databaseName = process.env.MONGO_INITDB_DATABASE || "fixture2030";
const projectDatabase = db.getSiblingDB(databaseName);

for (const collectionName of ["equipos", "jugadores"]) {
  if (!projectDatabase.getCollectionNames().includes(collectionName)) {
    projectDatabase.createCollection(collectionName);
  }
}
