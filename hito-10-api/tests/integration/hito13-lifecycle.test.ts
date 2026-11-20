import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type Socket } from 'node:net'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

async function freePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Puerto no disponible')
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}

async function runLifecycle(redisPort?: number) {
  const child = spawn(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      '--import',
      'tsx',
      fileURLToPath(
        new URL('../fixtures/hito13-lifecycle.ts', import.meta.url),
      ),
      ...(redisPort ? ['degraded'] : []),
    ],
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env: {
        ...process.env,
        H13_TEST_PORT: String(await freePort()),
        DEPENDENCY_TIMEOUT_MS: '400',
        ...(redisPort ? { REDIS_PORT: String(redisPort) } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  let timedOut = false
  child.stdout.on('data', (data: Buffer) => {
    output += data.toString()
  })
  child.stderr.on('data', (data: Buffer) => {
    output += data.toString()
  })
  const watchdog = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, 10000)
  try {
    const [code] = await once(child, 'exit')
    expect(
      { timedOut, code, closed: output.includes('H13_CLOSED_NATURALLY') },
      output,
    ).toEqual({ timedOut: false, code: 0, closed: true })
  } finally {
    clearTimeout(watchdog)
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
  }
}

it('H13: sondas concurrentes y cierre repetido no reabren Redis ni mantienen vivo el proceso', async () => {
  await runLifecycle()
})

it('H13: inicia degradado y termina naturalmente si Redis rechaza la conexión', async () => {
  await runLifecycle(await freePort())
})

// Solo Redis se sustituye por un peer TCP que no responde al handshake.
// MongoDB y Neo4j son reales; este caso no certifica recuperación de motores.
it('H13: cancela también un handshake Redis bloqueado y cierra sus sockets', async () => {
  const sockets = new Set<Socket>()
  const peer = createServer((socket) => {
    socket.resume()
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  peer.listen(0, '127.0.0.1')
  await once(peer, 'listening')
  try {
    const address = peer.address()
    if (!address || typeof address === 'string')
      throw new Error('Puerto no disponible')
    await runLifecycle(address.port)
    await expect.poll(() => sockets.size, { timeout: 1000 }).toBe(0)
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve, reject) =>
      peer.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
