import * as argon2 from 'argon2'

import type { PasswordHasher } from '../domain/ports.js'

// Adaptación del hasher del equipo en el TP de baloncesto.
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    })
  }

  verify(hash: string, password: string) {
    return argon2.verify(hash, password)
  }
}
