load("/workspace/schemas/collections.js");
load("/workspace/lib/uuid.js");

const classifiedOrigin = "clasificado_2026";
const additionalOrigin = "adicional_eliminatorias";
const classifiedStage = "Qualified for the 2026 FIFA World Cup";
const teams = [
  // Classified teams
  ["AUS", "Australia", "AFC", classifiedOrigin, classifiedStage],
  ["IRN", "Iran", "AFC", classifiedOrigin, classifiedStage],
  ["IRQ", "Iraq", "AFC", classifiedOrigin, classifiedStage],
  ["JPN", "Japan", "AFC", classifiedOrigin, classifiedStage],
  ["JOR", "Jordan", "AFC", classifiedOrigin, classifiedStage],
  ["QAT", "Qatar", "AFC", classifiedOrigin, classifiedStage],
  ["KSA", "Saudi Arabia", "AFC", classifiedOrigin, classifiedStage],
  ["KOR", "South Korea", "AFC", classifiedOrigin, classifiedStage],
  ["UZB", "Uzbekistan", "AFC", classifiedOrigin, classifiedStage],
  ["ALG", "Algeria", "CAF", classifiedOrigin, classifiedStage],
  ["CPV", "Cape Verde", "CAF", classifiedOrigin, classifiedStage],
  ["COD", "DR Congo", "CAF", classifiedOrigin, classifiedStage],
  ["EGY", "Egypt", "CAF", classifiedOrigin, classifiedStage],
  ["GHA", "Ghana", "CAF", classifiedOrigin, classifiedStage],
  ["CIV", "Ivory Coast", "CAF", classifiedOrigin, classifiedStage],
  ["MAR", "Morocco", "CAF", classifiedOrigin, classifiedStage],
  ["SEN", "Senegal", "CAF", classifiedOrigin, classifiedStage],
  ["RSA", "South Africa", "CAF", classifiedOrigin, classifiedStage],
  ["TUN", "Tunisia", "CAF", classifiedOrigin, classifiedStage],
  ["CAN", "Canada", "CONCACAF", classifiedOrigin, classifiedStage],
  ["CUW", "Curacao", "CONCACAF", classifiedOrigin, classifiedStage],
  ["HAI", "Haiti", "CONCACAF", classifiedOrigin, classifiedStage],
  ["MEX", "Mexico", "CONCACAF", classifiedOrigin, classifiedStage],
  ["PAN", "Panama", "CONCACAF", classifiedOrigin, classifiedStage],
  ["USA", "United States", "CONCACAF", classifiedOrigin, classifiedStage],
  ["ARG", "Argentina", "CONMEBOL", classifiedOrigin, classifiedStage],
  ["BRA", "Brazil", "CONMEBOL", classifiedOrigin, classifiedStage],
  ["COL", "Colombia", "CONMEBOL", classifiedOrigin, classifiedStage],
  ["ECU", "Ecuador", "CONMEBOL", classifiedOrigin, classifiedStage],
  ["PAR", "Paraguay", "CONMEBOL", classifiedOrigin, classifiedStage],
  ["URU", "Uruguay", "CONMEBOL", classifiedOrigin, classifiedStage],
  ["NZL", "New Zealand", "OFC", classifiedOrigin, classifiedStage],
  ["AUT", "Austria", "UEFA", classifiedOrigin, classifiedStage],
  ["BEL", "Belgium", "UEFA", classifiedOrigin, classifiedStage],
  ["BIH", "Bosnia and Herzegovina", "UEFA", classifiedOrigin, classifiedStage],
  ["CRO", "Croatia", "UEFA", classifiedOrigin, classifiedStage],
  ["CZE", "Czech Republic", "UEFA", classifiedOrigin, classifiedStage],
  ["ENG", "England", "UEFA", classifiedOrigin, classifiedStage],
  ["FRA", "France", "UEFA", classifiedOrigin, classifiedStage],
  ["GER", "Germany", "UEFA", classifiedOrigin, classifiedStage],
  ["NED", "Netherlands", "UEFA", classifiedOrigin, classifiedStage],
  ["NOR", "Norway", "UEFA", classifiedOrigin, classifiedStage],
  ["POR", "Portugal", "UEFA", classifiedOrigin, classifiedStage],
  ["SCO", "Scotland", "UEFA", classifiedOrigin, classifiedStage],
  ["ESP", "Spain", "UEFA", classifiedOrigin, classifiedStage],
  ["SWE", "Sweden", "UEFA", classifiedOrigin, classifiedStage],
  ["SUI", "Switzerland", "UEFA", classifiedOrigin, classifiedStage],
  ["TUR", "Turkey", "UEFA", classifiedOrigin, classifiedStage],

  // Additional teams
  ["JAM", "Jamaica", "CONCACAF", additionalOrigin, "Inter-confederation play-off final"],
  ["NCL", "New Caledonia", "OFC", additionalOrigin, "Inter-confederation play-off semi-final"],
  ["BOL", "Bolivia", "CONMEBOL", additionalOrigin, "Inter-confederation play-off final"],
  ["SUR", "Suriname", "CONCACAF", additionalOrigin, "Inter-confederation play-off semi-final"],
  ["ITA", "Italy", "UEFA", additionalOrigin, "UEFA second round, Path A final"],
  ["WAL", "Wales", "UEFA", additionalOrigin, "UEFA second round, Path A semi-final"],
  ["NIR", "Northern Ireland", "UEFA", additionalOrigin, "UEFA second round, Path A semi-final"],
  ["POL", "Poland", "UEFA", additionalOrigin, "UEFA second round, Path B final"],
  ["UKR", "Ukraine", "UEFA", additionalOrigin, "UEFA second round, Path B semi-final"],
  ["ALB", "Albania", "UEFA", additionalOrigin, "UEFA second round, Path B semi-final"],
  ["KVX", "Kosovo", "UEFA", additionalOrigin, "UEFA second round, Path C final"],
  ["SVK", "Slovakia", "UEFA", additionalOrigin, "UEFA second round, Path C semi-final"],
  ["ROU", "Romania", "UEFA", additionalOrigin, "UEFA second round, Path C semi-final"],
  ["DEN", "Denmark", "UEFA", additionalOrigin, "UEFA second round, Path D final"],
  ["IRL", "Republic of Ireland", "UEFA", additionalOrigin, "UEFA second round, Path D semi-final"],
  ["MKD", "North Macedonia", "UEFA", additionalOrigin, "UEFA second round, Path D semi-final"],
].map(([codigo, nombre, confederacion, origenSeleccion, etapaClasificacion]) => ({
  _id: uuidV5(`equipo:${codigo}`),
  codigo,
  nombre,
  confederacion,
  origenSeleccion,
  etapaClasificacion,
  participaFixture2030: true,
}));

if (teams.length !== 64) {
  throw new Error(`Se esperaban 64 equipos y se generaron ${teams.length}.`);
}

/**
 * Asigna una posicion segun el numero de orden del jugador en el plantel.
 * La regla fija mantiene una distribucion reproducible de 3 arqueros,
 * 8 defensores, 8 mediocampistas y 5 delanteros por equipo.
 *
 * @param {number} number Numero de orden entre 1 y 24.
 * @returns {"Arquero"|"Defensor"|"Mediocampista"|"Delantero"} Posicion generada.
 */
function positionFor(number) {
  if (number <= 3) return "Arquero";
  if (number <= 11) return "Defensor";
  if (number <= 19) return "Mediocampista";
  return "Delantero";
}

const players = teams.flatMap((team, teamIndex) =>
  Array.from({ length: 24 }, (_, index) => {
    const number = index + 1;
    const paddedNumber = String(number).padStart(2, "0");
    return {
      _id: uuidV5(`jugador:${team.codigo}:${paddedNumber}`),
      codigo: `${team.codigo}-${paddedNumber}`,
      equipoId: team._id,
      equipoCodigo: team.codigo,
      nombre: "Jugador",
      apellido: `Ficticio ${team.codigo} ${paddedNumber}`,
      fechaNacimiento: new Date(
        Date.UTC(1992 + ((teamIndex * 3 + number) % 14), (teamIndex + number) % 12, 1 + ((teamIndex * 7 + number) % 28)),
      ),
      posicion: positionFor(number),
      dorsal: number,
      alturaCm: NumberInt(170 + ((teamIndex * 5 + number * 3) % 27)),
      pieHabil: (teamIndex + number) % 4 === 0 ? "Izquierdo" : "Derecho",
      convocado: true,
      disponible: true,
      datosSinteticos: true,
    };
  }),
);

/**
 * Reemplaza documentos por `_id` en lotes y crea los que todavia no existen.
 *
 * `replaceOne` con `upsert` hace que la carga sea idempotente: una segunda
 * ejecucion actualiza la misma entidad en vez de duplicarla. Los lotes evitan
 * construir una unica operacion demasiado grande.
 *
 * @param {object} collection Coleccion de MongoDB que recibe los documentos.
 * @param {object[]} documents Documentos completos que se deben cargar.
 * @param {number} [batchSize=500] Cantidad maxima de operaciones por lote.
 * @returns {void}
 */
function replaceInBatches(collection, documents, batchSize = 500) {
  for (let offset = 0; offset < documents.length; offset += batchSize) {
    collection.bulkWrite(
      documents.slice(offset, offset + batchSize).map((document) => ({
        replaceOne: {
          filter: { _id: document._id },
          replacement: document,
          upsert: true,
        },
      })),
      { ordered: true },
    );
  }
}

replaceInBatches(projectDatabase.equipos, teams);
replaceInBatches(projectDatabase.jugadores, players);

printjson({
  carga: "completa",
  equiposParticipantes: projectDatabase.equipos.countDocuments({ participaFixture2030: true }),
  jugadoresDeParticipantes: projectDatabase.jugadores.countDocuments({
    equipoId: { $in: teams.map((team) => team._id) },
  }),
});
