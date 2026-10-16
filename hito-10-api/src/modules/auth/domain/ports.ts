export type User = {
  id: string
  username: string
  role: 'user' | 'admin'
}

export type Account = User & { passwordHash: string }
export type Session = {
  user: User
  createdAt: string
  lastActivity: string
  ttlSeconds: number
}

export type OperationContext = {
  log: { info(fields: Record<string, unknown>, message: string): void }
}

export interface AccountRepository {
  findByUsername(
    username: string,
    context: OperationContext,
  ): Promise<Account | null>
}

export interface SeedRepository {
  ensureIndex(context: OperationContext): Promise<void>
  insertIfAbsent(account: Account, context: OperationContext): Promise<boolean>
}

export interface SessionRepository {
  create(digest: string, user: User, context: OperationContext): Promise<void>
  read(digest: string, context: OperationContext): Promise<Session | null>
  remove(digest: string, context: OperationContext): Promise<void>
}

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(hash: string, password: string): Promise<boolean>
}
