load("/workspace/schemas/collections.js");

const crypto = require("crypto");
const namespace = "d650d6d8-e518-5f7d-8917-7ff4cc50bc94";
const loadedAt = ISODate("2026-08-28T00:00:00Z");
const worldCupSource = {
  url: "https://en.wikipedia.org/w/index.php?title=2026_FIFA_World_Cup&oldid=1371616839",
  revision: "1371616839",
};
const qualificationSource = {
  url: "https://en.wikipedia.org/w/index.php?title=2026_FIFA_World_Cup_qualification&oldid=1368724802",
  revision: "1368724802",
};

function uuidV5(value) {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = crypto
    .createHash("sha1")
    .update(Buffer.concat([namespaceBytes, Buffer.from(value, "utf8")]))
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hexadecimal = hash.subarray(0, 16).toString("hex");
  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join("-");
}

const classifiedTeams = [
  ["AUS", "Australia", "AFC"],
  ["IRN", "Iran", "AFC"],
  ["IRQ", "Iraq", "AFC"],
  ["JPN", "Japan", "AFC"],
  ["JOR", "Jordan", "AFC"],
  ["QAT", "Qatar", "AFC"],
  ["KSA", "Saudi Arabia", "AFC"],
  ["KOR", "South Korea", "AFC"],
  ["UZB", "Uzbekistan", "AFC"],
  ["ALG", "Algeria", "CAF"],
  ["CPV", "Cape Verde", "CAF"],
  ["COD", "DR Congo", "CAF"],
  ["EGY", "Egypt", "CAF"],
  ["GHA", "Ghana", "CAF"],
  ["CIV", "Ivory Coast", "CAF"],
  ["MAR", "Morocco", "CAF"],
  ["SEN", "Senegal", "CAF"],
  ["RSA", "South Africa", "CAF"],
  ["TUN", "Tunisia", "CAF"],
  ["CAN", "Canada", "CONCACAF"],
  ["CUW", "Curacao", "CONCACAF"],
  ["HAI", "Haiti", "CONCACAF"],
  ["MEX", "Mexico", "CONCACAF"],
  ["PAN", "Panama", "CONCACAF"],
  ["USA", "United States", "CONCACAF"],
  ["ARG", "Argentina", "CONMEBOL"],
  ["BRA", "Brazil", "CONMEBOL"],
  ["COL", "Colombia", "CONMEBOL"],
  ["ECU", "Ecuador", "CONMEBOL"],
  ["PAR", "Paraguay", "CONMEBOL"],
  ["URU", "Uruguay", "CONMEBOL"],
  ["NZL", "New Zealand", "OFC"],
  ["AUT", "Austria", "UEFA"],
  ["BEL", "Belgium", "UEFA"],
  ["BIH", "Bosnia and Herzegovina", "UEFA"],
  ["CRO", "Croatia", "UEFA"],
  ["CZE", "Czech Republic", "UEFA"],
  ["ENG", "England", "UEFA"],
  ["FRA", "France", "UEFA"],
  ["GER", "Germany", "UEFA"],
  ["NED", "Netherlands", "UEFA"],
  ["NOR", "Norway", "UEFA"],
  ["POR", "Portugal", "UEFA"],
  ["SCO", "Scotland", "UEFA"],
  ["ESP", "Spain", "UEFA"],
  ["SWE", "Sweden", "UEFA"],
  ["SUI", "Switzerland", "UEFA"],
  ["TUR", "Turkey", "UEFA"],
];

const additionalTeams = [
  ["JAM", "Jamaica", "CONCACAF", "Inter-confederation play-off final"],
  ["NCL", "New Caledonia", "OFC", "Inter-confederation play-off semi-final"],
  ["BOL", "Bolivia", "CONMEBOL", "Inter-confederation play-off final"],
  ["SUR", "Suriname", "CONCACAF", "Inter-confederation play-off semi-final"],
  ["ITA", "Italy", "UEFA", "UEFA second round, Path A final"],
  ["WAL", "Wales", "UEFA", "UEFA second round, Path A semi-final"],
  ["NIR", "Northern Ireland", "UEFA", "UEFA second round, Path A semi-final"],
  ["POL", "Poland", "UEFA", "UEFA second round, Path B final"],
  ["UKR", "Ukraine", "UEFA", "UEFA second round, Path B semi-final"],
  ["ALB", "Albania", "UEFA", "UEFA second round, Path B semi-final"],
  ["KVX", "Kosovo", "UEFA", "UEFA second round, Path C final"],
  ["SVK", "Slovakia", "UEFA", "UEFA second round, Path C semi-final"],
  ["ROU", "Romania", "UEFA", "UEFA second round, Path C semi-final"],
  ["DEN", "Denmark", "UEFA", "UEFA second round, Path D final"],
  ["IRL", "Republic of Ireland", "UEFA", "UEFA second round, Path D semi-final"],
  ["MKD", "North Macedonia", "UEFA", "UEFA second round, Path D semi-final"],
];

const teams = [
  ...classifiedTeams.map(([codigo, nombre, confederacion]) => ({
    codigo,
    nombre,
    confederacion,
    origenSeleccion: "clasificado_2026",
    etapaClasificacion: "Qualified for the 2026 FIFA World Cup",
    fuente: worldCupSource,
  })),
  ...additionalTeams.map(([codigo, nombre, confederacion, etapaClasificacion]) => ({
    codigo,
    nombre,
    confederacion,
    origenSeleccion: "adicional_eliminatorias",
    etapaClasificacion,
    fuente: qualificationSource,
  })),
].map((team) => ({
  _id: uuidV5(`equipo:${team.codigo}`),
  ...team,
  participaFixture2030: true,
  actualizadoEn: loadedAt,
}));

if (teams.length !== 64) {
  throw new Error(`Se esperaban 64 equipos y se generaron ${teams.length}.`);
}

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
      actualizadoEn: loadedAt,
    };
  }),
);

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
