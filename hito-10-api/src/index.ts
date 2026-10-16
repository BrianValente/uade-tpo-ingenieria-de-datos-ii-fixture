import { buildServer } from './app/server.js'
import { readEnvironment } from './config/environment.js'
import { readAuthEnvironment } from './config/auth-environment.js'
import { createAuthModule } from './modules/auth/auth.module.js'

const config = readEnvironment()
const app = await buildServer(
  config,
  undefined,
  createAuthModule(readAuthEnvironment()),
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      app.log.error('No se pudo completar el cierre de la API.')
      process.exitCode = 1
    })
  })
}

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT })
} catch {
  app.log.error(
    'No se pudo iniciar la API. Revisar el host y el puerto configurados.',
  )
  await app.close()
  process.exitCode = 1
}
