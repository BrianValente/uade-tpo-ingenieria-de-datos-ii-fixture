import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'
import { expect, it } from 'vitest'

import { readSeedPasswords } from '../../src/config/auth-environment.js'
import { createLocalEnvironment } from '../../src/config/local-environment.js'

it('copia credenciales sin alterar espacios o caracteres de .env y genera dos contraseñas distintas', () => {
  const password = randomBytes(24).toString('base64url') + ' # y espacio'
  const root = `MONGO_ROOT_USERNAME=admin\nMONGO_ROOT_PASSWORD='${password}'\nMONGO_PORT=27018\n`
  const content = createLocalEnvironment(
    'API_PORT=8000\nMONGO_DATABASE=fixture2030\n',
    root,
    {},
  )
  const values = parseEnv(content)
  expect(values.MONGO_ROOT_PASSWORD).toBe(password)
  expect(values.MONGO_PORT).toBe('27018')
  const seed = readSeedPasswords(values)
  expect(seed.API_SEED_ADMIN_PASSWORD).toHaveLength(43)
  expect(seed.API_SEED_USER_PASSWORD).toHaveLength(43)
  expect(seed.API_SEED_ADMIN_PASSWORD).not.toBe(seed.API_SEED_USER_PASSWORD)
})

it('respeta la precedencia del entorno que también usa Compose', () => {
  const values = parseEnv(
    createLocalEnvironment('', 'MONGO_PORT=27017', { MONGO_PORT: '27018' }),
  )
  expect(values.MONGO_PORT).toBe('27018')
})

it('rechaza una conversión que alteraría las credenciales antes de escribir el archivo', () => {
  expect(() =>
    createLocalEnvironment('', '', {
      MONGO_ROOT_USERNAME: 'admin',
      MONGO_ROOT_PASSWORD: randomBytes(24).toString('base64url') + '\'"',
    }),
  ).toThrow('No se puede copiar esta configuración automáticamente.')
})
