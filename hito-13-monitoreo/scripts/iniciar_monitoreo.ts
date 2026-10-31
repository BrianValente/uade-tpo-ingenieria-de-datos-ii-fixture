import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { loadLocalEnvironment } from '../../hito-12-carga-optimizacion/scripts/entorno_y_recursos.js'

const execFileAsync = promisify(execFile)

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))
const HITO13_ROOT = resolve(CURRENT_DIR, '..')
const REPO_ROOT = resolve(HITO13_ROOT, '..')

export async function waitForHttpOk(
  url: string,
  timeoutMs = 30_000,
): Promise<{ ok: boolean; status: number; bodySnippet: string }> {
  const deadline = Date.now() + timeoutMs
  let lastStatus = 0
  let lastBody = ''

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
      lastStatus = res.status
      lastBody = (await res.text()).slice(0, 200)
      if (res.ok) {
        return { ok: true, status: res.status, bodySnippet: lastBody }
      }
    } catch (err) {
      lastBody = err instanceof Error ? err.message : 'fetch error'
    }
    await new Promise((r) => setTimeout(r, 1000))
  }

  return { ok: false, status: lastStatus, bodySnippet: lastBody }
}

export async function startMonitoringStack(): Promise<{
  prometheusHealthy: boolean
  redisExporterHealthy: boolean
  grafanaHealthy: boolean
}> {
  const localEnv = await loadLocalEnvironment()
  const mergedEnv: NodeJS.ProcessEnv = { ...process.env, ...localEnv }

  // 1. Asegurar contenedores activos del flujo integrado (MongoDB, Neo4j, Redis)
  await execFileAsync(
    'docker',
    ['compose', 'up', '-d', '--quiet-pull', 'mongodb', 'neo4j', 'redis'],
    { cwd: REPO_ROOT, env: mergedEnv, timeout: 60_000, maxBuffer: 32 * 1024 * 1024 },
  )

  // 2. Levantar stack de monitoreo del Hito 13 (Prometheus, Redis Exporter, Grafana)
  await execFileAsync(
    'docker',
    [
      'compose',
      '-f',
      resolve(HITO13_ROOT, 'docker-compose.yml'),
      'up',
      '-d',
      '--quiet-pull',
    ],
    { cwd: HITO13_ROOT, env: mergedEnv, timeout: 180_000, maxBuffer: 32 * 1024 * 1024 },
  )

  const [prom, redisExp, graf] = await Promise.all([
    waitForHttpOk('http://127.0.0.1:9090/-/healthy', 35_000),
    waitForHttpOk('http://127.0.0.1:9121/metrics', 35_000),
    waitForHttpOk('http://127.0.0.1:3000/api/health', 45_000),
  ])

  if (!prom.ok || !redisExp.ok || !graf.ok) {
    throw new Error(
      `Stack de monitoreo incompleto: prometheus=${prom.ok} (${prom.status}), redis-exporter=${redisExp.ok} (${redisExp.status}), grafana=${graf.ok} (${graf.status})`,
    )
  }

  // Recargar configuración de Prometheus por si el contenedor ya estaba corriendo
  await fetch('http://127.0.0.1:9090/-/reload', {
    method: 'POST',
    signal: AbortSignal.timeout(4000),
  }).catch(() => undefined)

  return {
    prometheusHealthy: prom.ok,
    redisExporterHealthy: redisExp.ok,
    grafanaHealthy: graf.ok,
  }
}

async function runCli(): Promise<void> {
  console.log('[Hito 13] Iniciando stack de monitoreo (Prometheus + Redis Exporter + Grafana)...')
  const status = await startMonitoringStack()
  console.log('[Hito 13] Stack operativo:', JSON.stringify(status))
}

const currentFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (
  dirname(currentFile) === dirname(entryFile) &&
  entryFile.endsWith('iniciar_monitoreo.ts')
) {
  runCli().catch((err) => {
    console.error('[Hito 13] Error al iniciar monitoreo:', err)
    process.exit(1)
  })
}
