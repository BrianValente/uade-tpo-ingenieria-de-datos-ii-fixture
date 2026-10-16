import { expect, it } from 'vitest'
import {
  loginBodySchema,
  loginResponseSchema,
  sessionResponseSchema,
  userSchema,
} from '../../src/modules/auth/presentation/auth.schemas.js'

it('los ejemplos de autenticación respetan sus esquemas y usan marcadores ilustrativos', () => {
  for (const schema of [
    loginBodySchema,
    loginResponseSchema,
    sessionResponseSchema,
  ]) {
    const examples = schema.meta()?.examples
    if (!Array.isArray(examples))
      throw new Error('Faltan ejemplos en el esquema.')
    expect(examples.length).toBeGreaterThan(0)
    for (const example of examples)
      expect(schema.safeParse(example).success).toBe(true)
  }
  expect(userSchema.safeParse(userSchema.meta()?.example).success).toBe(true)
  expect(loginBodySchema.meta()?.description).toContain('marcador')
  expect(loginResponseSchema.meta()?.description).toContain(
    'no corresponde a una sesión',
  )
})
