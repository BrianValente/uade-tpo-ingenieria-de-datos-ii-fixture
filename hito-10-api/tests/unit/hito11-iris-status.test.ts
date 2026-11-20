import { expect, it } from 'vitest'

import { isSuccessfulIrisStatus } from '../../../hito-11-conectividad/scripts/prueba_clientes_nativos.js'

it.each([1n, 1, '1', true])(
  'acepta el %%Status exitoso del SDK IRIS: %s',
  (value) => {
    expect(isSuccessfulIrisStatus(value)).toBe(true)
  },
)

it.each([0n, 0, '0', false, -1, null, undefined, 'error', {}])(
  'no convierte un %%Status fallido o inválido en éxito: %s',
  (value) => {
    expect(isSuccessfulIrisStatus(value)).toBe(false)
  },
)
