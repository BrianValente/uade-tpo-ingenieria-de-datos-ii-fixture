import { Writable } from 'node:stream'
import { expect, it } from 'vitest'

import { buildServer } from '../../src/app/server.js'
import { readEnvironment } from '../../src/config/environment.js'

it('correlaciona logs sin incluir URL, credenciales, cuerpo o excepción sin filtrar', async () => {
  const lines: string[] = []
  const destination = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk))
      done()
    },
  })
  const app = await buildServer(
    readEnvironment({ API_LOG_LEVEL: 'info' }),
    destination,
  )
  try {
    app.post('/fixture/:codigo', async () => {
      throw new Error('mongodb://admin:password-driver@host/interna')
    })
    const response = await app.inject({
      method: 'POST',
      url: '/fixture/ARG?token=token-query',
      headers: {
        authorization: 'Bearer token-header',
        cookie: 'sid=token-cookie',
      },
      payload: { password: 'password-body' },
    })
    expect(response.statusCode).toBe(500)
    const output = lines.join('')
    for (const secret of [
      'password-driver',
      'token-query',
      'token-header',
      'token-cookie',
      'password-body',
    ]) {
      expect(output).not.toContain(secret)
    }
    const records = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const completed = records.find(
      (record) => record.msg === 'Solicitud finalizada',
    )
    expect(completed).toMatchObject({
      reqId: response.headers['x-request-id'],
      method: 'POST',
      route: '/fixture/:codigo',
      statusCode: 500,
    })
    expect(completed.durationMs).toBeGreaterThanOrEqual(0)
  } finally {
    await app.close()
    destination.end()
  }
})
