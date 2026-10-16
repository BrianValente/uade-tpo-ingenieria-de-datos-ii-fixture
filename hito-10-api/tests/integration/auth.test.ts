import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { expect, it } from 'vitest'

import { buildServer } from '../../src/app/server.js'
import {
  readAuthEnvironment,
  readSeedPasswords,
} from '../../src/config/auth-environment.js'
import { readEnvironment } from '../../src/config/environment.js'
import { createAuthModule } from '../../src/modules/auth/auth.module.js'
import { seedUsers } from '../../src/modules/auth/application/seed-users.js'
import { Argon2PasswordHasher } from '../../src/modules/auth/infrastructure/argon2-password-hasher.js'
import { MongoAccountRepository } from '../../src/modules/auth/infrastructure/mongo-account.repository.js'

it('seed repetible, login, consulta y logout contra MongoDB y Redis reales', async () => {
  const config = readAuthEnvironment({
    ...process.env,
    API_REDIS_SCOPE: `prueba-${randomUUID()}`,
  })
  const passwords = readSeedPasswords()
  const accounts = new MongoAccountRepository(config)
  const auth = createAuthModule(config)
  const app = await buildServer(
    readEnvironment({ API_LOG_LEVEL: 'silent' }),
    undefined,
    auth,
  )
  const tokens: string[] = []
  try {
    const context = { log: { info() {} } }
    await seedUsers(accounts, new Argon2PasswordHasher(), passwords, context)
    expect(
      await seedUsers(accounts, new Argon2PasswordHasher(), passwords, context),
    ).toEqual({ inserted: 0, unchanged: 2 })
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'fixture-admin',
        password: passwords.API_SEED_ADMIN_PASSWORD,
      },
    })
    expect(login.statusCode).toBe(200)
    const token = login.json().accessToken as string
    tokens.push(token)
    expect(login.json().user.role).toBe('admin')
    const headers = { authorization: `Bearer ${token}` }
    const session = await app.inject({ url: '/auth/session', headers })
    expect(session.statusCode).toBe(200)
    expect(session.json().ttlSeconds).toBeGreaterThan(0)
    expect(session.json().ttlSeconds).toBeLessThanOrEqual(1800)
    for (let i = 0; i < 2; i++) {
      const logout = await app.inject({
        method: 'DELETE',
        url: '/auth/session',
        headers,
      })
      expect(logout.statusCode).toBe(204)
    }
    expect(
      (await app.inject({ url: '/auth/session', headers })).statusCode,
    ).toBe(401)
    const userLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'fixture-user',
        password: passwords.API_SEED_USER_PASSWORD,
      },
    })
    expect(userLogin.statusCode).toBe(200)
    tokens.push(userLogin.json().accessToken)
    expect(userLogin.json().user.role).toBe('user')

    const invalid = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: { $ne: null },
        password: passwords.API_SEED_ADMIN_PASSWORD,
      },
    })
    expect(invalid.statusCode).toBe(400)
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'fixture-admin',
        password: randomBytes(32).toString('base64url'),
      },
    })
    const unknownUser = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: `ausente-${randomUUID().slice(0, 8)}`,
        password: randomBytes(32).toString('base64url'),
      },
    })
    expect(wrongPassword.statusCode).toBe(401)
    expect(unknownUser.statusCode).toBe(401)
    expect(wrongPassword.json().message).toBe(unknownUser.json().message)

    // Se usa un puerto local libre para provocar indisponibilidad sin detener servicios.
    const probe = createServer()
    probe.listen(0, '127.0.0.1')
    await once(probe, 'listening')
    const address = probe.address()
    if (!address || typeof address === 'string')
      throw new Error('Puerto de prueba no disponible.')
    await new Promise<void>((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve())),
    )
    for (const dependency of ['MongoDB', 'Redis'] as const) {
      const unavailable = createAuthModule({
        ...config,
        DEPENDENCY_TIMEOUT_MS: 100,
        ...(dependency === 'MongoDB'
          ? { MONGO_PORT: address.port }
          : { REDIS_PORT: address.port }),
      })
      const unavailableApp = await buildServer(
        readEnvironment({ API_LOG_LEVEL: 'silent' }),
        undefined,
        unavailable,
      )
      try {
        const response = await unavailableApp.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            username: 'fixture-admin',
            password: passwords.API_SEED_ADMIN_PASSWORD,
          },
        })
        expect(response.statusCode, dependency).toBe(503)
        expect(response.json().code).toBe('DEPENDENCY_UNAVAILABLE')
        expect(response.json().accessToken).toBeUndefined()
      } finally {
        await unavailableApp.close()
      }
    }
  } finally {
    // Solo se cierran sesiones creadas por esta prueba. Las cuentas de seed se conservan.
    for (const token of tokens)
      await auth.service
        .logout(token, { log: { info() {} } })
        .catch(() => undefined)
    await Promise.all([app.close(), accounts.close()])
  }
})
