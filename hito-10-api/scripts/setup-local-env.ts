import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

import { createLocalEnvironment } from '../src/config/local-environment.js'

const destination = new URL('../.env', import.meta.url)
if (existsSync(destination)) {
  console.info('El .env local ya existe. Se conserva sin cambios.')
} else {
  try {
    const example = await readFile(
      new URL('../.env.example', import.meta.url),
      'utf8',
    )
    const root = await readFile(new URL('../../.env', import.meta.url), 'utf8')
    const content = createLocalEnvironment(example, root)
    await writeFile(destination, content, { flag: 'wx', mode: 0o600 })
    console.info(
      'Configuración local creada con permisos 0600. Las contraseñas de seed se guardaron solo en el archivo ignorado por Git.',
    )
  } catch {
    console.error(
      'No se pudo crear la configuración local. Revisar el .env raíz o configurar el .env de la API manualmente. No se sobrescriben archivos existentes.',
    )
    process.exitCode = 1
  }
}
