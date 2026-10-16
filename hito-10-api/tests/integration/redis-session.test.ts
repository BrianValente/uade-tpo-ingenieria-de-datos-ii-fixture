import { randomBytes, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from 'redis'
import { expect, it } from 'vitest'

import { buildServer } from '../../src/app/server.js'
import { readAuthEnvironment } from '../../src/config/auth-environment.js'
import { readEnvironment } from '../../src/config/environment.js'
import {
  AuthService,
  tokenDigest,
} from '../../src/modules/auth/application/auth.service.js'
import { Argon2PasswordHasher } from '../../src/modules/auth/infrastructure/argon2-password-hasher.js'
import { RedisSessionRepository } from '../../src/modules/auth/infrastructure/redis-session.repository.js'

it('Lua, lectura HTTP, expiración real y logout repetido contra Redis, sin MongoDB', async () => {
  const config = readAuthEnvironment({
    ...process.env,
    API_REDIS_SCOPE: `redis-${randomUUID()}`,
  })
  const repository = new RedisSessionRepository(config)
  // Este repositorio de cuentas no se utiliza: la prueba no ejecuta login.
  const service = new AuthService(
    {
      findByUsername: async () => {
        throw new Error('Login fuera del alcance de esta prueba.')
      },
    },
    repository,
    new Argon2PasswordHasher(),
  )
  const app = await buildServer(
    readEnvironment({ API_LOG_LEVEL: 'silent' }),
    undefined,
    { service, close: () => repository.close() },
  )
  const client = createClient({
    socket: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      reconnectStrategy: false,
      connectTimeout: config.DEPENDENCY_TIMEOUT_MS,
    },
    ...(config.REDIS_USERNAME ? { username: config.REDIS_USERNAME } : {}),
    ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {}),
    database: config.REDIS_DATABASE,
    disableOfflineQueue: true,
  })
  client.on('error', () => {})
  const token = randomBytes(32).toString('base64url')
  const expiringToken = randomBytes(32).toString('base64url')
  const digest = tokenDigest(token)
  const expiringDigest = tokenDigest(expiringToken)
  const key = `fixture2030:h10:${config.API_REDIS_SCOPE}:sesion:${digest}`
  const expiringKey = `fixture2030:h10:${config.API_REDIS_SCOPE}:sesion:${expiringDigest}`
  const user = {
    id: randomUUID(),
    username: 'fixture-user',
    role: 'user' as const,
  }
  const context = { log: { info() {} } }
  try {
    await client.connect()
    await repository.create(digest, user, context)
    const stored = await client.hGetAll(key)
    expect(stored.usuario_id).toBe(user.id)
    expect(stored.sesion_id).toBe(digest)
    expect(JSON.stringify(stored)).not.toContain(token)
    const before = await client.pTTL(key)
    const session = await app.inject({
      url: '/auth/session',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(session.statusCode).toBe(200)
    expect(session.json().user).toEqual(user)
    expect(session.json().createdAt).toMatch(/\.\d{6}Z$/)
    expect(await client.pTTL(key)).toBeLessThanOrEqual(before)
    for (let i = 0; i < 2; i++) {
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: '/auth/session',
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
      ).toBe(204)
    }
    expect(await repository.read(digest, context)).toBeNull()
    await repository.create(expiringDigest, user, context)
    await client.pExpire(expiringKey, 50)
    await delay(100)
    const expired = await app.inject({
      url: '/auth/session',
      headers: { authorization: `Bearer ${expiringToken}` },
    })
    expect(expired.statusCode).toBe(401)
    expect(await client.pTTL(expiringKey)).toBe(-2)
  } finally {
    // Solo se cierran las dos sesiones creadas por esta prueba.
    await repository.remove(digest, context).catch(() => undefined)
    await repository.remove(expiringDigest, context).catch(() => undefined)
    if (client.isOpen) client.destroy()
    await app.close()
  }
})
