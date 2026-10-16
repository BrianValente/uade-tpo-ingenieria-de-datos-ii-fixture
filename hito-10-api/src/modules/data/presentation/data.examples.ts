import type {
  Comment,
  IrisMatch,
  MatchGraph,
  Player,
  Team,
} from '../domain/ports.js'

// Ejemplos ilustrativos de laboratorio. No son resultados medidos ni credenciales.
const team = {
  id: '4fe7c544-b1ce-5020-afae-7429c4c02d50',
  code: 'ARG',
  name: 'Argentina',
  confederation: 'CONMEBOL',
  selectionOrigin: 'clasificado_2026',
  qualificationStage: 'Clasificación',
  participates: true,
} satisfies Team
const away = {
  ...team,
  id: '550e8400-e29b-41d4-a716-446655440000',
  code: 'BRA',
  name: 'Brasil',
} satisfies Team
const player = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  teamId: team.id,
  teamCode: 'ARG',
  firstName: 'Ana',
  lastName: 'Pérez',
  birthDate: '2000-01-01T00:00:00.000Z',
  position: 'Delantero',
  number: 9,
  heightCm: 170,
  preferredFoot: 'Derecho',
  selected: true,
  available: true,
  synthetic: true,
} satisfies Player
const graph = {
  id: 'F2030-001',
  date: '2030-06-13',
  time: '16:00:00Z',
  phase: 'Grupos',
  homeCode: 'ARG',
  awayCode: 'BRA',
  venue: {
    id: 'MAD-01',
    name: 'Estadio de laboratorio',
    city: 'Madrid',
    country: 'España',
    region: 'Europa',
  },
} satisfies MatchGraph
const comment = {
  matchId: graph.id,
  createdAt: '2030-06-13T20:01:15.000Z',
  id: '123e4567-e89b-42d3-a456-426614174000',
  userId: '550e8400-e29b-41d4-a716-446655440000',
  username: 'fixture-user',
  content: 'Buen partido del Fixture 2030.',
  state: 'visible',
  likes: 0,
  replies: 0,
} satisfies Comment
const event = {
  code: 'EVT-H10-EJEMPLO',
  type: 'Gol' as const,
  minute: 10,
  detail: 'Gol de laboratorio',
}
const iris = {
  code: 'F2030-IRIS-0011',
  dateTime: '2030-06-13 16:00:00',
  homeCode: 'ARG',
  awayCode: 'BRA',
  state: 'EnJuego',
  referee: {
    code: 'ARB-EJEMPLO',
    name: 'Árbitro de laboratorio',
    nationality: 'Uruguay',
    license: 'LIC-A-EJEMPLO',
    category: 'Internacional',
  },
  homeCoach: {
    code: 'TEC-ARG-EJEMPLO',
    name: 'Técnico local',
    nationality: 'Argentina',
    license: 'LIC-L-EJEMPLO',
    teamCode: 'ARG',
  },
  awayCoach: {
    code: 'TEC-BRA-EJEMPLO',
    name: 'Técnico visitante',
    nationality: 'Brasil',
    license: 'LIC-V-EJEMPLO',
    teamCode: 'BRA',
  },
  events: [],
} satisfies IrisMatch

export const dataExamples = {
  team,
  player,
  comment,
  players: { items: [player], total: 24, page: 1, limit: 1 },
  match: { ...graph, home: team, away },
  events: {
    items: [
      {
        id: 'EVT-001',
        type: 'Gol',
        minute: 18,
        detail: 'Gol de laboratorio',
        player: {
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
          teamCode: player.teamCode,
        },
      },
    ],
    limit: 20,
  },
  comments: { items: [comment], nextCursor: null },
  cursor: Buffer.from(
    JSON.stringify({ createdAt: comment.createdAt, id: comment.id }),
  ).toString('base64url'),
  commentBody: {
    commentId: comment.id,
    createdAt: comment.createdAt,
    content: comment.content,
  },
  commentCreated: {
    commentId: comment.id,
    createdAt: comment.createdAt,
    content: comment.content,
    matchId: graph.id,
    user: { id: comment.userId, username: comment.username },
    state: 'visible',
  },
  statistics: {
    matchId: graph.id,
    start: '2030-06-13T20:00:00.000Z',
    end: '2030-06-13T20:01:00.000Z',
    teams: [],
  },
  statisticsWithPoints: {
    matchId: graph.id,
    start: '2030-06-13T20:00:00.000Z',
    end: '2030-06-13T20:01:00.000Z',
    teams: [
      {
        equipo_id: team.id,
        muestras: 6,
        posesion_promedio: 52.5,
        tiros_maximos: 3,
        pases_intervalo: 120,
      },
    ],
  },
  iris,
  stateBody: { state: 'EnJuego' },
  eventBody: event,
  irisWithEvent: { ...iris, events: [event] },
}
