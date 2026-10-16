import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readDataEnvironment } from '../../src/config/data-environment.js'
import type { Comment } from '../../src/modules/data/domain/ports.js'
import {
  CassandraCommentRepository,
  compareCqlUuid,
} from '../../src/modules/data/infrastructure/cassandra-comment.repository.js'
import { commentGroup } from '../../src/modules/data/application/data.service.js'

const mock = vi.hoisted(() => ({
  execute: vi.fn(),
  write: vi.fn(),
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

function comment(): Comment {
  return {
    matchId: 'F2030-TEST',
    createdAt: '2030-06-13T20:01:15.000Z',
    id: randomUUID(),
    userId: randomUUID(),
    username: 'fixture-user',
    content: 'Comentario repetible',
    state: 'visible',
    likes: 0,
    replies: 0,
  }
}

function row(value: Comment) {
  return {
    partido_id: value.matchId,
    creado_en: new Date(value.createdAt),
    comentario_id: value.id,
    usuario_id: value.userId,
    usuario_nombre: value.username,
    contenido: value.content,
    estado: value.state,
    likes: value.likes,
    respuestas: value.replies,
  }
}

const applied = () => ({ wasApplied: () => true, rows: [] })
const existing = (value: Comment) => ({
  wasApplied: () => false,
  rows: [row(value)],
})

describe('Escritura de las dos vistas Cassandra', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mock.execute.mockImplementation(
      async (query: string, parameters: unknown[], options: unknown) =>
        query.includes('IF NOT EXISTS')
          ? mock.write(query, parameters, options)
          : { rows: [] },
    )
  })

  it('un reintento con las mismas claves repara la segunda vista sin cambiar la primera', async () => {
    const repository = new CassandraCommentRepository(readDataEnvironment({}))
    const input = comment()
    mock.write
      .mockResolvedValueOnce(applied())
      .mockRejectedValueOnce(new Error('segunda vista inaccesible'))
      .mockResolvedValueOnce(existing(input))
      .mockResolvedValueOnce(applied())

    await expect(repository.create(input, context)).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    })
    await repository.create(input, context)

    expect(mock.write).toHaveBeenCalledTimes(4)
    expect(mock.write.mock.calls[0]).toEqual(mock.write.mock.calls[2])
    expect(mock.write.mock.calls[1]).toEqual(mock.write.mock.calls[3])
    for (const call of mock.write.mock.calls) {
      expect(call[2]).toMatchObject({ prepare: true, isIdempotent: true })
      expect(call[0]).toContain('IF NOT EXISTS')
    }
  })

  it.each(['userId', 'content', 'username'] as const)(
    'rechaza la colisión de %s sin tocar la vista por usuario',
    async (field) => {
      const input = comment()
      mock.write.mockResolvedValue(existing(input))
      const repository = new CassandraCommentRepository(readDataEnvironment({}))
      await expect(
        repository.create(
          {
            ...input,
            [field]: field === 'userId' ? randomUUID() : 'otro-valor',
          },
          context,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(mock.write).toHaveBeenCalledTimes(1)
    },
  )

  it('repara una vista faltante con el estado y los contadores guardados, sin reiniciarlos', async () => {
    const input = comment()
    mock.write
      .mockResolvedValueOnce(
        existing({ ...input, likes: 7, replies: 2, state: 'oculto' }),
      )
      .mockResolvedValueOnce(applied())
    const repository = new CassandraCommentRepository(readDataEnvironment({}))
    await repository.create(input, context)
    expect(mock.write.mock.calls[1]?.[1].slice(-3)).toEqual(['oculto', 7, 2])
  })

  it('conserva la reserva cuando el UUID llega en mayúsculas', async () => {
    const input = comment()
    expect(commentGroup(input.id.toUpperCase())).toBe(commentGroup(input.id))
    mock.write
      .mockResolvedValueOnce(existing(input))
      .mockResolvedValueOnce(existing(input))
    const repository = new CassandraCommentRepository(readDataEnvironment({}))
    await repository.create({ ...input, id: input.id.toUpperCase() }, context)
    expect(mock.write).toHaveBeenCalledTimes(2)
  })

  it('no sobrescribe una vista por usuario que pertenece a otro partido', async () => {
    const input = comment()
    mock.write
      .mockResolvedValueOnce(existing(input))
      .mockResolvedValueOnce(existing({ ...input, matchId: 'F2030-OTRO' }))
    const repository = new CassandraCommentRepository(readDataEnvironment({}))
    await expect(repository.create(input, context)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('pagina los empates de timestamp sin duplicar o saltar IDs entre grupos', async () => {
    const input = comment()
    const values = [1, 2, 3, 4].map((n) => ({
      ...input,
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      createdAt: n === 4 ? '2030-06-13T20:01:14.000Z' : input.createdAt,
    }))
    mock.execute.mockImplementation(
      async (query: string, parameters: unknown[]) => {
        const group = parameters[2]
        const maximum = parameters.at(-1) as number
        const selected = values.filter((value) => {
          if (commentGroup(value.id) !== group) return false
          if (query.includes('comentario_id >'))
            return (
              Date.parse(value.createdAt) === Number(parameters[3]) &&
              value.id > String(parameters[4])
            )
          if (query.includes('creado_en <'))
            return Date.parse(value.createdAt) < Number(parameters[3])
          return true
        })
        return { rows: selected.slice(0, maximum).map(row) }
      },
    )
    const repository = new CassandraCommentRepository(readDataEnvironment({}))
    const first = await repository.list(
      input.matchId,
      new Date(input.createdAt),
      2,
      undefined,
      context,
    )
    const last = first.at(-1)!
    const second = await repository.list(
      input.matchId,
      new Date(input.createdAt),
      2,
      { createdAt: last.createdAt, id: last.id },
      context,
    )
    expect([...first, ...second].map((value) => value.id)).toEqual(
      values.map((value) => value.id),
    )
  })

  it('ordena UUID como Cassandra: versión y timestamp v1 antes de bytes', () => {
    expect(
      compareCqlUuid(
        'ffffffff-ffff-0000-0000-ffffffffffff',
        '00000000-0000-4000-8000-000000000001',
      ),
    ).toBeLessThan(0)
    expect(
      compareCqlUuid(
        'a0000000-0000-1000-8000-000000000001',
        '00000000-0001-1000-8000-000000000001',
      ),
    ).toBeLessThan(0)
    expect(
      compareCqlUuid(
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ),
    ).toBeLessThan(0)
  })

  it('conserva el grupo UUID módulo 16 de la carga del Hito 6', () => {
    expect(commentGroup('00000000-0000-0000-0000-000000000001')).toBe(1)
    expect(commentGroup('00000000-0000-0000-0000-000000000002')).toBe(2)
    expect(commentGroup('00000000-0000-4000-8000-00000000000F')).toBe(15)
  })

  it('repara la vista de una clave histórica en otro grupo sin crear otra fila por partido', async () => {
    const input = comment()
    const oldGroup = (commentGroup(input.id) + 1) % 16
    mock.execute.mockImplementation(
      async (query: string, parameters: unknown[], options: unknown) => {
        if (query.includes('IF NOT EXISTS'))
          return mock.write(query, parameters, options)
        return { rows: parameters[2] === oldGroup ? [row(input)] : [] }
      },
    )
    mock.write.mockResolvedValue(applied())
    const repository = new CassandraCommentRepository(readDataEnvironment({}))
    await repository.create(input, context)
    expect(mock.write).toHaveBeenCalledTimes(1)
    expect(mock.write.mock.calls[0]?.[0]).toContain('comentarios_por_usuario')
  })
})
