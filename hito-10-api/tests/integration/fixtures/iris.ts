import { randomUUID } from 'node:crypto'
import {
  createConnection,
  type IRISObject,
  type IRISReturnType,
} from '@intersystems/intersystems-iris-native'

import type { DataEnvironment } from '../../../src/config/data-environment.js'

export function createIrisFixture(config: DataEnvironment) {
  const connection = createConnection({
    host: config.IRIS_HOST,
    port: config.IRIS_PORT,
    ns: config.IRIS_NAMESPACE,
    user: config.IRIS_USERNAME,
    pwd: config.IRIS_PASSWORD,
    sharedmemory: false,
    timeout: config.DEPENDENCY_TIMEOUT_MS,
  })
  try {
    const iris = connection.createIris()
    const suffix = randomUUID().replaceAll('-', '').toUpperCase()
    const make = (
      className: string,
      fields: Record<string, IRISReturnType>,
    ) => {
      const object = iris.classMethodObject(className, '%New') as IRISObject
      for (const [key, value] of Object.entries(fields)) object.set(key, value)
      return object
    }
    const referee = make('Fixture.Arbitro', {
      Codigo: `ARB-${suffix}`,
      Nombre: 'Árbitro de integración',
      Nacionalidad: 'Uruguay',
      Licencia: `LIC-A-${suffix}`,
      Categoria: 'Internacional',
    })
    const home = make('Fixture.Tecnico', {
      Codigo: `TEC-L-${suffix}`,
      Nombre: 'Técnico local de integración',
      Nacionalidad: 'Argentina',
      Licencia: `LIC-L-${suffix}`,
      SeleccionCodigo: 'ARG',
    })
    const away = make('Fixture.Tecnico', {
      Codigo: `TEC-V-${suffix}`,
      Nombre: 'Técnico visitante de integración',
      Nacionalidad: 'Brasil',
      Licencia: `LIC-V-${suffix}`,
      SeleccionCodigo: 'BRA',
    })
    const code = `F2030-TEST-${suffix}`
    const match = make('Fixture.Partido', {
      Codigo: code,
      FechaHora: '2030-06-13 16:00:00',
      EquipoLocalCodigo: 'ARG',
      EquipoVisitanteCodigo: 'BRA',
      ArbitroPrincipal: referee,
      TecnicoLocal: home,
      TecnicoVisitante: away,
    })
    const status = match.invoke('%Save')
    if (
      status === null ||
      iris.classMethodBoolean('%SYSTEM.Status', 'IsError', status)
    )
      throw new Error('No se pudo guardar el agregado de prueba.')
    return code
  } finally {
    connection.close()
  }
}
