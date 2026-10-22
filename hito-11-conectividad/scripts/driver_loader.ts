import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

let requireFromHito10: NodeRequire | null = null

function getHito10Require(): NodeRequire {
  if (!requireFromHito10) {
    // Intentar resolver desde package.json de hito-10-api relativo a este archivo
    const targetUrl = new URL('../../hito-10-api/package.json', import.meta.url)
    requireFromHito10 = createRequire(targetUrl)
  }
  return requireFromHito10
}

/**
 * Carga perezosa de drivers para evitar fallos de importación estática
 * en clon limpio cuando no se cuenta con enlaces globales o cuando
 * solo se ejecutan modos livianos como --tcp.
 */
export async function loadDriver<T = any>(packageName: string): Promise<T> {
  // 1. Intentar importación nativa estándar
  try {
    return (await import(packageName)) as T
  } catch (err: unknown) {
    const error = err as { code?: string }
    // 2. Si no se encuentra en el árbol local de hito-11, resolver a través de hito-10-api
    if (error && error.code === 'ERR_MODULE_NOT_FOUND') {
      try {
        const req = getHito10Require()
        const resolvedPath = req.resolve(packageName)
        const fileUrl = pathToFileURL(resolvedPath).href
        return (await import(fileUrl)) as T
      } catch (innerErr: unknown) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr)
        throw new Error(
          `Driver "${packageName}" no disponible en el entorno local: ${msg}`,
        )
      }
    }
    throw err
  }
}

export async function loadMongo() {
  const mod = await loadDriver('mongodb')
  return mod.MongoClient
}

export async function loadRedis() {
  const mod = await loadDriver('redis')
  return mod.createClient
}

export async function loadNeo4j() {
  const mod = await loadDriver('neo4j-driver')
  return mod.default || mod
}

export async function loadCassandra() {
  const mod = await loadDriver('cassandra-driver')
  return mod.default || mod
}

export async function loadIris() {
  const mod = await loadDriver('@intersystems/intersystems-iris-native')
  return mod
}
