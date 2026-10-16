import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

import {
  readAuthEnvironment,
  readSeedPasswords,
} from '../src/config/auth-environment.js'
import { readDataEnvironment } from '../src/config/data-environment.js'
import { seedUsers } from '../src/modules/auth/application/seed-users.js'
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js'
import { MongoAccountRepository } from '../src/modules/auth/infrastructure/mongo-account.repository.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = fileURLToPath(new URL('../', import.meta.url))
const compose = [
  'compose',
  '--file',
  `${root}compose.yaml`,
  '--project-name',
  'fixture2030',
]
const environment = { ...process.env }
let temporary: { name: string; marker: string } | undefined

function adminCommand(command: string, marker: string) {
  const result = spawnSync(
    'docker',
    [...compose, 'exec', '-T', 'iris', 'iris', 'session', 'IRIS', '-U', '%SYS'],
    {
      cwd: root,
      input: command + '\nhalt\n',
      encoding: 'utf8',
      timeout: 15000,
    },
  )
  // El terminal puede incluir datos de entrada. No imprimir stdout/stderr ni errores crudos.
  const confirmed = result.stdout
    ?.split(/\r?\n/)
    .some((line) => line.trim().replace(/^%SYS>\s*/, '') === marker)
  if (result.status !== 0 || !confirmed)
    throw new Error('No se pudo preparar o cerrar el acceso temporal de IRIS.')
}

async function prepareEnvironment() {
  const inherited = parseEnv(
    await readFile(new URL('../../.env', import.meta.url), 'utf8'),
  )
  for (const key of [
    'MONGO_ROOT_USERNAME',
    'MONGO_ROOT_PASSWORD',
    'MONGO_DATABASE',
    'MONGO_PORT',
    'REDIS_PORT',
    'NEO4J_PASSWORD',
  ]) {
    if (!environment[key] && inherited[key]) environment[key] = inherited[key]
  }
  if (!environment.INFLUXDB_TOKEN) {
    try {
      environment.INFLUXDB_TOKEN = (
        await readFile(
          new URL('../../influxdb/.local/admin-token', import.meta.url),
          'utf8',
        )
      ).trim()
    } catch {
      /* La consulta de InfluxDB informará la falta de autorización si se ejecuta. */
    }
  }
  const auth = readAuthEnvironment(environment)
  const passwords = readSeedPasswords(environment)
  readDataEnvironment(environment)
  if (!environment.IRIS_USERNAME && !environment.IRIS_PASSWORD) {
    const containerId = execFileSync(
      'docker',
      [...compose, 'ps', '-q', 'iris'],
      { cwd: root, encoding: 'utf8' },
    ).trim()
    const containers = JSON.parse(
      execFileSync('docker', ['inspect', containerId], { encoding: 'utf8' }),
    )
    const container = containers[0]
    const configFiles = String(
      container?.Config?.Labels?.['com.docker.compose.project.config_files'] ??
        '',
    ).split(',')
    if (
      !container?.State?.Running ||
      !configFiles.includes(`${root}compose.yaml`)
    )
      throw new Error('IRIS no pertenece al proyecto local esperado.')
    const name = `H10Test_${randomBytes(8).toString('hex')}`
    const marker = `h10-${randomBytes(16).toString('hex')}`
    const password = randomBytes(32).toString('base64url')
    const expires = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    temporary = { name, marker }
    adminCommand(
      `set sc=##class(Security.Users).Create("${name}","%All","${password}","Prueba Hito 10","USER","","${expires}",0,1,"${marker}")
if $System.Status.IsError(sc) { write "H10_CREATE_FAILED",! } else { write "H10_CREATED",! }`,
      'H10_CREATED',
    )
    environment.IRIS_USERNAME = name
    environment.IRIS_PASSWORD = password
    console.info(
      'Acceso temporal de laboratorio IRIS preparado; credenciales solo en memoria.',
    )
  }
  const accounts = new MongoAccountRepository(auth)
  try {
    await seedUsers(accounts, new Argon2PasswordHasher(), passwords, {
      log: { info() {} },
    })
  } finally {
    await accounts.close()
  }
}

async function runLocalProcess() {
  const args =
    process.argv[2] === '--serve'
      ? ['--import', 'tsx', 'src/index.ts']
      : [
          fileURLToPath(
            new URL('../node_modules/vitest/vitest.mjs', import.meta.url),
          ),
          'run',
          '--config',
          'vitest.integration.config.ts',
          ...process.argv.slice(2),
        ]
  const child = spawn(process.execPath, args, {
    cwd: directory,
    env: environment,
    stdio: 'inherit',
  })
  const interrupt = () => {
    child.kill('SIGINT')
  }
  const terminate = () => {
    child.kill('SIGTERM')
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', terminate)
  try {
    const [code] = await once(child, 'exit')
    return typeof code === 'number' ? code : 1
  } finally {
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', terminate)
  }
}

try {
  await prepareEnvironment()
  process.exitCode = await runLocalProcess()
} catch {
  console.error(
    'No se pudo preparar la ejecución local. Revisar Docker, .env local y los servicios del proyecto. No se imprimen secretos.',
  )
  process.exitCode = 1
} finally {
  if (temporary) {
    const { name, marker } = temporary
    try {
      adminCommand(
        `set sc=##class(Security.Users).Get("${name}",.p)
if $System.Status.IsError(sc) { write "H10_REMOVED",! } elseif $get(p("Comment"))="${marker}" { set sc=##class(Security.Users).Delete("${name}") if '$System.Status.IsError(sc) { write "H10_REMOVED",! } }`,
        'H10_REMOVED',
      )
      console.info(
        'Cuenta temporal IRIS eliminada. Las cuentas existentes se conservan.',
      )
    } catch {
      console.error(
        `Revisar la cuenta temporal ${name}: no se pudo confirmar su eliminación.`,
      )
      process.exitCode = 1
    }
  }
}
