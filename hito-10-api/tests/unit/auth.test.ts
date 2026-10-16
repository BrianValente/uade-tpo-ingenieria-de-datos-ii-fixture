import { randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/app/errors/api-error.js'
import { buildServer } from '../../src/app/server.js'
import { readEnvironment } from '../../src/config/environment.js'
import {
  AuthService,
  tokenDigest,
} from '../../src/modules/auth/application/auth.service.js'
import type {
  Account,
  Session,
  User,
} from '../../src/modules/auth/domain/ports.js'

describe('Login y sesiones HTTP con repositorios simulados', () => {
  const password = randomBytes(24).toString('base64url')
  const account: Account = {
    id: randomUUID(),
    username: 'fixture-user',
    role: 'user',
    passwordHash: 'hash-simulado',
  }
  const accounts = { findByUsername: vi.fn() }
  const passwords = { hash: vi.fn(), verify: vi.fn() }
  const sessions = { create: vi.fn(), read: vi.fn(), remove: vi.fn() }
  let stored: Map<string, Session>
  let app: Awaited<ReturnType<typeof buildServer>>

  beforeEach(async () => {
    vi.resetAllMocks()
    stored = new Map()
    accounts.findByUsername.mockImplementation(async (username: string) =>
      username === account.username ? account : null,
    )
    passwords.verify.mockImplementation(
      async (hash: string, candidate: string) =>
        hash === account.passwordHash && candidate === password,
    )
    sessions.create.mockImplementation(async (digest: string, user: User) => {
      stored.set(digest, {
        user,
        createdAt: '2026-10-15T10:00:00.123456Z',
        lastActivity: '2026-10-15T10:00:00.123456Z',
        ttlSeconds: 1800,
      })
    })
    sessions.read.mockImplementation(
      async (digest: string) => stored.get(digest) ?? null,
    )
    sessions.remove.mockImplementation(async (digest: string) => {
      stored.delete(digest)
    })
    app = await buildServer(
      readEnvironment({ API_LOG_LEVEL: 'silent' }),
      undefined,
      {
        service: new AuthService(accounts, sessions, passwords),
        close: async () => {},
      },
    )
  })
  afterEach(async () => {
    await app.close()
  })

  async function login() {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: account.username, password },
    })
    expect(response.statusCode).toBe(200)
    return response
  }

  it('crea una sesión antes de entregar el token y almacena solo su digest', async () => {
    const response = await login()
    const body = response.json()
    expect(body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.tokenType).toBe('Bearer')
    expect(body.expiresIn).toBe(1800)
    expect(body.user).toEqual({
      id: account.id,
      username: account.username,
      role: 'user',
    })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(stored.has(tokenDigest(body.accessToken))).toBe(true)
    expect(stored.has(body.accessToken)).toBe(false)
    expect(response.body).not.toContain(account.passwordHash)
    expect(response.body).not.toContain(password)
  })

  it('un login repetido crea otra sesión y logout no afecta al otro dispositivo', async () => {
    const first = (await login()).json().accessToken
    const second = (await login()).json().accessToken
    expect(first).not.toBe(second)
    for (let i = 0; i < 2; i++) {
      const response = await app.inject({
        method: 'DELETE',
        url: '/auth/session',
        headers: { authorization: `Bearer ${first}` },
      })
      expect(response.statusCode).toBe(204)
      expect(response.body).toBe('')
    }
    const closed = await app.inject({
      url: '/auth/session',
      headers: { authorization: `Bearer ${first}` },
    })
    const active = await app.inject({
      url: '/auth/session',
      headers: { authorization: `bearer ${second}` },
    })
    expect(closed.statusCode).toBe(401)
    expect(active.statusCode).toBe(200)
    expect(active.json().ttlSeconds).toBe(1800)
    expect(active.body).not.toContain(second)
    expect(sessions.create).toHaveBeenCalledTimes(2)
    const contract = (await app.inject('/docs/json')).json()
    expect(
      contract.paths['/auth/session'].delete.responses['204'].content,
    ).toBeUndefined()
  })

  it.each([
    { username: 'fixture-user', password: 'incorrecta' },
    { username: 'no-existe', password: 'incorrecta' },
  ])(
    'rechaza credenciales sin revelar si existe $username',
    async (payload) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload,
      })
      expect(response.statusCode).toBe(401)
      expect(response.json().code).toBe('INVALID_CREDENTIALS')
      expect(response.json().message).toBe('Credenciales incorrectas.')
      expect(passwords.verify).toHaveBeenCalledOnce()
      expect(sessions.create).not.toHaveBeenCalled()
    },
  )

  it('rechaza cuerpos inválidos antes de buscar la cuenta o calcular Argon2', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'fixture-user', password, role: 'admin' },
    })
    expect(response.statusCode).toBe(400)
    expect(accounts.findByUsername).not.toHaveBeenCalled()
    expect(passwords.verify).not.toHaveBeenCalled()
  })

  it.each([
    { method: 'findByUsername', dependency: 'MongoDB' },
    { method: 'create', dependency: 'Redis' },
  ] as const)(
    'no entrega token si falla $method de $dependency',
    async ({ method }) => {
      const operation =
        method === 'findByUsername' ? accounts.findByUsername : sessions.create
      operation.mockRejectedValue(new ApiError('DEPENDENCY_UNAVAILABLE'))
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: account.username, password },
      })
      expect(response.statusCode).toBe(503)
      expect(response.json().accessToken).toBeUndefined()
      expect(response.body).not.toContain(password)
    },
  )

  it('distingue sesión ausente o expirada de Redis inaccesible', async () => {
    const headers = { authorization: `Bearer ${'A'.repeat(43)}` }
    const absent = await app.inject({ url: '/auth/session', headers })
    expect(absent.statusCode).toBe(401)
    sessions.read.mockRejectedValue(new ApiError('DEPENDENCY_UNAVAILABLE'))
    const down = await app.inject({ url: '/auth/session', headers })
    expect(down.statusCode).toBe(503)
  })

  it('valida el header antes de consultar Redis', async () => {
    const absent = await app.inject('/auth/session')
    const malformed = await app.inject({
      url: '/auth/session',
      headers: { authorization: 'Bearer incorrecto' },
    })
    expect(absent.statusCode).toBe(401)
    expect(malformed.statusCode).toBe(400)
    expect(sessions.read).not.toHaveBeenCalled()
  })

  it('no confirma logout cuando Redis rechaza la operación', async () => {
    sessions.remove.mockRejectedValue(new ApiError('DEPENDENCY_UNAVAILABLE'))
    const response = await app.inject({
      method: 'DELETE',
      url: '/auth/session',
      headers: { authorization: `Bearer ${'A'.repeat(43)}` },
    })
    expect(response.statusCode).toBe(503)
    expect(response.json().code).toBe('DEPENDENCY_UNAVAILABLE')
  })
})
