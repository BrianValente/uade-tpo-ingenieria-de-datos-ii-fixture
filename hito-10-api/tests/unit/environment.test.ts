import { describe, expect, it } from 'vitest'

import { readEnvironment } from '../../src/config/environment.js'

describe('Configuración HTTP', () => {
  it.each([
    ['API_PORT', '0'],
    ['API_PORT', '65536'],
    ['API_PORT', '8000.5'],
    ['API_PORT', ''],
    ['API_HOST', 'http://localhost:8000/password-secreta'],
    ['API_LOG_LEVEL', 'password-secreta'],
    ['API_REQUEST_TIMEOUT_MS', '0'],
    ['API_REQUEST_TIMEOUT_MS', 'Infinity'],
    ['API_BODY_LIMIT_BYTES', '0'],
  ])('rechaza %s inválido sin revelar su valor', (field, value) => {
    expect(() => readEnvironment({ [field]: value })).toThrow(
      `Configuración inválida: ${field}`,
    )
    try {
      readEnvironment({ [field]: value })
    } catch (error) {
      expect(String(error)).not.toContain('password-secreta')
    }
  })

  it('convierte valores del entorno y permite IPv6 local', () => {
    const config = readEnvironment({ API_HOST: '::1', API_PORT: '8080' })
    expect(config.API_HOST).toBe('::1')
    expect(config.API_PORT).toBe(8080)
  })
})
