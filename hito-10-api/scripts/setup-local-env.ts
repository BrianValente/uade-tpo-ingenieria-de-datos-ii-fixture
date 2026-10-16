import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

import { createLocalEnvironment } from '../src/config/local-environment.js'

const destination = new URL('../.env', import.meta.url)
const rootEnvironment = new URL('../../.env', import.meta.url)
if (existsSync(destination)) {
  console.info('El .env local ya existe. Se conserva sin cambios.')
} else if (!existsSync(rootEnvironment)) {
  console.error(
    'Falta el .env de Compose en la raíz del repositorio. Crearlo desde .env.example y configurar sus credenciales antes de ejecutar pnpm env:local. No se creó ni modificó ningún archivo.',
  )
  process.exitCode = 1
} else {
  try {
    const example = await readFile(
      new URL('../.env.example', import.meta.url),
      'utf8',
    )
    const root = await readFile(rootEnvironment, 'utf8')
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
