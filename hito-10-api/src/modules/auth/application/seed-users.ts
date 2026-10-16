import { randomUUID } from 'node:crypto'

import type { SeedPasswords } from '../../../config/auth-environment.js'
import type {
  OperationContext,
  PasswordHasher,
  SeedRepository,
} from '../domain/ports.js'

export async function seedUsers(
  repository: SeedRepository,
  hasher: PasswordHasher,
  passwords: SeedPasswords,
  context: OperationContext,
) {
  await repository.ensureIndex(context)
  let inserted = 0
  for (const [username, role, password] of [
    ['fixture-admin', 'admin', passwords.API_SEED_ADMIN_PASSWORD],
    ['fixture-user', 'user', passwords.API_SEED_USER_PASSWORD],
  ] as const) {
    const created = await repository.insertIfAbsent(
      {
        id: randomUUID(),
        username,
        role,
        passwordHash: await hasher.hash(password),
      },
      context,
    )
    if (created) inserted++
  }
  return { inserted, unchanged: 2 - inserted }
}
