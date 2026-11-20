import { strict as assert } from 'node:assert'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  readAuthEnvironment,
  readSeedPasswords,
} from '../../hito-10-api/src/config/auth-environment.js'
import { collectEnvironmentMetadata } from '../../hito-12-carga-optimizacion/scripts/entorno_y_recursos.js'
import { loadRedis } from './driver_loader.js'
import { sanitizeSecrets } from './sanitizer.js'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

async function docker(...args: string[]) {
  return (
    await exec('docker', args, {
      cwd: root,
      timeout: 25000,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim()
}

async function redisSnapshot(sessionKey?: string) {
  const config = readAuthEnvironment()
  const createClient = await loadRedis()
  const client = createClient({
    socket: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      connectTimeout: 1000,
      reconnectStrategy: false,
    },
    database: config.REDIS_DATABASE,
    ...(config.REDIS_USERNAME ? { username: config.REDIS_USERNAME } : {}),
    ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {}),
    disableOfflineQueue: true,
    commandOptions: { timeout: 1000 },
  })
  client.on('error', () => {})
  const timeout = setTimeout(() => {
    if (client.isOpen) client.destroy()
  }, 1500)
  try {
    await client.connect()
    const pong: string = await client.ping()
    const fields = sessionKey
      ? ((await client.hGetAll(sessionKey)) as Record<string, string>)
      : {}
    const identity = [
      'sesion_id',
      'usuario_id',
      'username',
      'rol',
      'estado_acceso',
      'creada_en',
    ].map((key) => [key, fields[key]])
    return {
      up: pong === 'PONG',
      detail: pong,
      sessionIdentitySha256: sha256(JSON.stringify(identity)),
      sessionTtlSeconds: sessionKey ? Number(await client.ttl(sessionKey)) : -2,
    }
  } catch (error) {
    return {
      up: false,
      detail: sanitizeSecrets(
        error instanceof Error ? error.message : String(error),
      ),
      sessionIdentitySha256: '',
      sessionTtlSeconds: -2,
    }
  } finally {
    clearTimeout(timeout)
    if (client.isOpen) client.destroy()
  }
}

export async function runRealRedisRecovery(options: {
  allowStop: 'redis'
  baseUrl?: string
  output?: string
}) {
  assert.equal(
    options.allowStop,
    'redis',
    'El stop real requiere autorización explícita para Redis',
  )
  const baseUrl =
    options.baseUrl ??
    process.env.API_BASE_URL ??
    `http://127.0.0.1:${process.env.API_PORT ?? 8000}`
  const containerId = await docker(
    'compose',
    'ps',
    '--status',
    'running',
    '-q',
    'redis',
  )
  assert.match(
    containerId,
    /^[a-f0-9]{12,64}$/,
    'Se requiere un único Redis activo del Compose local',
  )
  const inspect = async () => {
    const [container] = JSON.parse(
      await docker('inspect', containerId),
    ) as Array<{
      Id: string
      Config: { Labels: Record<string, string> }
      Mounts: Array<{
        Type: string
        Name?: string
        Source: string
        Destination: string
      }>
    }>
    assert.ok(container)
    assert.equal(container.Config.Labels['com.docker.compose.service'], 'redis')
    assert.ok(
      container.Config.Labels['com.docker.compose.project.config_files']
        ?.split(',')
        .includes(resolve(root, 'compose.yaml')),
      'Redis debe pertenecer a este checkout',
    )
    return {
      containerId: container.Id,
      mounts: container.Mounts.map(({ Type, Name, Source, Destination }) => ({
        Type,
        Name,
        Source,
        Destination,
      })).sort((a, b) => a.Destination.localeCompare(b.Destination)),
    }
  }
  const environment = collectEnvironmentMetadata()
  const persistenceBefore = await inspect()
  assert.ok(
    persistenceBefore.mounts.some((mount) => mount.Destination === '/data'),
    'Se requiere persistencia de Redis en /data',
  )
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      username: process.env.API_SEED_ADMIN_USERNAME ?? 'fixture-admin',
      password: readSeedPasswords().API_SEED_ADMIN_PASSWORD,
    }),
  })
  assert.equal(
    login.status,
    200,
    'Login real requerido antes de interrumpir Redis',
  )
  const { accessToken } = (await login.json()) as { accessToken: string }
  assert.match(accessToken, /^[A-Za-z0-9_-]{43}$/)
  const sessionKey = `fixture2030:h10:${readAuthEnvironment().API_REDIS_SCOPE}:sesion:${sha256(accessToken)}`
  const read = async () => {
    const response = await fetch(`${baseUrl}/equipos/ARG`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    })
    const body = await response.text()
    return {
      timestamp: new Date().toISOString(),
      statusHttp: response.status,
      requestId: response.headers.get('x-request-id'),
      bodySha256: sha256(body),
      body: JSON.parse(sanitizeSecrets(body)) as unknown,
    }
  }
  const before = { api: await read(), redis: await redisSnapshot(sessionKey) }
  assert.equal(before.api.statusHttp, 200)
  assert.equal(before.redis.up, true)
  assert.ok(before.redis.sessionTtlSeconds > 0)
  let stopped = false
  let during: typeof before
  let after: typeof before
  try {
    stopped = true
    await docker('compose', 'stop', '-t', '10', 'redis')
    during = { api: await read(), redis: await redisSnapshot() }
    await docker('compose', 'start', 'redis')
    const deadline = Date.now() + 20000
    while (!(await redisSnapshot()).up && Date.now() < deadline)
      await delay(250)
    assert.equal(
      (await redisSnapshot()).up,
      true,
      'Redis no recuperó PONG dentro del plazo',
    )
    stopped = false
    after = { api: await read(), redis: await redisSnapshot(sessionKey) }
  } finally {
    if (stopped) await docker('compose', 'start', 'redis')
  }
  const persistenceAfter = await inspect()
  const checks = {
    initialRead: before.api.statusHttp === 200,
    realOutage: during.api.statusHttp === 503 && !during.redis.up,
    recoveredRead: after.api.statusHttp === 200 && after.redis.up,
    samePersistedEntity: before.api.bodySha256 === after.api.bodySha256,
    sameSession:
      before.redis.sessionIdentitySha256 ===
        after.redis.sessionIdentitySha256 && after.redis.sessionTtlSeconds > 0,
    sameContainerAndVolumes:
      JSON.stringify(persistenceBefore) === JSON.stringify(persistenceAfter),
  }
  const report = {
    reportType: 'HITO_11_REAL_REDIS_RECOVERY',
    environment,
    mechanism:
      'docker compose stop/start redis; API persistente y mismo token real; sin dobles, reinicio de API ni borrado de datos/volúmenes',
    before,
    during,
    after,
    persistenceBefore,
    persistenceAfter,
    checks,
    verificationPassed: Object.values(checks).every(Boolean),
  }
  const output = resolve(
    options.output ??
      resolve(
        root,
        'hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion_real.json',
      ),
  )
  await mkdir(dirname(output), { recursive: true })
  await writeFile(
    output,
    sanitizeSecrets(JSON.stringify(report, null, 2)) + '\n',
  )
  await writeFile(
    output.replace(/\.json$/, '') + '.md',
    [
      '# Caída y recuperación de Redis real — Hito 11',
      '',
      `Fecha UTC: ${environment.timestamp}. Código: \`${environment.gitCommit}\` (${environment.gitTreeState}).`,
      report.mechanism,
      '',
      '| Fase | HTTP GET /equipos/ARG | PING nativo | Request ID |',
      '| :--- | ---: | :--- | :--- |',
      ...[before, during, after].map(
        (stage, index) =>
          `| ${['Antes', 'Durante', 'Después'][index]} | ${stage.api.statusHttp} | ${stage.redis.up ? 'PONG' : 'DOWN'} | ${stage.api.requestId} |`,
      ),
      '',
      ...Object.entries(checks).map(
        ([name, passed]) => `- ${name}: **${passed ? 'PASS' : 'FAIL'}**.`,
      ),
      '',
      'El JSON adjunto conserva cuerpos sanitizados, identidad de sesión resumida mediante SHA-256, TTL y mounts antes/después. La evidencia solo demuestra el ciclo de esta dependencia en este laboratorio; no un failover de clúster ni una garantía de pérdida cero ante cualquier falla.',
      ...(environment.executionNotes ? ['', environment.executionNotes] : []),
      '',
    ].join('\n'),
  )
  assert.ok(
    report.verificationPassed,
    'El ciclo real no pasó todos los controles; ver evidencia generada',
  )
  return report
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!process.argv.includes('--allow-stop=redis'))
    throw new Error(
      'Requiere --allow-stop=redis: detiene temporalmente el Redis del Compose de este checkout',
    )
  runRealRedisRecovery({ allowStop: 'redis' })
    .then(() =>
      console.log(
        'Ciclo real Redis verificado; contenedor, datos y sesión conservados.',
      ),
    )
    .catch((error: unknown) => {
      console.error(
        sanitizeSecrets(error instanceof Error ? error.message : String(error)),
      )
      process.exitCode = 1
    })
}
