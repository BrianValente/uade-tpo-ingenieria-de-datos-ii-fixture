import { createHash, randomBytes } from 'node:crypto'

import { ApiError } from '../../../app/errors/api-error.js'
import type {
  AccountRepository,
  OperationContext,
  PasswordHasher,
  SessionRepository,
} from '../domain/ports.js'

// Hash de relleno del TP de baloncesto: permite verificar Argon2 también si la cuenta no existe.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$gTI4BOfyQ4phQjd0hrFJDA$DYkNj+E1BHn9aTTEJQAqioKnzhtTu92TLgvoFVKYS2M'
export const SESSION_TTL_SECONDS = 1800

export function tokenDigest(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export class AuthService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async login(
    input: { username: string; password: string },
    context: OperationContext,
  ) {
    const account = await this.accounts.findByUsername(input.username, context)
    const valid = await this.passwords.verify(
      account?.passwordHash ?? DUMMY_HASH,
      input.password,
    )
    if (!account || !valid) throw new ApiError('INVALID_CREDENTIALS')
    const user = {
      id: account.id,
      username: account.username,
      role: account.role,
    }
    const accessToken = randomBytes(32).toString('base64url')
    await this.sessions.create(tokenDigest(accessToken), user, context)
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: SESSION_TTL_SECONDS,
      user,
    } as const
  }

  async currentSession(token: string, context: OperationContext) {
    const session = await this.sessions.read(tokenDigest(token), context)
    if (!session) throw new ApiError('UNAUTHENTICATED')
    return session
  }

  async authorize(
    token: string,
    context: OperationContext,
    requiredRole?: 'admin',
  ) {
    const session = await this.sessions.readAndRenew(
      tokenDigest(token),
      context,
    )
    if (!session) throw new ApiError('UNAUTHENTICATED')
    if (requiredRole && session.user.role !== requiredRole)
      throw new ApiError('FORBIDDEN')
    return session.user
  }

  async logout(token: string, context: OperationContext) {
    await this.sessions.remove(tokenDigest(token), context)
  }
}
