import { beforeEach, expect, it, vi } from 'vitest'

import { readDataEnvironment } from '../../src/config/data-environment.js'
import { readEnvironment } from '../../src/config/environment.js'

const mock = {
  unavailable: false,
  imports: vi.fn(),
  createConnection: vi.fn(),
  close: vi.fn(),
  reference: vi.fn(),
}
const context = { log: { info: vi.fn() } }

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mock.unavailable = false
  vi.doMock('@intersystems/intersystems-iris-native', () => {
    mock.imports()
    if (mock.unavailable) throw new Error('Addon IRIS no disponible')
    return {
      createConnection: mock.createConnection,
      IRISReference: class {
        static Type = { STRING: 0 }
        constructor(value: string, type: number) {
          mock.reference(value, type)
        }
        getString() {
          return ''
        }
      },
    }
  })
})

it('sirve health sin cargar el addon IRIS no disponible', async () => {
  mock.unavailable = true
  const { buildServer } = await import('../../src/app/server.js')
  const app = await buildServer(readEnvironment({ API_LOG_LEVEL: 'silent' }))
  try {
    const response = await app.inject('/health')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'fixture2030-api',
    })
    expect(mock.imports).not.toHaveBeenCalled()
  } finally {
    await app.close()
  }
})

it('traduce un addon no disponible solo al ejecutar la operación IRIS', async () => {
  mock.unavailable = true
  const { IrisObjectRepository } =
    await import('../../src/modules/data/infrastructure/iris-object.repository.js')
  const repository = new IrisObjectRepository(readDataEnvironment({}))
  expect(mock.imports).not.toHaveBeenCalled()
  await expect(
    repository.find('F2030-IRIS-0011', context),
  ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' })
  expect(mock.imports).toHaveBeenCalledTimes(1)
  expect(mock.createConnection).not.toHaveBeenCalled()
  expect(context.log.info).toHaveBeenCalledWith(
    expect.objectContaining({ dependency: 'IRIS', result: 'failure' }),
    'Operación de dependencia',
  )
})

it('usa la conexión y las referencias del addon disponible y cierra la conexión', async () => {
  const person = {
    getString: () => 'Persona de laboratorio',
    invokeObject: () => null,
  }
  const match = {
    getObject: () => person,
    getString: (name: string) => (name === 'Codigo' ? 'F2030-IRIS-0011' : ''),
    invokeString: () => 'programado',
    invokeObject: () => null,
  }
  const rows = {
    invokeObject: () => null,
    invokeBoolean: () => true,
    invokeString: () => '1',
  }
  const statement = { invoke: () => 1, invokeObject: () => rows }
  mock.createConnection.mockReturnValue({
    createIris: () => ({
      classMethodObject: (name: string) =>
        name === '%SQL.Statement' ? statement : match,
      classMethodBoolean: () => false,
    }),
    close: mock.close,
  })
  const { IrisObjectRepository } =
    await import('../../src/modules/data/infrastructure/iris-object.repository.js')
  const repository = new IrisObjectRepository(readDataEnvironment({}))
  await expect(
    repository.find('F2030-IRIS-0011', context),
  ).resolves.toMatchObject({
    code: 'F2030-IRIS-0011',
    state: 'programado',
    events: [],
  })
  expect(mock.imports).toHaveBeenCalledTimes(1)
  expect(mock.createConnection).toHaveBeenCalledTimes(1)
  expect(mock.reference).toHaveBeenCalledWith('', 0)
  expect(mock.close).toHaveBeenCalledTimes(1)
})
