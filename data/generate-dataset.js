// data/generate-dataset.js
// Generador determinístico y reproducible de 64 Selecciones y 1.600 Jugadores para Fixture 2030

const fs = require('fs');
const path = require('path');

// 64 Selecciones participantes distribuidas en 16 grupos (A a P)
const teamsData = [
  // Grupo A
  { codigo: "ARG", nombre: "Argentina", conf: "CONMEBOL", rank: 1, grupo: "Grupo A", dt: "Lionel Scaloni", dtNac: "Argentina", dtEdad: 52, titulos: 3, estadio: "Estadio Monumental, Buenos Aires" },
  { codigo: "NGA", nombre: "Nigeria", conf: "CAF", rank: 30, grupo: "Grupo A", dt: "Finidi George", dtNac: "Nigeria", dtEdad: 55, titulos: 0, estadio: "Estadio Monumental, Buenos Aires" },
  { codigo: "POL", nombre: "Polonia", conf: "UEFA", rank: 28, grupo: "Grupo A", dt: "Michal Probierz", dtNac: "Polonia", dtEdad: 53, titulos: 0, estadio: "Estadio Monumental, Buenos Aires" },
  { codigo: "NZL", nombre: "Nueva Zelanda", conf: "OFC", rank: 60, grupo: "Grupo A", dt: "Darren Bazeley", dtNac: "Inglaterra", dtEdad: 54, titulos: 0, estadio: "Estadio Monumental, Buenos Aires" },

  // Grupo B
  { codigo: "FRA", nombre: "Francia", conf: "UEFA", rank: 2, grupo: "Grupo B", dt: "Didier Deschamps", dtNac: "Francia", dtEdad: 61, titulos: 2, estadio: "Stade de France, Saint-Denis" },
  { codigo: "AUS", nombre: "Australia", conf: "AFC", rank: 24, grupo: "Grupo B", dt: "Graham Arnold", dtNac: "Australia", dtEdad: 63, titulos: 0, estadio: "Stade de France, Saint-Denis" },
  { codigo: "CHI", nombre: "Chile", conf: "CONMEBOL", rank: 40, grupo: "Grupo B", dt: "Ricardo Gareca", dtNac: "Argentina", dtEdad: 68, titulos: 0, estadio: "Stade de France, Saint-Denis" },
  { codigo: "MLI", nombre: "Malí", conf: "CAF", rank: 48, grupo: "Grupo B", dt: "Eric Chelle", dtNac: "Malí", dtEdad: 48, titulos: 0, estadio: "Stade de France, Saint-Denis" },

  // Grupo C
  { codigo: "ESP", nombre: "España", conf: "UEFA", rank: 3, grupo: "Grupo C", dt: "Luis de la Fuente", dtNac: "España", dtEdad: 65, titulos: 1, estadio: "Santiago Bernabéu, Madrid" },
  { codigo: "EGY", nombre: "Egipto", conf: "CAF", rank: 36, grupo: "Grupo C", dt: "Hossam Hassan", dtNac: "Egipto", dtEdad: 60, titulos: 0, estadio: "Santiago Bernabéu, Madrid" },
  { codigo: "KOR", nombre: "Corea del Sur", conf: "AFC", rank: 22, grupo: "Grupo C", dt: "Hong Myung-bo", dtNac: "Corea del Sur", dtEdad: 57, titulos: 0, estadio: "Santiago Bernabéu, Madrid" },
  { codigo: "CRC", nombre: "Costa Rica", conf: "CONCACAF", rank: 52, grupo: "Grupo C", dt: "Gustavo Alfaro", dtNac: "Argentina", dtEdad: 64, titulos: 0, estadio: "Santiago Bernabéu, Madrid" },

  // Grupo D
  { codigo: "ENG", nombre: "Inglaterra", conf: "UEFA", rank: 4, grupo: "Grupo D", dt: "Thomas Tuchel", dtNac: "Alemania", dtEdad: 53, titulos: 1, estadio: "Wembley Stadium, Londres" },
  { codigo: "PAR", nombre: "Paraguay", conf: "CONMEBOL", rank: 55, grupo: "Grupo D", dt: "Gustavo Alfaro", dtNac: "Argentina", dtEdad: 63, titulos: 0, estadio: "Wembley Stadium, Londres" },
  { codigo: "QAT", nombre: "Catar", conf: "AFC", rank: 34, grupo: "Grupo D", dt: "Tintín Márquez", dtNac: "España", dtEdad: 64, titulos: 0, estadio: "Wembley Stadium, Londres" },
  { codigo: "RSA", nombre: "Sudáfrica", conf: "CAF", rank: 58, grupo: "Grupo D", dt: "Hugo Broos", dtNac: "Bélgica", dtEdad: 74, titulos: 0, estadio: "Wembley Stadium, Londres" },

  // Grupo E
  { codigo: "BRA", nombre: "Brasil", conf: "CONMEBOL", rank: 5, grupo: "Grupo E", dt: "Dorival Júnior", dtNac: "Brasil", dtEdad: 64, titulos: 5, estadio: "Maracanã, Río de Janeiro" },
  { codigo: "SRB", nombre: "Serbia", conf: "UEFA", rank: 32, grupo: "Grupo E", dt: "Dragan Stojkovic", dtNac: "Serbia", dtEdad: 61, titulos: 0, estadio: "Maracanã, Río de Janeiro" },
  { codigo: "KSA", nombre: "Arabia Saudita", conf: "AFC", rank: 56, grupo: "Grupo E", dt: "Roberto Mancini", dtNac: "Italia", dtEdad: 61, titulos: 0, estadio: "Maracanã, Río de Janeiro" },
  { codigo: "GUA", nombre: "Guatemala", conf: "CONCACAF", rank: 64, grupo: "Grupo E", dt: "Luis Fernando Tena", dtNac: "México", dtEdad: 68, titulos: 0, estadio: "Maracanã, Río de Janeiro" },

  // Grupo F
  { codigo: "BEL", nombre: "Bélgica", conf: "UEFA", rank: 6, grupo: "Grupo F", dt: "Domenico Tedesco", dtNac: "Italia", dtEdad: 40, titulos: 0, estadio: "Estadio Rey Balduino, Bruselas" },
  { codigo: "CAN", nombre: "Canadá", conf: "CONCACAF", rank: 35, grupo: "Grupo F", dt: "Jesse Marsch", dtNac: "Estados Unidos", dtEdad: 52, titulos: 0, estadio: "Estadio Rey Balduino, Bruselas" },
  { codigo: "CMR", nombre: "Camerún", conf: "CAF", rank: 51, grupo: "Grupo F", dt: "Marc Brys", dtNac: "Bélgica", dtEdad: 64, titulos: 0, estadio: "Estadio Rey Balduino, Bruselas" },
  { codigo: "UAE", nombre: "Emiratos Árabes", conf: "AFC", rank: 62, grupo: "Grupo F", dt: "Paulo Bento", dtNac: "Portugal", dtEdad: 57, titulos: 0, estadio: "Estadio Rey Balduino, Bruselas" },

  // Grupo G
  { codigo: "NED", nombre: "Países Bajos", conf: "UEFA", rank: 7, grupo: "Grupo G", dt: "Ronald Koeman", dtNac: "Países Bajos", dtEdad: 63, titulos: 0, estadio: "Johan Cruyff Arena, Ámsterdam" },
  { codigo: "ECU", nombre: "Ecuador", conf: "CONMEBOL", rank: 27, grupo: "Grupo G", dt: "Sebastián Beccacece", dtNac: "Argentina", dtEdad: 45, titulos: 0, estadio: "Johan Cruyff Arena, Ámsterdam" },
  { codigo: "TUN", nombre: "Túnez", conf: "CAF", rank: 41, grupo: "Grupo G", dt: "Faouzi Benzarti", dtNac: "Túnez", dtEdad: 76, titulos: 0, estadio: "Johan Cruyff Arena, Ámsterdam" },
  { codigo: "JOR", nombre: "Jordania", conf: "AFC", rank: 63, grupo: "Grupo G", dt: "Jamal Sellami", dtNac: "Marruecos", dtEdad: 55, titulos: 0, estadio: "Johan Cruyff Arena, Ámsterdam" },

  // Grupo H
  { codigo: "POR", nombre: "Portugal", conf: "UEFA", rank: 8, grupo: "Grupo H", dt: "Roberto Martínez", dtNac: "España", dtEdad: 53, titulos: 0, estadio: "Estádio da Luz, Lisboa" },
  { codigo: "CIV", nombre: "Costa de Marfil", conf: "CAF", rank: 39, grupo: "Grupo H", dt: "Emerse Faé", dtNac: "Costa de Marfil", dtEdad: 42, titulos: 0, estadio: "Estádio da Luz, Lisboa" },
  { codigo: "UZB", nombre: "Uzbekistán", conf: "AFC", rank: 57, grupo: "Grupo H", dt: "Srecko Katanec", dtNac: "Eslovenia", dtEdad: 63, titulos: 0, estadio: "Estádio da Luz, Lisboa" },
  { codigo: "HON", nombre: "Honduras", conf: "CONCACAF", rank: 61, grupo: "Grupo H", dt: "Reinaldo Rueda", dtNac: "Colombia", dtEdad: 69, titulos: 0, estadio: "Estádio da Luz, Lisboa" },

  // Grupo I
  { codigo: "COL", nombre: "Colombia", conf: "CONMEBOL", rank: 9, grupo: "Grupo I", dt: "Néstor Lorenzo", dtNac: "Argentina", dtEdad: 60, titulos: 0, estadio: "Estadio Metropolitano, Barranquilla" },
  { codigo: "DEN", nombre: "Dinamarca", conf: "UEFA", rank: 21, grupo: "Grupo I", dt: "Lars Knudsen", dtNac: "Dinamarca", dtEdad: 49, titulos: 0, estadio: "Estadio Metropolitano, Barranquilla" },
  { codigo: "ALG", nombre: "Argelia", conf: "CAF", rank: 46, grupo: "Grupo I", dt: "Vladimir Petkovic", dtNac: "Suiza", dtEdad: 63, titulos: 0, estadio: "Estadio Metropolitano, Barranquilla" },
  { codigo: "SLV", nombre: "El Salvador", conf: "CONCACAF", rank: 59, grupo: "Grupo I", dt: "David Dóniga", dtNac: "España", dtEdad: 45, titulos: 0, estadio: "Estadio Metropolitano, Barranquilla" },

  // Grupo J
  { codigo: "ITA", nombre: "Italia", conf: "UEFA", rank: 10, grupo: "Grupo J", dt: "Luciano Spalletti", dtNac: "Italia", dtEdad: 67, titulos: 4, estadio: "San Siro, Milán" },
  { codigo: "USA", nombre: "Estados Unidos", conf: "CONCACAF", rank: 18, grupo: "Grupo J", dt: "Mauricio Pochettino", dtNac: "Argentina", dtEdad: 54, titulos: 0, estadio: "San Siro, Milán" },
  { codigo: "PER", nombre: "Perú", conf: "CONMEBOL", rank: 43, grupo: "Grupo J", dt: "Jorge Fossati", dtNac: "Uruguay", dtEdad: 73, titulos: 0, estadio: "San Siro, Milán" },
  { codigo: "BFA", nombre: "Burkina Faso", conf: "CAF", rank: 54, grupo: "Grupo J", dt: "Brama Traore", dtNac: "Burkina Faso", dtEdad: 52, titulos: 0, estadio: "San Siro, Milán" },

  // Grupo K
  { codigo: "GER", nombre: "Alemania", conf: "UEFA", rank: 11, grupo: "Grupo K", dt: "Julian Nagelsmann", dtNac: "Alemania", dtEdad: 39, titulos: 4, estadio: "Allianz Arena, Múnich" },
  { codigo: "URU", nombre: "Uruguay", conf: "CONMEBOL", rank: 12, grupo: "Grupo K", dt: "Marcelo Bielsa", dtNac: "Argentina", dtEdad: 71, titulos: 2, estadio: "Estadio Centenario, Montevideo" },
  { codigo: "JAM", nombre: "Jamaica", conf: "CONCACAF", rank: 53, grupo: "Grupo K", dt: "Steve McClaren", dtNac: "Inglaterra", dtEdad: 65, titulos: 0, estadio: "Allianz Arena, Múnich" },
  { codigo: "FIJ", nombre: "Fiyi", conf: "OFC", rank: 64, grupo: "Grupo K", dt: "Rob Sherman", dtNac: "Gales", dtEdad: 66, titulos: 0, estadio: "Allianz Arena, Múnich" },

  // Grupo L
  { codigo: "CRO", nombre: "Croacia", conf: "UEFA", rank: 13, grupo: "Grupo L", dt: "Zlatko Dalic", dtNac: "Croacia", dtEdad: 59, titulos: 0, estadio: "Estadio Maksimir, Zagreb" },
  { codigo: "MAR", nombre: "Marruecos", conf: "CAF", rank: 14, grupo: "Grupo L", dt: "Walid Regragui", dtNac: "Marruecos", dtEdad: 50, titulos: 0, estadio: "Estadio Maksimir, Zagreb" },
  { codigo: "PAN", nombre: "Panamá", conf: "CONCACAF", rank: 37, grupo: "Grupo L", dt: "Thomas Christiansen", dtNac: "España", dtEdad: 53, titulos: 0, estadio: "Estadio Maksimir, Zagreb" },
  { codigo: "IRQ", nombre: "Irak", conf: "AFC", rank: 50, grupo: "Grupo L", dt: "Jesús Casas", dtNac: "España", dtEdad: 52, titulos: 0, estadio: "Estadio Maksimir, Zagreb" },

  // Grupo M
  { codigo: "JPN", nombre: "Japón", conf: "AFC", rank: 15, grupo: "Grupo M", dt: "Hajime Moriyasu", dtNac: "Japón", dtEdad: 58, titulos: 0, estadio: "Estadio Internacional, Yokohama" },
  { codigo: "MEX", nombre: "México", conf: "CONCACAF", rank: 16, grupo: "Grupo M", dt: "Javier Aguirre", dtNac: "México", dtEdad: 67, titulos: 0, estadio: "Estadio Azteca, CDMX" },
  { codigo: "SWE", nombre: "Suecia", conf: "UEFA", rank: 29, grupo: "Grupo M", dt: "Jon Dahl Tomasson", dtNac: "Dinamarca", dtEdad: 50, titulos: 0, estadio: "Estadio Internacional, Yokohama" },
  { codigo: "BOL", nombre: "Bolivia", conf: "CONMEBOL", rank: 62, grupo: "Grupo M", dt: "Óscar Villegas", dtNac: "Bolivia", dtEdad: 56, titulos: 0, estadio: "Estadio Internacional, Yokohama" },

  // Grupo N
  { codigo: "SUI", nombre: "Suiza", conf: "UEFA", rank: 17, grupo: "Grupo N", dt: "Murat Yakin", dtNac: "Suiza", dtEdad: 52, titulos: 0, estadio: "St. Jakob-Park, Basilea" },
  { codigo: "SEN", nombre: "Senegal", conf: "CAF", rank: 19, grupo: "Grupo N", dt: "Pape Thiaw", dtNac: "Senegal", dtEdad: 45, titulos: 0, estadio: "St. Jakob-Park, Basilea" },
  { codigo: "IRN", nombre: "Irán", conf: "AFC", rank: 20, grupo: "Grupo N", dt: "Amir Ghalenoei", dtNac: "Irán", dtEdad: 62, titulos: 0, estadio: "St. Jakob-Park, Basilea" },
  { codigo: "TRI", nombre: "Trinidad y Tobago", conf: "CONCACAF", rank: 63, grupo: "Grupo N", dt: "Dwight Yorke", dtNac: "Trinidad y Tobago", dtEdad: 54, titulos: 0, estadio: "St. Jakob-Park, Basilea" },

  // Grupo O
  { codigo: "AUT", nombre: "Austria", conf: "UEFA", rank: 23, grupo: "Grupo O", dt: "Ralf Rangnick", dtNac: "Alemania", dtEdad: 68, titulos: 0, estadio: "Ernst Happel Stadion, Viena" },
  { codigo: "UKR", nombre: "Ucrania", conf: "UEFA", rank: 25, grupo: "Grupo O", dt: "Serhiy Rebrov", dtNac: "Ucrania", dtEdad: 52, titulos: 0, estadio: "Ernst Happel Stadion, Viena" },
  { codigo: "GHA", nombre: "Ghana", conf: "CAF", rank: 49, grupo: "Grupo O", dt: "Otto Addo", dtNac: "Ghana", dtEdad: 51, titulos: 0, estadio: "Ernst Happel Stadion, Viena" },
  { codigo: "VEN", nombre: "Venezuela", conf: "CONMEBOL", rank: 44, grupo: "Grupo O", dt: "Fernando Batista", dtNac: "Argentina", dtEdad: 55, titulos: 0, estadio: "Ernst Happel Stadion, Viena" },

  // Grupo P
  { codigo: "TUR", nombre: "Turquía", conf: "UEFA", rank: 26, grupo: "Grupo P", dt: "Vincenzo Montella", dtNac: "Italia", dtEdad: 52, titulos: 0, estadio: "Atatürk Olympic Stadium, Estambul" },
  { codigo: "NOR", nombre: "Noruega", conf: "UEFA", rank: 31, grupo: "Grupo P", dt: "Stale Solbakken", dtNac: "Noruega", dtEdad: 58, titulos: 0, estadio: "Atatürk Olympic Stadium, Estambul" },
  { codigo: "CZE", nombre: "República Checa", conf: "UEFA", rank: 33, grupo: "Grupo P", dt: "Ivan Hasek", dtNac: "República Checa", dtEdad: 63, titulos: 0, estadio: "Atatürk Olympic Stadium, Estambul" },
  { codigo: "GRE", nombre: "Grecia", conf: "UEFA", rank: 45, grupo: "Grupo P", dt: "Ivan Jovanovic", dtNac: "Serbia", dtEdad: 64, titulos: 0, estadio: "Atatürk Olympic Stadium, Estambul" }
];

// Ligas y clubes destacados para asociar de manera realista
const clubsDatabase = [
  { nombre: "Real Madrid", pais: "España", liga: "LaLiga" },
  { nombre: "FC Barcelona", pais: "España", liga: "LaLiga" },
  { nombre: "Atlético de Madrid", pais: "España", liga: "LaLiga" },
  { nombre: "Manchester City", pais: "Inglaterra", liga: "Premier League" },
  { nombre: "Arsenal FC", pais: "Inglaterra", liga: "Premier League" },
  { nombre: "Liverpool FC", pais: "Inglaterra", liga: "Premier League" },
  { nombre: "Chelsea FC", pais: "Inglaterra", liga: "Premier League" },
  { nombre: "Manchester United", pais: "Inglaterra", liga: "Premier League" },
  { nombre: "Bayern Múnich", pais: "Alemania", liga: "Bundesliga" },
  { nombre: "Bayer Leverkusen", pais: "Alemania", liga: "Bundesliga" },
  { nombre: "Borussia Dortmund", pais: "Alemania", liga: "Bundesliga" },
  { nombre: "Inter de Milán", pais: "Italia", liga: "Serie A" },
  { nombre: "Juventus FC", pais: "Italia", liga: "Serie A" },
  { nombre: "AC Milan", pais: "Italia", liga: "Serie A" },
  { nombre: "Napoli", pais: "Italia", liga: "Serie A" },
  { nombre: "Paris Saint-Germain", pais: "Francia", liga: "Ligue 1" },
  { nombre: "AS Monaco", pais: "Francia", liga: "Ligue 1" },
  { nombre: "Olympique de Marsella", pais: "Francia", liga: "Ligue 1" },
  { nombre: "Benfica", pais: "Portugal", liga: "Primeira Liga" },
  { nombre: "Sporting CP", pais: "Portugal", liga: "Primeira Liga" },
  { nombre: "Porto", pais: "Portugal", liga: "Primeira Liga" },
  { nombre: "River Plate", pais: "Argentina", liga: "Liga Profesional" },
  { nombre: "Boca Juniors", pais: "Argentina", liga: "Liga Profesional" },
  { nombre: "Racing Club", pais: "Argentina", liga: "Liga Profesional" },
  { nombre: "Flamengo", pais: "Brasil", liga: "Brasileirão" },
  { nombre: "Palmeiras", pais: "Brasil", liga: "Brasileirão" },
  { nombre: "São Paulo", pais: "Brasil", liga: "Brasileirão" },
  { nombre: "Inter Miami", pais: "Estados Unidos", liga: "MLS" },
  { nombre: "LA Galaxy", pais: "Estados Unidos", liga: "MLS" },
  { nombre: "América", pais: "México", liga: "Liga MX" },
  { nombre: "Monterrey", pais: "México", liga: "Liga MX" },
  { nombre: "Al Hilal", pais: "Arabia Saudita", liga: "Saudi Pro League" },
  { nombre: "Al Nassr", pais: "Arabia Saudita", liga: "Saudi Pro League" },
  { nombre: "Ajax", pais: "Países Bajos", liga: "Eredivisie" },
  { nombre: "Feyenoord", pais: "Países Bajos", liga: "Eredivisie" }
];

// Nombres y apellidos por región cultural para generar jugadores realistas
const namesByRegion = {
  latin: {
    nombres: ["Mateo", "Santiago", "Julián", "Lautaro", "Enzo", "Alexis", "Rodrigo", "Federico", "Lucas", "Nicolás", "Cristian", "Facundo", "Leandro", "Emiliano", "Gabriel", "Bruno", "Thiago", "Vinicius", "Rodrygo", "Lucas", "Endrick", "Casemiro", "Guillermo", "Luis", "Darwin", "Ronald", "Manuel", "Diego", "Edison", "Paolo"],
    apellidos: ["Martínez", "Fernández", "Álvarez", "Romero", "De Paul", "Mac Allister", "González", "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Valverde", "Núñez", "Díaz", "James", "Sánchez", "Vidal", "Aránguiz", "Caicedo", "Estupiñán", "Hincapié", "Guerrero", "Cueva", "Rondón", "Soteldo", "Moreno", "Medina", "Gallardo", "Paredes"]
  },
  european: {
    nombres: ["Kylian", "Antoine", "Aurélien", "Eduardo", "Ousmane", "Theo", "Jude", "Harry", "Phil", "Bukayo", "Declan", "Cole", "Lamine", "Pedri", "Gavi", "Rodri", "Nico", "Dani", "Jamal", "Florian", "Joshua", "Kai", "Leroy", "Nicolo", "Federico", "Alessandro", "Gianluigi", "Rafael", "Bernardo", "Ruben", "Bruno", "Luka", "Mateo", "Josko", "Virgil", "Cody", "Frenkie", "Xavi", "Erling", "Martin"],
    apellidos: ["Mbappé", "Griezmann", "Tchouaméni", "Camavinga", "Dembélé", "Hernández", "Bellingham", "Kane", "Foden", "Saka", "Rice", "Palmer", "Yamal", "González", "Gavi", "Hernández", "Williams", "Olmo", "Musiala", "Wirtz", "Kimmich", "Havertz", "Sané", "Barella", "Chiesa", "Bastoni", "Donnarumma", "Leão", "Silva", "Dias", "Fernandes", "Modric", "Kovacic", "Gvardiol", "van Dijk", "Gakpo", "de Jong", "Simons", "Haaland", "Ødegaard"]
  },
  african: {
    nombres: ["Sadio", "Kalidou", "Nicolas", "Ismaila", "Idrissa", "Victor", "Ademola", "Alex", "Samuel", "Wilfred", "Achraf", "Hakim", "Sofyan", "Youssef", "Brahim", "Mohamed", "Omar", "Trezeguet", "Mostafa", "Emmanel", "Andre", "Bryan", "Vincent", "Frank", "Mohammed", "Thomas", "Inaki", "Jordan", "Salis", "Riyad", "Ismael", "Ramy", "Youcef", "Franck", "Seko", "Sebastien", "Simon", "Amad"],
    apellidos: ["Mané", "Koulibaly", "Jackson", "Sarr", "Gueye", "Osimhen", "Lookman", "Iwobi", "Chukwueze", "Ndidi", "Hakimi", "Ziyech", "Amrabat", "En-Nesyri", "Díaz", "Salah", "Marmoush", "Hassan", "Mohamed", "Onana", "Mbeumo", "Aboubakar", "Anguissa", "Kudus", "Partey", "Williams", "Ayew", "Abdul Samed", "Mahrez", "Bennacer", "Bensebaini", "Belaili", "Kessié", "Fofana", "Haller", "Adingra", "Diallo"]
  },
  asian: {
    nombres: ["Kaoru", "Takefusa", "Wataru", "Daichi", "Takumi", "Ritsu", "Heung-min", "Kang-in", "Min-jae", "Hee-chan", "Gue-sung", "Salem", "Firas", "Saud", "Abdulelah", "Sultan", "Mehdi", "Sardar", "Alireza", "Saman", "Milad", "Jackson", "Mitchell", "Harry", "Riley", "Craig", "Akram", "Almoez", "Hassan", "Boualem", "Eldor", "Abbosbek", "Oston", "Jaloliddin", "Aymen", "Mohanad", "Ali", "Ibrahim"],
    apellidos: ["Mitoma", "Kubo", "Endo", "Kamada", "Minamino", "Doan", "Son", "Lee", "Kim", "Hwang", "Cho", "Al-Dawsari", "Al-Buraikan", "Abdulhamid", "Al-Malki", "Al-Ghannam", "Taremi", "Azmoun", "Jahanbakhsh", "Ghoddos", "Mohammadi", "Irvine", "Duke", "Souttar", "McGree", "Goodwin", "Afif", "Ali", "Al-Haydos", "Khoukhi", "Shomurodov", "Fayzullaev", "Urunov", "Masharipov", "Hussein", "Ali", "Adnan", "Bayesh"]
  }
};

// Generar 25 jugadores para cada una de las 64 selecciones
function generateDataset() {
  const equipos = [];
  const jugadores = [];
  const now = new Date();

  teamsData.forEach((team, teamIndex) => {
    // 1. Crear documento de Equipo
    const equipoDoc = {
      codigo_fifa: team.codigo,
      nombre: team.nombre,
      confederacion: team.conf,
      ranking_fifa: team.rank,
      grupo: team.grupo,
      entrenador: {
        nombre: team.dt,
        nacionalidad: team.dtNac,
        edad: team.dtEdad
      },
      titulos_mundiales: team.titulos,
      estadio_sede_principal: team.estadio,
      activo: true,
      creado_en: now,
      actualizado_en: now
    };
    equipos.push(equipoDoc);

    // 2. Generar 25 Jugadores para este equipo
    // Distribución: 3 Arqueros, 8 Defensores, 8 Mediocampistas, 6 Delanteros
    const positionPlan = [
      { pos: "Arquero", count: 3, dorsales: [1, 12, 23] },
      { pos: "Defensor", count: 8, dorsales: [2, 3, 4, 6, 13, 14, 17, 24] },
      { pos: "Mediocampista", count: 8, dorsales: [5, 8, 10, 16, 18, 20, 21, 25] },
      { pos: "Delantero", count: 6, dorsales: [7, 9, 11, 15, 19, 22] }
    ];

    let regionKey = "latin";
    if (team.conf === "UEFA") regionKey = "european";
    else if (team.conf === "CAF") regionKey = "african";
    else if (team.conf === "AFC" || team.conf === "OFC") regionKey = "asian";

    const namePool = namesByRegion[regionKey];

    let playerIndexInTeam = 0;

    positionPlan.forEach(group => {
      for (let i = 0; i < group.count; i++) {
        const dorsal = group.dorsales[i];
        playerIndexInTeam++;

        const nombre = namePool.nombres[(teamIndex * 7 + playerIndexInTeam * 3 + i) % namePool.nombres.length];
        const apellido = namePool.apellidos[(teamIndex * 11 + playerIndexInTeam * 5 + i) % namePool.apellidos.length];
        
        // Club realista asignado
        const club = clubsDatabase[(teamIndex * 3 + playerIndexInTeam + i) % clubsDatabase.length];

        // Edad entre 18 y 37
        const edad = 19 + ((teamIndex * 13 + playerIndexInTeam * 7) % 18);
        const birthYear = 2030 - edad;
        const birthMonth = String(1 + ((playerIndexInTeam * 3) % 12)).padStart(2, '0');
        const birthDay = String(1 + ((playerIndexInTeam * 5) % 28)).padStart(2, '0');
        const fechaNacimiento = `${birthYear}-${birthMonth}-${birthDay}`;

        // Altura y peso según posición
        let altura = 180 + ((playerIndexInTeam * 3) % 15);
        if (group.pos === "Arquero") altura = 188 + (playerIndexInTeam % 9);
        if (group.pos === "Defensor") altura = 184 + (playerIndexInTeam % 10);
        let peso = Math.round(altura - 105 + (playerIndexInTeam % 8));

        const feet = ["Derecho", "Izquierdo", "Ambidiestro"];
        const pieHabil = feet[(playerIndexInTeam + teamIndex) % (playerIndexInTeam % 5 === 0 ? 3 : 2)];

        // Estadísticas realistas
        const partidos = 5 + ((teamIndex * 5 + playerIndexInTeam * 4) % 95);
        let goles = 0;
        let asistencias = 0;
        if (group.pos === "Delantero") {
          goles = Math.round(partidos * (0.2 + ((playerIndexInTeam % 5) * 0.08)));
          asistencias = Math.round(partidos * 0.15);
        } else if (group.pos === "Mediocampista") {
          goles = Math.round(partidos * 0.1);
          asistencias = Math.round(partidos * 0.2);
        } else if (group.pos === "Defensor") {
          goles = Math.round(partidos * 0.03);
          asistencias = Math.round(partidos * 0.05);
        }

        const amarillas = Math.round(partidos * 0.12);
        const rojas = Math.round(amarillas * 0.05);

        // Valor de mercado ponderado por edad, ranking de selección y posición
        let baseVal = (65 - team.rank) * 1200000;
        if (edad < 25) baseVal *= 1.8;
        if (dorsal === 10 || dorsal === 9 || dorsal === 7) baseVal *= 1.6;
        const valorMercado = Math.max(800000, Math.round(baseVal + (playerIndexInTeam * 950000)));

        const isCapitan = (dorsal === 10 && group.pos !== "Arquero") || (dorsal === 1 && team.codigo === "FRA");
        const isTitular = dorsal <= 11;

        const jugadorDoc = {
          nombre: nombre,
          apellido: apellido,
          equipo_codigo: team.codigo,
          equipo_nombre: team.nombre,
          posicion: group.pos,
          numero_camiseta: dorsal,
          edad: edad,
          fecha_nacimiento: fechaNacimiento,
          altura_cm: altura,
          peso_kg: peso,
          pie_habil: pieHabil,
          club_actual: {
            nombre: club.nombre,
            pais: club.pais,
            liga: club.liga
          },
          estadisticas_seleccion: {
            partidos_jugados: partidos,
            goles: goles,
            asistencias: asistencias,
            tarjetas_amarillas: amarillas,
            tarjetas_rojas: rojas
          },
          valor_mercado_eur: valorMercado,
          capitan: isCapitan,
          titular_habitual: isTitular,
          creado_en: now,
          actualizado_en: now
        };

        jugadores.push(jugadorDoc);
      }
    });
  });

  return { equipos, jugadores };
}

// Ejecución y generación de archivos
const dataDir = path.join(__dirname);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const { equipos, jugadores } = generateDataset();

fs.writeFileSync(path.join(dataDir, 'equipos.json'), JSON.stringify(equipos, null, 2), 'utf-8');
fs.writeFileSync(path.join(dataDir, 'jugadores.json'), JSON.stringify(jugadores, null, 2), 'utf-8');

console.log(`=======================================================`);
console.log(`✓ Generación de datos completada exitosamente:`);
console.log(`  - Total Equipos creados: ${equipos.length} (Grupos A a P)`);
console.log(`  - Total Jugadores creados: ${jugadores.length} (25 por selección)`);
console.log(`  - Archivos JSON guardados en: ${dataDir}`);
console.log(`=======================================================`);

// Generar también el script de inicialización directa para MongoDB Docker: init-scripts/03-seed-data.js
const initScriptsDir = path.join(__dirname, '..', 'init-scripts');
if (!fs.existsSync(initScriptsDir)) {
  fs.mkdirSync(initScriptsDir, { recursive: true });
}

const seedScriptContent = `// 03-seed-data.js
// Carga inicial reproducible e idempotente de 64 Equipos y 1.600 Jugadores

const databaseName = process.env.MONGO_INITDB_DATABASE || "fixture2030";
const projectDatabase = db.getSiblingDB(databaseName);

print("=======================================================");
print("Iniciando Carga Inicial de Datos en " + databaseName);
print("=======================================================");

const rawEquipos = ${JSON.stringify(equipos)};
const rawJugadores = ${JSON.stringify(jugadores)};

// Convertir fechas ISO a ISODate nativo de Mongo
const equiposToInsert = rawEquipos.map(e => ({
  ...e,
  creado_en: new Date(e.creado_en),
  actualizado_en: new Date(e.actualizado_en)
}));

const jugadoresToInsert = rawJugadores.map(j => ({
  ...j,
  creado_en: new Date(j.creado_en),
  actualizado_en: new Date(j.actualizado_en)
}));

// Carga Idempotente con bulkWrite / upsert en 'equipos'
const equiposOps = equiposToInsert.map(equipo => ({
  updateOne: {
    filter: { codigo_fifa: equipo.codigo_fifa },
    update: { $set: equipo },
    upsert: true
  }
}));

const equiposRes = projectDatabase.equipos.bulkWrite(equiposOps);
print("✓ Equipos procesados (Upserts/Matched): " + (equiposRes.upsertedCount + equiposRes.matchedCount) + " | Total actual: " + projectDatabase.equipos.countDocuments());

// Carga Idempotente con bulkWrite / upsert en 'jugadores'
const jugadoresOps = jugadoresToInsert.map(jugador => ({
  updateOne: {
    filter: { equipo_codigo: jugador.equipo_codigo, numero_camiseta: jugador.numero_camiseta },
    update: { $set: jugador },
    upsert: true
  }
}));

const jugadoresRes = projectDatabase.jugadores.bulkWrite(jugadoresOps);
print("✓ Jugadores procesados (Upserts/Matched): " + (jugadoresRes.upsertedCount + jugadoresRes.matchedCount) + " | Total actual: " + projectDatabase.jugadores.countDocuments());

print("=======================================================");
print("✓ Carga Inicial Completada con Éxito sin Duplicados.");
print("=======================================================");
`;

fs.writeFileSync(path.join(initScriptsDir, '03-seed-data.js'), seedScriptContent, 'utf-8');
console.log(`✓ Archivo init-scripts/03-seed-data.js generado correctamente.`);
