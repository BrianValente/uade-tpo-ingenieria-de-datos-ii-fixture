import { readFile, writeFile } from 'node:fs/promises'

import { buildServer } from '../src/app/server.js'
import { readEnvironment } from '../src/config/environment.js'

// El contrato no depende de secretos ni de la configuración de una notebook.
const app = await buildServer(readEnvironment({ API_LOG_LEVEL: 'silent' }))
try {
  await app.ready()
  const yaml = app.swagger({ yaml: true })
  const destination = new URL('../openapi/openapi.yaml', import.meta.url)
  if (process.argv.includes('--check')) {
    const current = await readFile(destination, 'utf8')
    if (current !== yaml) {
      throw new Error('OpenAPI desactualizado. Ejecutar pnpm openapi:export.')
    }
  } else {
    await writeFile(destination, yaml, 'utf8')
  }
} finally {
  await app.close()
}
