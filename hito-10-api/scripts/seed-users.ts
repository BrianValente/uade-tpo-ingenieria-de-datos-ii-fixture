import {
  readAuthEnvironment,
  readSeedPasswords,
} from '../src/config/auth-environment.js'
import { seedUsers } from '../src/modules/auth/application/seed-users.js'
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher.js'
import { MongoAccountRepository } from '../src/modules/auth/infrastructure/mongo-account.repository.js'

// Validar todo antes de abrir conexiones o crear índices.
const config = readAuthEnvironment()
const passwords = readSeedPasswords()
const repository = new MongoAccountRepository(config)
try {
  const result = await seedUsers(
    repository,
    new Argon2PasswordHasher(),
    passwords,
    {
      // La salida de seed no incluye identificadores, hashes ni datos de conexión.
      log: { info() {} },
    },
  )
  console.info(
    `Usuarios creados: ${result.inserted}; usuarios existentes conservados: ${result.unchanged}.`,
  )
} catch {
  console.error(
    'No se pudo completar la seed. Revisar conectividad, credenciales e índice de usuarios.',
  )
  process.exitCode = 1
} finally {
  await repository.close()
}
