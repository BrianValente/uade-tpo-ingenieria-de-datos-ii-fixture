import { once } from 'node:events'
import { createServer, type Socket } from 'node:net'
import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'

import { readAuthEnvironment } from '../../src/config/auth-environment.js'
import { MongoAccountRepository } from '../../src/modules/auth/infrastructure/mongo-account.repository.js'
import { RedisSessionRepository } from '../../src/modules/auth/infrastructure/redis-session.repository.js'

async function withUnresponsiveServer(run: (port: number) => Promise<void>) {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Puerto de prueba no disponible.')
    await run(address.port)
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
}

// El servidor TCP acepta conexiones pero no implementa MongoDB ni Redis.
// Es una simulación de red sin respuesta, con los drivers reales.
it('MongoDB limita la espera de un servidor que no completa el protocolo', async () => {
  await withUnresponsiveServer(async (port) => {
    const repository = new MongoAccountRepository(
      readAuthEnvironment({
        MONGO_PORT: String(port),
        DEPENDENCY_TIMEOUT_MS: '100',
      }),
    )
    try {
      const started = performance.now()
      await expect(
        repository.findByUsername('fixture-user', { log: { info() {} } }),
      ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' })
      expect(performance.now() - started).toBeLessThan(2000)
    } finally {
      await repository.close()
    }
  })
})

it('Redis limita también la espera después de abrir el socket', async () => {
  await withUnresponsiveServer(async (port) => {
    const repository = new RedisSessionRepository(
      readAuthEnvironment({
        REDIS_PORT: String(port),
        DEPENDENCY_TIMEOUT_MS: '100',
      }),
    )
    try {
      const started = performance.now()
      await expect(
        repository.read('digest', { log: { info() {} } }),
      ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' })
      expect(performance.now() - started).toBeLessThan(2000)
    } finally {
      await repository.close()
    }
  })
})
