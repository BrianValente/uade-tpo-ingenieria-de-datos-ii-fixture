import { randomUUID } from 'node:crypto'
import { SimpleError } from 'redis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readAuthEnvironment } from '../../src/config/auth-environment.js'
import {
  CREATE_SESSION,
  READ_AND_RENEW_SESSION,
  READ_SESSION,
  RedisSessionRepository,
} from '../../src/modules/auth/infrastructure/redis-session.repository.js'

const mock = vi.hoisted(() => ({
  isOpen: false,
  on: vi.fn(),
  connect: vi.fn(),
  eval: vi.fn(),
  del: vi.fn(),
  destroy: vi.fn(),
}))
vi.mock('redis', async (original) => ({
  ...(await original<typeof import('redis')>()),
  createClient: vi.fn(() => mock),
}))
const context = { log: { info: vi.fn() } }

describe('Adaptador de sesiones con cliente Redis simulado', () => {
  let repository: RedisSessionRepository
  beforeEach(() => {
    vi.resetAllMocks()
    mock.isOpen = false
    mock.connect.mockImplementation(async () => {
      mock.isOpen = true
      return mock
    })
    mock.destroy.mockImplementation(() => {
      mock.isOpen = false
    })
    repository = new RedisSessionRepository(
      readAuthEnvironment({ DEPENDENCY_TIMEOUT_MS: '100' }),
    )
  })
  afterEach(async () => {
    await repository.close()
    vi.useRealTimers()
  })

  it('crea atributos y TTL mediante un único script, sin guardar el token', async () => {
    mock.eval.mockResolvedValue(1)
    const user = {
      id: randomUUID(),
      username: 'fixture-user',
      role: 'user' as const,
    }
    await repository.create('digest', user, context)
    expect(mock.eval).toHaveBeenCalledWith(CREATE_SESSION, {
      keys: ['fixture2030:h10:api:sesion:digest'],
      arguments: ['digest', user.id, user.username, 'user', '1800'],
    })
  })

  it('conserva microsegundos y devuelve el TTL de la lectura atómica', async () => {
    const id = randomUUID()
    mock.eval.mockResolvedValue([
      [
        'usuario_id',
        id,
        'username',
        'fixture-user',
        'rol',
        'user',
        'creada_en',
        '0.123456',
        'ultima_actividad',
        '1.654321',
      ],
      1750000,
    ])
    const session = await repository.read('digest', context)
    expect(session?.createdAt).toBe('1970-01-01T00:00:00.123456Z')
    expect(session?.lastActivity).toBe('1970-01-01T00:00:01.654321Z')
    expect(session?.ttlSeconds).toBe(1750)
    expect(mock.eval).toHaveBeenCalledWith(READ_SESSION, {
      keys: ['fixture2030:h10:api:sesion:digest'],
      arguments: [],
    })
  })

  it('interpreta ausencia como null y no como falla de conexión', async () => {
    mock.eval.mockResolvedValue(null)
    expect(await repository.read('digest', context)).toBeNull()
    mock.eval.mockRejectedValue(new Error('detalle-interno'))
    await expect(repository.read('digest', context)).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    })
  })

  it('renueva actividad solo si la sesión todavía existe', async () => {
    const id = randomUUID()
    mock.eval.mockResolvedValueOnce([
      [
        'usuario_id',
        id,
        'username',
        'fixture-user',
        'rol',
        'user',
        'creada_en',
        '0.123456',
        'ultima_actividad',
        '2.000001',
      ],
      1800000,
    ])
    const session = await repository.readAndRenew('digest', context)
    expect(session?.lastActivity).toBe('1970-01-01T00:00:02.000001Z')
    expect(session?.ttlSeconds).toBe(1800)
    expect(mock.eval).toHaveBeenCalledWith(READ_AND_RENEW_SESSION, {
      keys: ['fixture2030:h10:api:sesion:digest'],
      arguments: ['1800'],
    })
    mock.eval.mockResolvedValueOnce(null)
    expect(await repository.readAndRenew('expired', context)).toBeNull()
  })

  it('corta una operación sin respuesta y no reintenta la escritura', async () => {
    vi.useFakeTimers()
    mock.eval.mockImplementation(() => new Promise(() => {}))
    const pending = repository.create(
      'digest',
      { id: randomUUID(), username: 'fixture-user', role: 'user' },
      context,
    )
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    })
    await vi.advanceTimersByTimeAsync(101)
    await assertion
    expect(mock.eval).toHaveBeenCalledTimes(1)
    expect(mock.destroy).toHaveBeenCalledOnce()
    mock.eval.mockResolvedValue(null)
    expect(await repository.read('digest', context)).toBeNull()
    expect(mock.connect).toHaveBeenCalledTimes(2)
  })

  it('elimina solo la clave indicada aunque ya no exista', async () => {
    mock.del.mockResolvedValue(0)
    await repository.remove('digest', context)
    expect(mock.del).toHaveBeenCalledWith('fixture2030:h10:api:sesion:digest')
  })

  it('no ejecuta una escritura si la conexión termina después del timeout', async () => {
    vi.useFakeTimers()
    let finishConnection: () => void = () => {}
    mock.connect.mockImplementation(() => {
      mock.isOpen = true
      return new Promise((resolve) => {
        finishConnection = () => resolve(mock)
      })
    })
    const pending = repository.create(
      'digest',
      { id: randomUUID(), username: 'fixture-user', role: 'user' },
      context,
    )
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    })
    await vi.advanceTimersByTimeAsync(101)
    await assertion
    finishConnection()
    await vi.advanceTimersByTimeAsync(1)
    expect(mock.eval).not.toHaveBeenCalled()
  })

  it('traduce un tipo de clave incorrecto como error interno, no como caída', async () => {
    mock.eval.mockRejectedValue(new SimpleError('WRONGTYPE detalle-interno'))
    await expect(repository.read('digest', context)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    })
  })

  it('rechaza datos corruptos como error interno, no como sesión ausente', async () => {
    mock.eval.mockResolvedValue([['usuario_id', 'incompleto'], 1000])
    await expect(repository.read('digest', context)).rejects.toThrow()
  })
})
