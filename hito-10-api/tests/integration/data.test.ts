import { expect, it } from 'vitest'

import { buildServer } from '../../src/app/server.js'
import {
  readAuthEnvironment,
  readSeedPasswords,
} from '../../src/config/auth-environment.js'
import { readDataEnvironment } from '../../src/config/data-environment.js'
import { readEnvironment } from '../../src/config/environment.js'
import { createAuthModule } from '../../src/modules/auth/auth.module.js'
import { createDataModule } from '../../src/modules/data/data.module.js'

it('consulta los seis motores reales sin escribir datos de negocio', async () => {
  const auth = createAuthModule(readAuthEnvironment())
  const data = createDataModule(readDataEnvironment())
  const app = await buildServer(
    readEnvironment({ API_LOG_LEVEL: 'silent' }),
    undefined,
    auth,
    data,
  )
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'fixture-admin',
        password: readSeedPasswords().API_SEED_ADMIN_PASSWORD,
      },
    })
    expect(login.statusCode).toBe(200)
    const headers = { authorization: `Bearer ${login.json().accessToken}` }
    const cases = [
      '/equipos/ARG',
      '/equipos/ARG/jugadores?page=1&limit=5',
      '/partidos/F2030-001',
      '/partidos/F2030-001/eventos?limit=5',
      '/partidos/F2030-001/comentarios?minute=2030-06-13T20:00:00.000Z&limit=5',
      '/partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T20:01:00.000Z',
      '/partidos/F2030-IRIS-0011/detalle',
    ]
    for (const url of cases) {
      const response = await app.inject({ url, headers })
      expect(response.statusCode, `${url}: ${response.body}`).toBe(200)
    }

    const first = await app.inject({
      url: '/partidos/F2030-DEMO/comentarios?minute=2030-06-13T20:01:00.000Z&limit=1',
      headers,
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().items).toHaveLength(1)
    expect(first.json().nextCursor).toBeTypeOf('string')
    const second = await app.inject({
      url: `/partidos/F2030-DEMO/comentarios?minute=2030-06-13T20:01:00.000Z&limit=1&cursor=${first.json().nextCursor}`,
      headers,
    })
    expect(second.statusCode, second.body).toBe(200)
    expect(second.json().items).toHaveLength(1)
    expect(second.json().items[0].id).not.toBe(first.json().items[0].id)
  } finally {
    await app.close()
  }
})
