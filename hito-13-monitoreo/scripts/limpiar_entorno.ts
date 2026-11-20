import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))
const HITO13_ROOT = resolve(CURRENT_DIR, '..')

export async function stopMonitoringStack(): Promise<void> {
  await execFileAsync(
    'docker',
    ['compose', '-f', resolve(HITO13_ROOT, 'docker-compose.yml'), 'down'],
    { cwd: HITO13_ROOT, timeout: 60_000 },
  )
}

async function runCli(): Promise<void> {
  console.log(
    '[Hito 13] Deteniendo contenedores de monitoreo sin eliminar volúmenes de bases de datos (RNF11)...',
  )
  await stopMonitoringStack()
  console.log('[Hito 13] Contenedores de monitoreo detenidos correctamente.')
}

const currentFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (
  dirname(currentFile) === dirname(entryFile) &&
  entryFile.endsWith('limpiar_entorno.ts')
) {
  runCli().catch((err) => {
    console.error('[Hito 13] Error al limpiar entorno de monitoreo:', err)
    process.exit(1)
  })
}
