import { randomUUID } from 'node:crypto'
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
  } finally {
    // Solo se cierran sesiones creadas por esta prueba. Las cuentas de seed se conservan.
    for (const token of tokens)
      await auth.service
        .logout(token, { log: { info() {} } })
        .catch(() => undefined)
    await Promise.all([app.close(), accounts.close()])
  }
})
