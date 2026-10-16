import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'

import { readAuthEnvironment, readSeedPasswords } from './auth-environment.js'
import { readEnvironment } from './environment.js'

export function createLocalEnvironment(
  example: string,
  root: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const values = parseEnv(example)
  const source = { ...parseEnv(root), ...environment }
  for (const key of [
    'MONGO_ROOT_USERNAME',
    'MONGO_ROOT_PASSWORD',
    'MONGO_DATABASE',
    'MONGO_PORT',
    'REDIS_PORT',
  ]) {
    if (source[key] !== undefined) values[key] = source[key]
  }
  values.API_SEED_ADMIN_PASSWORD = randomBytes(32).toString('base64url')
  values.API_SEED_USER_PASSWORD = randomBytes(32).toString('base64url')
  readEnvironment(values)
  readAuthEnvironment(values)
  readSeedPasswords(values)
  const content =
    Object.entries(values)
      .map(([key, value]) => {
        if (value === undefined)
          throw new Error('Configuración local incompleta.')
        const quote = value.includes("'") ? '"' : "'"
        return `${key}=${quote}${value}${quote}`
      })
      .join('\n') + '\n'
  const parsed = parseEnv(content)
  if (Object.entries(values).some(([key, value]) => parsed[key] !== value)) {
    throw new Error(
      'No se puede copiar esta configuración automáticamente. Configurar el archivo local manualmente.',
    )
  }
  return content
}
