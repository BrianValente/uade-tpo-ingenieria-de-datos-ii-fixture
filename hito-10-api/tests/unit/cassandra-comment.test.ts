import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readDataEnvironment } from '../../src/config/data-environment.js'
import type { Comment } from '../../src/modules/data/domain/ports.js'
import { CassandraCommentRepository } from '../../src/modules/data/infrastructure/cassandra-comment.repository.js'

const mock = vi.hoisted(() => ({
  execute: vi.fn(),
  shutdown: vi.fn(async () => {}),
}))

vi.mock('cassandra-driver', () => ({
  default: {
    Client: class {
      execute = mock.execute
      shutdown = mock.shutdown
    },
    types: {
      Uuid: { fromString: (value: string) => value },
      LocalDate: { fromString: (value: string) => value },
    },
  },
}))

const context = { log: { info: vi.fn() } }

describe('Escritura de las dos vistas Cassandra', () => {
  beforeEach(() => vi.resetAllMocks())

  it('un reintento con las mismas claves repara la segunda vista sin cambiar la primera', async () => {
    const repository = new CassandraCommentRepository(readDataEnvironment({}))
    const comment: Comment = {
      matchId: 'F2030-001',
      createdAt: '2030-06-13T20:01:15.000Z',
      id: randomUUID(),
      userId: randomUUID(),
      username: 'fixture-user',
      content: 'Comentario repetible',
      state: 'visible',
      likes: 0,
      replies: 0,
    }
    mock.execute
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('segunda vista inaccesible'))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})

    await expect(repository.create(comment, context)).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    })
    await repository.create(comment, context)

    expect(mock.execute).toHaveBeenCalledTimes(4)
    expect(mock.execute.mock.calls[0]).toEqual(mock.execute.mock.calls[2])
    expect(mock.execute.mock.calls[1]).toEqual(mock.execute.mock.calls[3])
    for (const call of mock.execute.mock.calls)
      expect(call[2]).toMatchObject({ prepare: true, isIdempotent: true })
  })
})
