import { performance } from 'node:perf_hooks'
import { createClient, ErrorReply } from 'redis'
import { z } from 'zod'

import { ApiError } from '../../../app/errors/api-error.js'
import type { AuthEnvironment } from '../../../config/auth-environment.js'
import { SESSION_TTL_SECONDS } from '../application/auth.service.js'
import type {
  OperationContext,
  Session,
  SessionRepository,
  User,
} from '../domain/ports.js'

// Basado en crear_sesion.lua del Hito 7: atributos y vencimiento en una operación.
export const CREATE_SESSION = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
local t = redis.call('TIME')
local now = t[1] .. '.' .. string.format('%06d', tonumber(t[2]))
redis.call('HSET', KEYS[1],
  'sesion_id', ARGV[1], 'usuario_id', ARGV[2], 'username', ARGV[3],
  'rol', ARGV[4], 'estado_acceso', 'autorizado',
  'creada_en', now, 'ultima_actividad', now)
redis.call('EXPIRE', KEYS[1], ARGV[5])
return 1`

// Basado en actividad_sesion.lua del Hito 7. Esta lectura no renueva el TTL.
export const READ_SESSION = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return nil end
if redis.call('HGET', KEYS[1], 'estado_acceso') ~= 'autorizado' then return nil end
return {redis.call('HGETALL', KEYS[1]), ttl}`

// Comprueba primero que la sesión siga vigente. EXPIRE nunca recrea una clave ausente.
export const READ_AND_RENEW_SESSION = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return nil end
if redis.call('HGET', KEYS[1], 'estado_acceso') ~= 'autorizado' then return nil end
local t = redis.call('TIME')
local now = t[1] .. '.' .. string.format('%06d', tonumber(t[2]))
redis.call('HSET', KEYS[1], 'ultima_actividad', now)
redis.call('EXPIRE', KEYS[1], ARGV[1])
return {redis.call('HGETALL', KEYS[1]), tonumber(ARGV[1]) * 1000}`

const fieldsSchema = z.object({
  usuario_id: z.uuid(),
  username: z.string(),
  rol: z.enum(['user', 'admin']),
  creada_en: z.string().regex(/^\d+\.\d{6}$/),
  ultima_actividad: z.string().regex(/^\d+\.\d{6}$/),
})
const resultSchema = z.tuple([z.array(z.string()), z.number().positive()])
function newRedisClient(config: AuthEnvironment) {
  return createClient({
    socket: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      connectTimeout: config.DEPENDENCY_TIMEOUT_MS,
      reconnectStrategy: false,
    },
    ...(config.REDIS_USERNAME ? { username: config.REDIS_USERNAME } : {}),
    ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {}),
    database: config.REDIS_DATABASE,
    disableOfflineQueue: true,
    commandOptions: { timeout: config.DEPENDENCY_TIMEOUT_MS },
  })
}
type Client = ReturnType<typeof newRedisClient>
type Connection = { client: Client; ready: Promise<unknown> }

export class RedisSessionRepository implements SessionRepository {
  private current: Connection | undefined
  private closed = false

  constructor(private readonly config: AuthEnvironment) {}

  private connection(): Connection {
    if (this.closed) throw new ApiError('DEPENDENCY_UNAVAILABLE')
    if (this.current?.client.isOpen) return this.current
    const client = newRedisClient(this.config)
    client.on('error', () => {
      /* El error público se traduce en run(). */
    })
    const connection = { client, ready: client.connect() }
    this.current = connection
    return connection
  }

  private key(digest: string) {
    return `fixture2030:h10:${this.config.API_REDIS_SCOPE}:sesion:${digest}`
  }

  private async run<T>(
    operation: string,
    context: OperationContext,
    execute: (client: Client) => Promise<T>,
  ): Promise<T> {
    const started = performance.now()
    let result = 'success'
    let timer: NodeJS.Timeout | undefined
    let connection: Connection | undefined
    let finished = false
    // El timeout del cliente solo cubre comandos sin enviar. Este límite cubre también la respuesta.
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new ApiError('DEPENDENCY_UNAVAILABLE')),
        this.config.DEPENDENCY_TIMEOUT_MS,
      )
    })
    try {
      connection = this.connection()
      const client = connection.client
      const execution = connection.ready.then(() => {
        if (finished) throw new ApiError('DEPENDENCY_UNAVAILABLE')
        return execute(client)
      })
      return await Promise.race([execution, timeout])
    } catch (error) {
      result = 'failure'
      if (connection?.client.isOpen) connection.client.destroy()
      if (this.current === connection) this.current = undefined
      if (
        error instanceof ErrorReply &&
        /^(WRONGTYPE|ERR)\b/.test(error.message)
      ) {
        throw new ApiError('INTERNAL_ERROR')
      }
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    } finally {
      finished = true
      clearTimeout(timer)
      context.log.info(
        {
          dependency: 'Redis',
          operation,
          result,
          durationMs: performance.now() - started,
        },
        'Operación de dependencia',
      )
    }
  }

  async create(digest: string, user: User, context: OperationContext) {
    const result = await this.run('createSession', context, (client) =>
      client.eval(CREATE_SESSION, {
        keys: [this.key(digest)],
        arguments: [
          digest,
          user.id,
          user.username,
          user.role,
          String(SESSION_TTL_SECONDS),
        ],
      }),
    )
    if (result !== 1) throw new ApiError('INTERNAL_ERROR')
  }

  async read(
    digest: string,
    context: OperationContext,
  ): Promise<Session | null> {
    const result = await this.run('readSession', context, (client) =>
      client.eval(READ_SESSION, { keys: [this.key(digest)], arguments: [] }),
    )
    return this.toSession(result)
  }

  async readAndRenew(digest: string, context: OperationContext) {
    const result = await this.run('readAndRenewSession', context, (client) =>
      client.eval(READ_AND_RENEW_SESSION, {
        keys: [this.key(digest)],
        arguments: [String(SESSION_TTL_SECONDS)],
      }),
    )
    return this.toSession(result)
  }

  private toSession(result: unknown): Session | null {
    if (result === null) return null
    const [values, ttl] = resultSchema.parse(result)
    if (values.length % 2 !== 0) throw new ApiError('INTERNAL_ERROR')
    const entries: [string, string][] = []
    for (let i = 0; i < values.length; i += 2)
      entries.push([values[i]!, values[i + 1]!])
    const session = fieldsSchema.parse(Object.fromEntries(entries))
    return {
      user: {
        id: session.usuario_id,
        username: session.username,
        role: session.rol,
      },
      createdAt: toTimestamp(session.creada_en),
      lastActivity: toTimestamp(session.ultima_actividad),
      ttlSeconds: Math.ceil(ttl / 1000),
    }
  }

  async remove(digest: string, context: OperationContext) {
    await this.run('deleteSession', context, (client) =>
      client.del(this.key(digest)),
    )
  }

  async close() {
    this.closed = true
    const connection = this.current
    this.current = undefined
    if (connection?.client.isOpen) connection.client.destroy()
    if (connection) await connection.ready.catch(() => undefined)
  }
}

function toTimestamp(value: string) {
  const [seconds, fraction] = value.split('.')
  return new Date(Number(seconds) * 1000)
    .toISOString()
    .replace('.000Z', `.${fraction}Z`)
}
