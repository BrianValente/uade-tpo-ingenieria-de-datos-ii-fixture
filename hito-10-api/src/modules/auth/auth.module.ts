import {
  readAuthEnvironment,
  type AuthEnvironment,
} from '../../config/auth-environment.js'
import { AuthService } from './application/auth.service.js'
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js'
import { MongoAccountRepository } from './infrastructure/mongo-account.repository.js'
import { RedisSessionRepository } from './infrastructure/redis-session.repository.js'

export type AuthModule = { service: AuthService; close(): Promise<void> }

// Los clientes no se conectan hasta que una operación los utiliza.
export function createAuthModule(
  config: AuthEnvironment = readAuthEnvironment({}),
): AuthModule {
  const accounts = new MongoAccountRepository(config)
  const sessions = new RedisSessionRepository(config)
  return {
    service: new AuthService(accounts, sessions, new Argon2PasswordHasher()),
    async close() {
      await Promise.all([accounts.close(), sessions.close()])
    },
  }
}
