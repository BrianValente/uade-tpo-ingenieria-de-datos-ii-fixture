import { performance } from 'node:perf_hooks'
import type {
  IRISReference,
  Connection,
  Iris,
  IRISObject,
  IRISReturnType,
} from '@intersystems/intersystems-iris-native'

import { ApiError } from '../../../app/errors/api-error.js'
import type { DataEnvironment } from '../../../config/data-environment.js'
import type { OperationContext } from '../../auth/domain/ports.js'
import type { IrisMatch, ObjectRepository } from '../domain/ports.js'

export class IrisObjectRepository implements ObjectRepository {
  constructor(private readonly config: DataEnvironment) {}

  private async run<T>(
    operation: string,
    context: OperationContext,
    execute: (iris: Iris, Reference: typeof IRISReference) => T,
  ): Promise<T> {
    const started = performance.now()
    let result = 'success'
    let connection: Connection | undefined
    try {
      const { createConnection, IRISReference } =
        await import('@intersystems/intersystems-iris-native')
      connection = createConnection({
        host: this.config.IRIS_HOST,
        port: this.config.IRIS_PORT,
        ns: this.config.IRIS_NAMESPACE,
        user: this.config.IRIS_USERNAME,
        pwd: this.config.IRIS_PASSWORD,
        sharedmemory: false,
        timeout: this.config.DEPENDENCY_TIMEOUT_MS,
      })
      return execute(connection.createIris(), IRISReference)
    } catch (error) {
      result = 'failure'
      if (error instanceof ApiError) throw error
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    } finally {
      connection?.close()
      context.log.info(
        {
          dependency: 'IRIS',
          operation,
          result,
          durationMs: performance.now() - started,
        },
        'Operación de dependencia',
      )
    }
  }

  find(code: string, context: OperationContext) {
    return this.run('findObjectMatch', context, (iris, Reference) => {
      const match = openByCode(iris, code)
      if (!match) return null
      return readMatch(match, Reference)
    })
  }

  changeState(code: string, state: string, context: OperationContext) {
    return this.run('changeObjectMatchState', context, (iris, Reference) => {
      const match = openByCode(iris, code)
      if (!match) return null
      ensureStatus(iris, match.invoke('CambiarEstado', state))
      ensureStatus(iris, match.invoke('%Save'))
      return readMatch(match, Reference)
    })
  }

  addEvent(
    code: string,
    event: { code: string; type: string; minute: number; detail: string },
    context: OperationContext,
  ) {
    return this.run('addObjectMatchEvent', context, (iris, Reference) => {
      const match = openByCode(iris, code)
      if (!match) return null
      ensureStatus(
        iris,
        match.invoke(
          'RegistrarEvento',
          event.code,
          event.type,
          event.minute,
          event.detail,
        ),
      )
      ensureStatus(iris, match.invoke('%Save'))
      return readMatch(match, Reference)
    })
  }
}

function ensureStatus(iris: Iris, status: IRISReturnType | null) {
  if (
    status === null ||
    iris.classMethodBoolean('%SYSTEM.Status', 'IsError', status)
  )
    throw new ApiError('CONFLICT')
}

function openByCode(iris: Iris, code: string): IRISObject | null {
  const statement = asObject(iris.classMethodObject('%SQL.Statement', '%New'))
  ensureStatus(
    iris,
    statement.invoke(
      '%Prepare',
      'SELECT ID FROM Fixture.Partido WHERE Codigo = ?',
    ),
  )
  const rows = asObject(statement.invokeObject('%Execute', code))
  if (!rows.invokeBoolean('%Next')) return null
  const id = rows.invokeString('%Get', 'ID')
  if (!id) return null
  return asObject(iris.classMethodObject('Fixture.Partido', '%OpenId', id))
}

function asObject(value: IRISReturnType | null): IRISObject {
  if (typeof value !== 'object' || value === null || !('invokeObject' in value))
    throw new Error('IRIS no devolvió un objeto.')
  return value
}

function related(match: IRISObject, property: string) {
  return asObject(match.getObject(property))
}

function readPerson(person: IRISObject) {
  return {
    code: person.getString('Codigo') ?? '',
    name: person.getString('Nombre') ?? '',
    nationality: person.getString('Nacionalidad') ?? '',
    license: person.getString('Licencia') ?? '',
  }
}

function readMatch(
  match: IRISObject,
  Reference: typeof IRISReference,
): IrisMatch {
  const referee = related(match, 'ArbitroPrincipal')
  const homeCoach = related(match, 'TecnicoLocal')
  const awayCoach = related(match, 'TecnicoVisitante')
  const key = new Reference('', Reference.Type.STRING)
  const events: IrisMatch['events'] = []
  for (;;) {
    const value = match.invokeObject('ObtenerSiguienteEvento', key)
    if (!key.getString()) break
    const event = asObject(value)
    events.push({
      code: event.getString('Codigo') ?? '',
      type: event.getString('Tipo') ?? '',
      minute: event.getNumber('Minuto') ?? 0,
      detail: event.getString('Detalle') ?? '',
    })
  }
  return {
    code: match.getString('Codigo') ?? '',
    dateTime: match.getString('FechaHora') ?? '',
    homeCode: match.getString('EquipoLocalCodigo') ?? '',
    awayCode: match.getString('EquipoVisitanteCodigo') ?? '',
    state: match.invokeString('ObtenerEstado') ?? '',
    referee: {
      ...readPerson(referee),
      category: referee.getString('Categoria') ?? '',
    },
    homeCoach: {
      ...readPerson(homeCoach),
      teamCode: homeCoach.getString('SeleccionCodigo') ?? '',
    },
    awayCoach: {
      ...readPerson(awayCoach),
      teamCode: awayCoach.getString('SeleccionCodigo') ?? '',
    },
    events,
  }
}
