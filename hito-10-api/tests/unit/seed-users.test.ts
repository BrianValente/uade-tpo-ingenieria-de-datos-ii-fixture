import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  readAuthEnvironment,
  readSeedPasswords,
} from '../../src/config/auth-environment.js'
import { seedUsers } from '../../src/modules/auth/application/seed-users.js'
import { AuthService } from '../../src/modules/auth/application/auth.service.js'
import type { Account } from '../../src/modules/auth/domain/ports.js'
import { Argon2PasswordHasher } from '../../src/modules/auth/infrastructure/argon2-password-hasher.js'

const context = { log: { info: vi.fn() } }
function passwords() {
  return readSeedPasswords({
    API_SEED_ADMIN_PASSWORD: randomBytes(24).toString('base64url'),
    API_SEED_USER_PASSWORD: randomBytes(24).toString('base64url'),
  })
}

describe('Seed y Argon2id', () => {
  it('genera hashes distintos con salt aleatorio y verifica la contraseña', async () => {
    const password = randomBytes(24).toString('base64url')
    const hasher = new Argon2PasswordHasher()
    const first = await hasher.hash(password)
    const second = await hasher.hash(password)
    expect(first).toMatch(/^\$argon2id\$v=19\$/)
    expect(new Set(first.split('$')[3]?.split(','))).toEqual(
      new Set(['m=65536', 't=3', 'p=4']),
    )
    expect(first).not.toBe(second)
    expect(await hasher.verify(first, password)).toBe(true)
    expect(
      await hasher.verify(first, randomBytes(24).toString('base64url')),
    ).toBe(false)
  })

  it('el hash de relleno se verifica con Argon2 real y una cuenta ausente produce 401', async () => {
    const service = new AuthService(
      { findByUsername: async () => null },
      {
        create: vi.fn(),
        read: vi.fn(),
        remove: vi.fn(),
      },
      new Argon2PasswordHasher(),
    )
    await expect(
      service.login(
        {
          username: 'no-existe',
          password: randomBytes(24).toString('base64url'),
        },
        context,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('conserva IDs, hashes y roles al repetir la seed con otras contraseñas', async () => {
    const accounts = new Map<string, Account>()
    const repository = {
      ensureIndex: vi.fn(async () => {}),
      insertIfAbsent: vi.fn(async (account: Account) => {
        if (accounts.has(account.username)) return false
        accounts.set(account.username, account)
        return true
      }),
    }
    const hasher = {
      hash: vi.fn(async () => randomBytes(32).toString('hex')),
      verify: vi.fn(),
    }
    expect(await seedUsers(repository, hasher, passwords(), context)).toEqual({
      inserted: 2,
      unchanged: 0,
    })
    const original = [...accounts.values()]
    expect(await seedUsers(repository, hasher, passwords(), context)).toEqual({
      inserted: 0,
      unchanged: 2,
    })
    expect([...accounts.values()]).toEqual(original)
    expect(accounts.get('fixture-admin')?.role).toBe('admin')
    expect(accounts.get('fixture-user')?.role).toBe('user')
  })

  it('rechaza passwords débiles, iguales o ausentes sin imprimir valores', () => {
    expect(() => readSeedPasswords({})).toThrow('Configuración inválida:')
    expect(() =>
      readSeedPasswords({
        API_SEED_ADMIN_PASSWORD: 'breve',
        API_SEED_USER_PASSWORD: 'breve',
      }),
    ).toThrow('Configuración inválida:')
    const same = randomBytes(24).toString('base64url')
    expect(() =>
      readSeedPasswords({
        API_SEED_ADMIN_PASSWORD: same,
        API_SEED_USER_PASSWORD: same,
      }),
    ).toThrow('Configuración inválida: API_SEED_USER_PASSWORD')
  })

  it('rechaza credenciales MongoDB incompletas y hosts que contengan una URI', () => {
    expect(() => readAuthEnvironment({ MONGO_ROOT_USERNAME: 'admin' })).toThrow(
      'Configuración inválida: MONGO_ROOT_PASSWORD',
    )
    expect(() =>
      readAuthEnvironment({ MONGO_HOST: 'mongodb://admin:secreto@host' }),
    ).toThrow('Configuración inválida: MONGO_HOST')
    expect(() => readAuthEnvironment({ DEPENDENCY_TIMEOUT_MS: '0' })).toThrow(
      'Configuración inválida: DEPENDENCY_TIMEOUT_MS',
    )
  })
})
