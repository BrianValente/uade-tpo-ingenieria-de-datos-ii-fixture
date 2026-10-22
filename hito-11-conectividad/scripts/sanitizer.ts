/**
 * Utilidades de sanitización y redacción automática de credenciales (RNF7, RNF8)
 */

export function sanitizeUrl(urlStr: string): string {
  if (!urlStr) return ''
  try {
    const parsed = new URL(urlStr)
    if (parsed.password) {
      parsed.password = '******'
    }
    return parsed.toString()
  } catch {
    // Si no es un URL estándar, redactar posibles credenciales vía regex
    return urlStr.replace(/(:\/\/)([^:@\s]+):([^@\s]+)@/g, '$1$2:******@')
  }
}

export function sanitizeSecrets(text: string): string {
  if (!text) return ''
  let sanitized = text

  // 1. URLs con contraseñas (mongodb, redis, http, etc.)
  sanitized = sanitized.replace(/(:\/\/)([^:@\s]+):([^@\s]+)@/g, '$1$2:******@')

  // 2. Tokens Bearer o accessToken en JSON
  sanitized = sanitized.replace(/Bearer\s+([A-Za-z0-9_\-.~+/]+=*)/gi, 'Bearer ******')
  sanitized = sanitized.replace(
    /("accessToken"\s*:\s*")([^"]+)(")/gi,
    '$1******$3',
  )
  sanitized = sanitized.replace(
    /("password"\s*:\s*")([^"]+)(")/gi,
    '$1******$3',
  )

  // 3. Tokens en query strings (?token=... o ?auth=...)
  sanitized = sanitized.replace(/([?&](?:token|password|auth|secret)=)([^&]+)/gi, '$1******')

  return sanitized
}
