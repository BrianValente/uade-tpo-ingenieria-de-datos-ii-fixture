import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/app/errors/api-error.js'
import { buildServer } from '../../src/app/server.js'
import { readEnvironment } from '../../src/config/environment.js'
import { AuthService } from '../../src/modules/auth/application/auth.service.js'
import type { Session, User } from '../../src/modules/auth/domain/ports.js'
import { DataService } from '../../src/modules/data/application/data.service.js'
import type {
  Comment,
  IrisMatch,
  MatchGraph,
  Player,
  Team,
} from '../../src/modules/data/domain/ports.js'

const token = 'A'.repeat(43)
const headers = { authorization: `Bearer ${token}` }
const team: Team = {
  id: randomUUID(),
  code: 'ARG',
  name: 'Argentina',
  confederation: 'CONMEBOL',
  selectionOrigin: 'clasificado_2026',
  qualificationStage: 'Clasificación',
  participates: true,
}
const player: Player = {
  id: randomUUID(),
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
}
const graphMatch: MatchGraph = {
  id: 'F2030-001',
  date: '2030-06-13',
  time: '16:00:00Z',
  phase: 'Grupos',
  homeCode: 'ARG',
  awayCode: 'BRA',
  venue: {
    id: 'MAD-01',
    name: 'Estadio',
    city: 'Madrid',
    country: 'España',
    region: 'Europa',
  },
}
const objectMatch: IrisMatch = {
  code: 'F2030-IRIS-0011',
  dateTime: '2030-06-13 16:00:00',
  homeCode: 'ARG',
  awayCode: 'BRA',
  state: 'EnJuego',
  referee: {
    code: 'ARB-1',
    name: 'Árbitro',
    nationality: 'Uruguay',
    license: 'A-1',
    category: 'Internacional',
  },
  homeCoach: {
    code: 'TEC-1',
    name: 'Técnico A',
    nationality: 'Argentina',
    license: 'T-1',
    teamCode: 'ARG',
  },
  awayCoach: {
    code: 'TEC-2',
    name: 'Técnico B',
    nationality: 'Brasil',
    license: 'T-2',
    teamCode: 'BRA',
  },
  events: [],
}

describe('Rutas de datos con adaptadores simulados', () => {
  const documents = {
    findTeam: vi.fn(),
    listPlayers: vi.fn(),
    close: vi.fn(async () => {}),
  }
  const graph = {
    findMatch: vi.fn(),
    listEvents: vi.fn(),
    close: vi.fn(async () => {}),
  }
  const comments = {
    list: vi.fn(),
    create: vi.fn(),
    close: vi.fn(async () => {}),
  }
  const statistics = { summary: vi.fn() }
  const objects = { find: vi.fn(), changeState: vi.fn(), addEvent: vi.fn() }
  const sessions = {
    create: vi.fn(),
    read: vi.fn(),
    readAndRenew: vi.fn(),
    remove: vi.fn(),
  }
  let currentUser: User
  let app: Awaited<ReturnType<typeof buildServer>>

  beforeEach(async () => {
    vi.resetAllMocks()
    currentUser = { id: randomUUID(), username: 'fixture-user', role: 'user' }
    sessions.readAndRenew.mockImplementation(async (): Promise<Session> => ({
      user: currentUser,
      createdAt: '2026-10-16T00:00:00.000Z',
      lastActivity: '2026-10-16T00:01:00.000Z',
      ttlSeconds: 1800,
    }))
    documents.findTeam.mockImplementation(async (code: string) =>
      code === 'ARG'
        ? team
        : code === 'BRA'
          ? { ...team, id: randomUUID(), code: 'BRA', name: 'Brasil' }
          : null,
    )
    documents.listPlayers.mockResolvedValue({ items: [player], total: 1 })
    graph.findMatch.mockResolvedValue(graphMatch)
    graph.listEvents.mockResolvedValue([])
    comments.list.mockResolvedValue([])
    comments.create.mockResolvedValue(undefined)
    statistics.summary.mockResolvedValue([{ equipo_id: team.id, muestras: 6 }])
    objects.find.mockResolvedValue(objectMatch)
    objects.changeState.mockResolvedValue({
      ...objectMatch,
      state: 'Finalizado',
    })
    objects.addEvent.mockResolvedValue({
      ...objectMatch,
      events: [{ code: 'EVT-1', type: 'Gol', minute: 10, detail: '' }],
    })
    const auth = new AuthService({ findByUsername: vi.fn() }, sessions, {
      hash: vi.fn(),
      verify: vi.fn(),
    })
    const data = new DataService(
      documents,
      graph,
      comments,
      statistics,
      objects,
    )
    app = await buildServer(
      readEnvironment({ API_LOG_LEVEL: 'silent' }),
      undefined,
      { service: auth, close: async () => {} },
      { service: data, close: async () => {} },
    )
  })

  afterEach(async () => {
    await app.close()
  })

  it('consulta equipo y plantel paginado y renueva la sesión en cada acceso', async () => {
    const selected = await app.inject({ url: '/equipos/ARG', headers })
    const squad = await app.inject({
      url: '/equipos/ARG/jugadores?page=1&limit=10',
      headers,
    })
    expect(selected.statusCode).toBe(200)
    expect(selected.json().code).toBe('ARG')
    expect(squad.statusCode).toBe(200)
    expect(squad.json()).toMatchObject({ total: 1, page: 1, limit: 10 })
    expect(documents.listPlayers).toHaveBeenCalledWith(
      team.id,
      1,
      10,
      expect.anything(),
    )
    expect(sessions.readAndRenew).toHaveBeenCalledTimes(2)
  })

  it('rechaza entrada y límites antes de consultar MongoDB', async () => {
    const invalid = await app.inject({ url: '/equipos/xx', headers })
    const excessive = await app.inject({
      url: '/equipos/ARG/jugadores?limit=51',
      headers,
    })
    expect(invalid.statusCode).toBe(400)
    expect(excessive.statusCode).toBe(400)
    expect(documents.findTeam).not.toHaveBeenCalled()
  })

  it('distingue ausencia de MongoDB inaccesible', async () => {
    const absent = await app.inject({ url: '/equipos/URU', headers })
    documents.findTeam.mockRejectedValueOnce(
      new ApiError('DEPENDENCY_UNAVAILABLE'),
    )
    const unavailable = await app.inject({ url: '/equipos/ARG', headers })
    expect(absent.statusCode).toBe(404)
    expect(unavailable.statusCode).toBe(503)
  })

  it('combina Neo4j y MongoDB y no entrega una ficha parcial', async () => {
    const success = await app.inject({ url: '/partidos/F2030-001', headers })
    expect(success.statusCode).toBe(200)
    expect(success.json()).toMatchObject({
      id: 'F2030-001',
      home: { code: 'ARG' },
      away: { code: 'BRA' },
    })
    documents.findTeam.mockImplementation(async (code: string) =>
      code === 'ARG' ? team : null,
    )
    const partial = await app.inject({ url: '/partidos/F2030-001', headers })
    expect(partial.statusCode).toBe(503)
  })

  it('acota eventos Neo4j y conserva lista vacía como éxito', async () => {
    const response = await app.inject({
      url: '/partidos/F2030-001/eventos?limit=100',
      headers,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ items: [], limit: 100 })
    expect(graph.listEvents).toHaveBeenCalledWith(
      'F2030-001',
      100,
      expect.anything(),
    )
  })

  it('une la página Cassandra y emite un cursor sin exponer sus claves', async () => {
    const rows: Comment[] = Array.from({ length: 3 }, (_, index) => ({
      matchId: 'F2030-001',
      createdAt: `2030-06-13T20:00:0${2 - index}.000Z`,
      id: randomUUID(),
      userId: currentUser.id,
      username: currentUser.username,
      content: `Comentario ${index}`,
      state: 'visible',
      likes: 0,
      replies: 0,
    }))
    comments.list.mockResolvedValueOnce(rows)
    const response = await app.inject({
      url: '/partidos/F2030-001/comentarios?minute=2030-06-13T20:00:00.000Z&limit=2',
      headers,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().items).toHaveLength(2)
    expect(response.json().nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(response.json().nextCursor).not.toContain(rows[1]!.id)
  })

  it('publica comentarios con la identidad de sesión y la repetición conserva las claves', async () => {
    const body = {
      commentId: randomUUID(),
      createdAt: '2030-06-13T20:00:15.000Z',
      content: 'Vamos Argentina',
    }
    for (let index = 0; index < 2; index++) {
      const response = await app.inject({
        method: 'POST',
        url: '/partidos/F2030-001/comentarios',
        headers,
        payload: body,
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().user).toEqual({
        id: currentUser.id,
        username: currentUser.username,
      })
    }
    expect(comments.create).toHaveBeenCalledTimes(2)
    expect(comments.create.mock.calls[0]?.[0]).toEqual(
      comments.create.mock.calls[1]?.[0],
    )
  })

  it('acepta los ejemplos publicados de POST y PATCH sin errores de contrato', async () => {
    currentUser.role = 'admin'
    const contract = (await app.inject('/docs/json')).json()
    for (const example of [
      {
        path: '/partidos/{id}/comentarios',
        url: '/partidos/F2030-001/comentarios',
        method: 'POST',
        status: 201,
      },
      {
        path: '/partidos/{codigo}/estado',
        url: '/partidos/F2030-IRIS-0011/estado',
        method: 'PATCH',
        status: 200,
      },
      {
        path: '/partidos/{codigo}/eventos',
        url: '/partidos/F2030-IRIS-0011/eventos',
        method: 'POST',
        status: 201,
      },
    ] as const) {
      const payload =
        contract.paths[example.path][example.method.toLowerCase()].requestBody
          .content['application/json'].example
      expect(payload).toBeDefined()
      const response = await app.inject({
        method: example.method,
        url: example.url,
        headers,
        payload,
      })
      expect(response.statusCode).toBe(example.status)
    }
    const teamResponse =
      contract.paths['/equipos/{codigo}'].get.responses['200'].content[
        'application/json'
      ].example
    expect(teamResponse.code).toBe('ARG')
  })

  it.each([
    { createdAt: '2030-06-13T20:00:00.000Z', id: '-'.repeat(36) },
    { createdAt: 'ayer', id: randomUUID() },
    { createdAt: '2030-06-13T20:00:00.000Z', id: randomUUID(), extra: true },
  ])(
    'rechaza un cursor inválido antes de consultar Redis o Cassandra',
    async (payload) => {
      const cursor = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const response = await app.inject({
        url: `/partidos/F2030-001/comentarios?minute=2030-06-13T20:00:00.000Z&cursor=${cursor}`,
        headers,
      })
      expect(response.statusCode).toBe(400)
      expect(sessions.readAndRenew).not.toHaveBeenCalled()
      expect(comments.list).not.toHaveBeenCalled()
    },
  )

  it('valida la ventana InfluxDB y limita su duración a 24 horas', async () => {
    const valid = await app.inject({
      url: '/partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T20:01:00.000Z',
      headers,
    })
    const invalid = await app.inject({
      url: '/partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-15T20:00:00.000Z',
      headers,
    })
    expect(valid.statusCode).toBe(200)
    expect(valid.json().teams).toHaveLength(1)
    expect(invalid.statusCode).toBe(400)
    expect(statistics.summary).toHaveBeenCalledTimes(1)
  })

  it('permite detalle IRIS a un usuario y reserva sus escrituras para admin', async () => {
    const detail = await app.inject({
      url: '/partidos/F2030-IRIS-0011/detalle',
      headers,
    })
    const forbidden = await app.inject({
      method: 'PATCH',
      url: '/partidos/F2030-IRIS-0011/estado',
      headers,
      payload: { state: 'Finalizado' },
    })
    currentUser = { ...currentUser, role: 'admin' }
    const allowed = await app.inject({
      method: 'PATCH',
      url: '/partidos/F2030-IRIS-0011/estado',
      headers,
      payload: { state: 'Finalizado' },
    })
    expect(detail.statusCode).toBe(200)
    expect(forbidden.statusCode).toBe(403)
    expect(allowed.statusCode).toBe(200)
    expect(objects.changeState).toHaveBeenCalledOnce()

    objects.changeState.mockRejectedValueOnce(new ApiError('CONFLICT'))
    const repeated = await app.inject({
      method: 'PATCH',
      url: '/partidos/F2030-IRIS-0011/estado',
      headers,
      payload: { state: 'Finalizado' },
    })
    expect(repeated.statusCode).toBe(409)
  })

  it('no recrea una sesión vencida al autorizar una operación', async () => {
    sessions.readAndRenew.mockResolvedValueOnce(null)
    const response = await app.inject({ url: '/equipos/ARG', headers })
    expect(response.statusCode).toBe(401)
    expect(documents.findTeam).not.toHaveBeenCalled()
    expect(sessions.create).not.toHaveBeenCalled()
  })
})
