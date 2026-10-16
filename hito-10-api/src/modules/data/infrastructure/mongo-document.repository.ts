import { performance } from 'node:perf_hooks'
import {
  MongoClient,
  MongoNetworkError,
  MongoOperationTimeoutError,
  MongoServerSelectionError,
} from 'mongodb'

import { ApiError } from '../../../app/errors/api-error.js'
import type { DataEnvironment } from '../../../config/data-environment.js'
import type { OperationContext } from '../../auth/domain/ports.js'
import type { DocumentRepository, Player, Team } from '../domain/ports.js'

export class MongoDocumentRepository implements DocumentRepository {
  private readonly client: MongoClient
  private readonly database

  constructor(config: DataEnvironment) {
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
      maxPoolSize: 5,
    })
    this.database = this.client.db(config.MONGO_DATABASE)
  }

  private async run<T>(
    operation: string,
    context: OperationContext,
    execute: () => Promise<T>,
  ) {
    const started = performance.now()
    let result = 'success'
    try {
      return await execute()
    } catch (error) {
      result = 'failure'
      if (
        error instanceof MongoNetworkError ||
        error instanceof MongoServerSelectionError ||
        error instanceof MongoOperationTimeoutError
      )
        throw new ApiError('DEPENDENCY_UNAVAILABLE')
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

  async findTeam(
    code: string,
    context: OperationContext,
  ): Promise<Team | null> {
    const row = await this.run('findTeam', context, () =>
      this.database.collection('equipos').findOne({ codigo: code }),
    )
    if (!row) return null
    return {
      id: String(row._id),
      code: String(row.codigo),
      name: String(row.nombre),
      confederation: String(row.confederacion),
      selectionOrigin: String(row.origenSeleccion),
      qualificationStage: String(row.etapaClasificacion),
      participates: Boolean(row.participaFixture2030),
      ...(typeof row.sedeEntrenamiento === 'string'
        ? { trainingBase: row.sedeEntrenamiento }
        : {}),
    }
  }

  async listPlayers(
    teamId: string,
    page: number,
    limit: number,
    context: OperationContext,
  ) {
    const collection = this.database.collection('jugadores')
    const [rows, total] = await this.run('listPlayers', context, () =>
      Promise.all([
        collection
          .find({ equipoId: teamId })
          .sort({ posicion: 1, dorsal: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        collection.countDocuments({ equipoId: teamId }),
      ]),
    )
    const items: Player[] = rows.map((row) => ({
      id: String(row._id),
      teamId: String(row.equipoId),
      teamCode: String(row.equipoCodigo),
      firstName: String(row.nombre),
      lastName: String(row.apellido),
      birthDate:
        row.fechaNacimiento instanceof Date
          ? row.fechaNacimiento.toISOString()
          : String(row.fechaNacimiento),
      position: String(row.posicion),
      number: Number(row.dorsal),
      heightCm: Number(row.alturaCm),
      preferredFoot: String(row.pieHabil),
      selected: Boolean(row.convocado),
      available: Boolean(row.disponible),
      synthetic: Boolean(row.datosSinteticos),
    }))
    return { items, total }
  }

  close() {
    return this.client.close()
  }
}
