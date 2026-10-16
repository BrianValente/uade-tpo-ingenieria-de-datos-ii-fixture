import neo4j from 'neo4j-driver'
import { beforeEach, expect, it, vi } from 'vitest'

import { readDataEnvironment } from '../../src/config/data-environment.js'
import { Neo4jGraphRepository } from '../../src/modules/data/infrastructure/neo4j-graph.repository.js'

const mock = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  close: vi.fn(async () => {}),
}))
vi.mock('neo4j-driver', async (original) => {
  const actual = await original<typeof import('neo4j-driver')>()
  return {
    ...actual,
    default: { ...actual.default, driver: vi.fn(() => mock) },
  }
})
const context = { log: { info: vi.fn() } }
beforeEach(() => {
  vi.clearAllMocks()
  mock.executeQuery.mockResolvedValue({ records: [] })
})

it('limita conexión, adquisición del pool y ambas transacciones de lectura', async () => {
  const repository = new Neo4jGraphRepository(
    readDataEnvironment({ DEPENDENCY_TIMEOUT_MS: '300' }),
  )
  expect(vi.mocked(neo4j.driver).mock.calls[0]?.[2]).toMatchObject({
    connectionTimeout: 300,
    connectionAcquisitionTimeout: 300,
    maxTransactionRetryTime: 0,
  })
  await repository.findMatch('F2030-001', context)
  await repository.listEvents('F2030-001', 10, context)
  for (const call of mock.executeQuery.mock.calls)
    expect(call[2]).toEqual({
      routing: 'READ',
      transactionConfig: { timeout: 300 },
    })
  await repository.close()
})

it('traduce el rechazo de la consulta sin devolver éxito vacío ni repetirla', async () => {
  const repository = new Neo4jGraphRepository(readDataEnvironment({}))
  mock.executeQuery.mockRejectedValueOnce(new Error('Transaction timed out'))
  await expect(
    repository.findMatch('F2030-001', context),
  ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' })
  expect(mock.executeQuery).toHaveBeenCalledTimes(1)
  await repository.close()
})
