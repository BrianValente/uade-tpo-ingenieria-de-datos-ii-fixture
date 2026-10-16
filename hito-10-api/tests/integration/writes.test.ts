import { randomBytes, randomUUID } from 'node:crypto'
import cassandra from 'cassandra-driver'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { buildServer } from '../../src/app/server.js'
import {
  readAuthEnvironment,
  readSeedPasswords,
} from '../../src/config/auth-environment.js'
import { readDataEnvironment } from '../../src/config/data-environment.js'
import { readEnvironment } from '../../src/config/environment.js'
import { createAuthModule } from '../../src/modules/auth/auth.module.js'
import type { User } from '../../src/modules/auth/domain/ports.js'
import { commentGroup } from '../../src/modules/data/application/data.service.js'
import { createDataModule } from '../../src/modules/data/data.module.js'
import { createIrisFixture } from './fixtures/iris.js'

const config = readDataEnvironment()
let app: Awaited<ReturnType<typeof buildServer>>
let auth: ReturnType<typeof createAuthModule>
let client: cassandra.Client
let admin: { token: string; user: User }
let fan: { token: string; user: User }
const tokens: string[] = []
const headers = (actor: typeof admin) => ({
  authorization: `Bearer ${actor.token}`,
})

beforeAll(async () => {
  auth = createAuthModule(readAuthEnvironment())
  app = await buildServer(
    readEnvironment({ API_LOG_LEVEL: 'silent' }),
    undefined,
    auth,
    createDataModule(config),
  )
  const passwords = readSeedPasswords()
  const login = async (username: string, password: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username, password },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json<{ accessToken: string; user: User }>()
    tokens.push(body.accessToken)
    return { token: body.accessToken, user: body.user }
  }
  admin = await login('fixture-admin', passwords.API_SEED_ADMIN_PASSWORD)
  fan = await login('fixture-user', passwords.API_SEED_USER_PASSWORD)
  client = new cassandra.Client({
    contactPoints: [config.CASSANDRA_HOST],
    localDataCenter: config.CASSANDRA_DATACENTER,
    keyspace: config.CASSANDRA_KEYSPACE,
    protocolOptions: { port: config.CASSANDRA_PORT },
    socketOptions: {
      connectTimeout: config.DEPENDENCY_TIMEOUT_MS,
      readTimeout: config.DEPENDENCY_TIMEOUT_MS,
    },
  })
})

afterAll(async () => {
  for (const token of tokens)
    await auth?.service
      .logout(token, { log: { info() {} } })
      .catch(() => undefined)
  await Promise.all([app?.close(), client?.shutdown()])
})

const userRow = (actor: typeof admin, createdAt: string, id: string) =>
  client.execute(
    'SELECT * FROM comentarios_por_usuario WHERE usuario_id = ? AND bucket_mes = ? AND creado_en = ? AND comentario_id = ?',
    [
      cassandra.types.Uuid.fromString(actor.user.id),
      cassandra.types.LocalDate.fromString(createdAt.slice(0, 7) + '-01'),
      new Date(createdAt),
      cassandra.types.Uuid.fromString(id),
    ],
    { prepare: true },
  )

it('Cassandra conserva autor, datos e índices al repetir, rechazar colisiones y reparar una vista faltante', async () => {
  const matchId = `F2030-TEST-${randomBytes(8).toString('hex').toUpperCase()}`
  const createdAt = '2030-06-13T20:01:15.000Z'
  const firstId = randomUUID()
  const ids = [
    firstId,
    ...Array.from(
      { length: 2 },
      () => randomUUID().slice(0, -1) + firstId.at(-1),
    ),
  ]
  ids.push(
    randomUUID().slice(0, -1) + ((commentGroup(firstId) + 1) % 16).toString(16),
  )
  ids.sort()
  const body = (commentId: string) => ({
    commentId,
    createdAt,
    content: 'Comentario de integración',
  })
  const post = (actor: typeof admin, payload: ReturnType<typeof body>) =>
    app.inject({
      method: 'POST',
      url: `/partidos/${matchId}/comentarios`,
      headers: headers(actor),
      payload,
    })
  for (const id of ids)
    expect((await post(admin, body(id))).statusCode).toBe(201)
  expect((await post(admin, body(ids[0]!))).statusCode).toBe(201)
  expect((await post(admin, body(ids[0]!.toUpperCase()))).statusCode).toBe(201)
  expect((await post(fan, body(ids[0]!))).statusCode).toBe(409)
  expect(
    (await post(admin, { ...body(ids[0]!), content: 'Contenido diferente' }))
      .statusCode,
  ).toBe(409)
  expect((await userRow(fan, createdAt, ids[0]!)).rows).toHaveLength(0)

  const olderId = randomUUID()
  const olderAt = '2030-06-13T20:01:14.000Z'
  expect(
    (await post(admin, { ...body(olderId), createdAt: olderAt })).statusCode,
  ).toBe(201)
  const seen: string[] = []
  let cursor: string | null = null
  for (let page = 0; page < 8; page++) {
    const response = await app.inject({
      url: `/partidos/${matchId}/comentarios?minute=2030-06-13T20:01:00.000Z&limit=1${cursor ? `&cursor=${cursor}` : ''}`,
      headers: headers(admin),
    })
    expect(response.statusCode).toBe(200)
    const result: {
      items: { id: string; userId: string; content: string }[]
      nextCursor: string | null
    } = response.json()
    for (const item of result.items) {
      expect(item.userId).toBe(admin.user.id)
      expect(item.content).toBe('Comentario de integración')
      seen.push(item.id)
    }
    cursor = result.nextCursor
    if (!cursor) break
  }
  expect(cursor).toBeNull()
  expect(seen).toEqual([...ids, olderId])
  for (const id of ids)
    expect((await userRow(admin, createdAt, id)).rows).toHaveLength(1)

  // Estado parcial real y controlado: se reserva solo la vista de un comentario nuevo.
  const repairId = randomUUID()
  const repair = await client.execute(
    `INSERT INTO comentarios_por_partido
    (partido_id, bucket_minuto, grupo, creado_en, comentario_id, usuario_id, usuario_nombre, contenido, estado, likes, respuestas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) IF NOT EXISTS`,
    [
      matchId,
      new Date('2030-06-13T20:01:00.000Z'),
      (commentGroup(repairId) + 1) % 16,
      new Date(createdAt),
      cassandra.types.Uuid.fromString(repairId),
      cassandra.types.Uuid.fromString(admin.user.id),
      admin.user.username,
      'Comentario de integración',
      'visible',
      7,
      2,
    ],
    { prepare: true },
  )
  expect(repair.wasApplied()).toBe(true)
  expect((await userRow(admin, createdAt, repairId)).rows).toHaveLength(0)
  expect((await post(admin, body(repairId))).statusCode).toBe(201)
  const repaired = (await userRow(admin, createdAt, repairId)).rows[0]!
  expect(repaired.likes).toBe(7)
  expect(repaired.respuestas).toBe(2)
  const noCopy = await client.execute(
    `SELECT comentario_id FROM comentarios_por_partido
    WHERE partido_id = ? AND bucket_minuto = ? AND grupo = ? AND creado_en = ? AND comentario_id = ?`,
    [
      matchId,
      new Date('2030-06-13T20:01:00.000Z'),
      commentGroup(repairId),
      new Date(createdAt),
      cassandra.types.Uuid.fromString(repairId),
    ],
    { prepare: true },
  )
  expect(noCopy.rows).toHaveLength(0)

  // Dos creadores compiten por la misma clave: solo uno puede reservarla.
  const raceId = randomUUID()
  const race = await Promise.all([
    post(admin, body(raceId)),
    post(fan, body(raceId)),
  ])
  expect(race.map((response) => response.statusCode).sort()).toEqual([201, 409])
  const winner = race[0]!.statusCode === 201 ? admin : fan
  const loser = winner === admin ? fan : admin
  expect((await userRow(winner, createdAt, raceId)).rows).toHaveLength(1)
  expect((await userRow(loser, createdAt, raceId)).rows).toHaveLength(0)
})

it('IRIS persiste transiciones y eventos y rechaza permisos, repetición y cambios tras el cierre', async () => {
  const code = createIrisFixture(config)
  const change = (actor: typeof admin, state: string) =>
    app.inject({
      method: 'PATCH',
      url: `/partidos/${code}/estado`,
      headers: headers(actor),
      payload: { state },
    })
  const read = async () => {
    const response = await app.inject({
      url: `/partidos/${code}/detalle`,
      headers: headers(admin),
    })
    expect(response.statusCode).toBe(200)
    return response.json<{ state: string; events: { code: string }[] }>()
  }
  expect((await change(fan, 'EnJuego')).statusCode).toBe(403)
  expect((await change(admin, 'Finalizado')).statusCode).toBe(409)
  expect((await read()).state).toBe('Programado')
  expect((await change(admin, 'EnJuego')).statusCode).toBe(200)
  expect((await change(admin, 'EnJuego')).statusCode).toBe(409)
  expect((await read()).state).toBe('EnJuego')

  const event = {
    code: `EVT-H10-${randomUUID().replaceAll('-', '').toUpperCase()}`,
    type: 'Gol',
    minute: 10,
    detail: 'Evento de integración',
  }
  const add = (actor: typeof admin) =>
    app.inject({
      method: 'POST',
      url: `/partidos/${code}/eventos`,
      headers: headers(actor),
      payload: event,
    })
  expect((await add(fan)).statusCode).toBe(403)
  expect((await read()).events).toHaveLength(0)
  expect((await add(admin)).statusCode).toBe(201)
  expect((await add(admin)).statusCode).toBe(409)
  expect((await read()).events.map((value) => value.code)).toEqual([event.code])
  expect((await change(admin, 'Finalizado')).statusCode).toBe(200)
  expect((await change(admin, 'Finalizado')).statusCode).toBe(409)
  expect((await add(admin)).statusCode).toBe(409)
  const final = await read()
  expect(final.state).toBe('Finalizado')
  expect(final.events).toHaveLength(1)
})
