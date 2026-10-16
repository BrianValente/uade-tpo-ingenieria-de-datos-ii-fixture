import {
  MongoClient,
  MongoNetworkError,
  MongoOperationTimeoutError,
  MongoServerError,
  MongoServerSelectionError,
} from 'mongodb'
import { performance } from 'node:perf_hooks'
import { z } from 'zod'

import { ApiError } from '../../../app/errors/api-error.js'
import type { AuthEnvironment } from '../../../config/auth-environment.js'
import type {
  Account,
  AccountRepository,
  OperationContext,
  SeedRepository,
} from '../domain/ports.js'

const documentSchema = z.object({
  _id: z.uuid(),
  username: z.string(),
  role: z.enum(['user', 'admin']),
  passwordHash: z.string(),
})
type AccountDocument = z.infer<typeof documentSchema>

export class MongoAccountRepository
  implements AccountRepository, SeedRepository
{
  private readonly client: MongoClient
  private readonly accounts

  constructor(config: AuthEnvironment) {
    const host = config.MONGO_HOST.includes(':')
      ? `[${config.MONGO_HOST}]`
      : config.MONGO_HOST
    this.client = new MongoClient(`mongodb://${host}:${config.MONGO_PORT}`, {
      appName: 'fixture2030-api',
      ...(config.MONGO_ROOT_USERNAME
        ? {
            auth: {
              username: config.MONGO_ROOT_USERNAME,
              password: config.MONGO_ROOT_PASSWORD,
            },
            authSource: config.MONGO_AUTH_SOURCE,
          }
        : {}),
      timeoutMS: config.DEPENDENCY_TIMEOUT_MS,
      connectTimeoutMS: config.DEPENDENCY_TIMEOUT_MS,
      serverSelectionTimeoutMS: config.DEPENDENCY_TIMEOUT_MS,
      retryReads: false,
      retryWrites: false,
      maxPoolSize: 5,
    })
    this.accounts = this.client
      .db(config.MONGO_DATABASE)
      .collection<AccountDocument>('usuarios_api')
  }

  private async run<T>(
    operation: string,
    context: OperationContext,
    execute: () => Promise<T>,
  ): Promise<T> {
    const started = performance.now()
    let result = 'success'
    try {
      return await execute()
    } catch (error) {
      result = 'failure'
      if (
        error instanceof MongoNetworkError ||
        error instanceof MongoServerSelectionError ||
        error instanceof MongoOperationTimeoutError ||
        (error instanceof MongoServerError &&
          [13, 18].includes(Number(error.code)))
      ) {
        throw new ApiError('DEPENDENCY_UNAVAILABLE')
      }
      throw error
    } finally {
      context.log.info(
        {
          dependency: 'MongoDB',
          operation,
          result,
          durationMs: performance.now() - started,
        },
        'Operación de dependencia',
      )
    }
  }

  async findByUsername(
    username: string,
    context: OperationContext,
  ): Promise<Account | null> {
    const document = await this.run('findAccount', context, () =>
      this.accounts.findOne(
        { username },
        { projection: { _id: 1, username: 1, role: 1, passwordHash: 1 } },
      ),
    )
    if (!document) return null
    const account = documentSchema.parse(document)
    return {
      id: account._id,
      username: account.username,
      role: account.role,
      passwordHash: account.passwordHash,
    }
  }

  async ensureIndex(context: OperationContext) {
    await this.run('ensureUsernameIndex', context, () =>
      this.accounts.createIndex({ username: 1 }, { unique: true }),
    )
  }

  async insertIfAbsent(account: Account, context: OperationContext) {
    const result = await this.run('seedAccount', context, () =>
      this.accounts.updateOne(
        { username: account.username },
        {
          $setOnInsert: {
            _id: account.id,
            username: account.username,
            role: account.role,
            passwordHash: account.passwordHash,
          },
        },
        { upsert: true },
      ),
    )
    return result.upsertedCount === 1
  }

  close() {
    return this.client.close()
  }
}
