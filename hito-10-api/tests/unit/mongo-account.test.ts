import { randomUUID } from 'node:crypto'
import { MongoClient, MongoNetworkError } from 'mongodb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readAuthEnvironment } from '../../src/config/auth-environment.js'
import { MongoAccountRepository } from '../../src/modules/auth/infrastructure/mongo-account.repository.js'

const mock = vi.hoisted(() => ({
  findOne: vi.fn(),
  createIndex: vi.fn(),
  updateOne: vi.fn(),
  close: vi.fn(),
}))
vi.mock('mongodb', async (original) => ({
  ...(await original<typeof import('mongodb')>()),
  MongoClient: vi.fn(
    class {
      db() {
        return { collection: () => mock }
      }
      close = mock.close
    },
  ),
}))
const context = { log: { info: vi.fn() } }

describe('Adaptador de cuentas con cliente MongoDB simulado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selecciona un timeout y no reintenta operaciones de forma automática', () => {
    new MongoAccountRepository(
      readAuthEnvironment({ DEPENDENCY_TIMEOUT_MS: '500' }),
    )
    expect(vi.mocked(MongoClient).mock.calls[0]?.[1]).toMatchObject({
      timeoutMS: 500,
      serverSelectionTimeoutMS: 500,
      retryReads: false,
      retryWrites: false,
    })
  })

  it('busca por username y conserva identidad y rol', async () => {
    const document = {
      _id: randomUUID(),
      username: 'fixture-user',
      role: 'user',
      passwordHash: 'hash-simulado',
    }
    mock.findOne.mockResolvedValue(document)
    const repository = new MongoAccountRepository(readAuthEnvironment({}))
    expect(await repository.findByUsername('fixture-user', context)).toEqual({
      id: document._id,
      username: document.username,
      role: document.role,
      passwordHash: document.passwordHash,
    })
    expect(mock.findOne).toHaveBeenCalledWith(
      { username: 'fixture-user' },
      {
        projection: { _id: 1, username: 1, role: 1, passwordHash: 1 },
      },
    )
  })

  it('distingue cuenta ausente, falla de red y documento inválido', async () => {
    const repository = new MongoAccountRepository(readAuthEnvironment({}))
    mock.findOne.mockResolvedValue(null)
    expect(await repository.findByUsername('fixture-user', context)).toBeNull()
    mock.findOne.mockRejectedValue(new MongoNetworkError('detalle-interno'))
    await expect(
      repository.findByUsername('fixture-user', context),
    ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' })
    mock.findOne.mockResolvedValue({ username: 'fixture-user' })
    await expect(
      repository.findByUsername('fixture-user', context),
    ).rejects.toThrow()
  })

  it('crea un índice único y usa solo setOnInsert para conservar cuentas existentes', async () => {
    const repository = new MongoAccountRepository(readAuthEnvironment({}))
    const account = {
      id: randomUUID(),
      username: 'fixture-admin',
      role: 'admin' as const,
      passwordHash: 'hash-simulado',
    }
    mock.createIndex.mockResolvedValue('username_1')
    mock.updateOne.mockResolvedValue({ upsertedCount: 0 })
    await repository.ensureIndex(context)
    expect(await repository.insertIfAbsent(account, context)).toBe(false)
    expect(mock.createIndex).toHaveBeenCalledWith(
      { username: 1 },
      { unique: true },
    )
    expect(mock.updateOne).toHaveBeenCalledWith(
      { username: account.username },
      {
        $setOnInsert: {
          _id: account.id,
          username: account.username,
          role: account.role,
          passwordHash: account.passwordHash,
        },
      },
      { upsert: true },
    )
  })
})
