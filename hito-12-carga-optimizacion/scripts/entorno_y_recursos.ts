import { execFileSync, execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { arch, cpus, freemem, platform, release, totalmem } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

/**
 * Utilidades de entorno, sanitización (RNF8), captura de recursos del host y
 * contenedores Docker (RF4, RF5, RF6) y cálculo estadístico de percentiles (RNF5).
 */

export interface EnvironmentMetadata {
  timestamp: string
  gitCommit: string
  gitBranch: string
  gitTreeState: 'clean' | 'modified'
  host: {
    platform: string
    release: string
    arch: string
    cpuModel: string
    logicalCpus: number
    totalMemoryGiB: number
    freeMemoryGiB: number
    nodeVersion: string
  }
  products: {
    mongodbVersion: string
    neo4jVersion: string
    redisVersion: string
    fastifyVersion: string
  }
}

export interface ProcessResourceSnapshot {
  rssMiB: number
  heapUsedMiB: number
  heapTotalMiB: number
  externalMiB: number
  cpuUserMs: number
  cpuSystemMs: number
}

export interface ContainerResourceStat {
  container: string
  cpuPercent: string
  memUsage: string
  memPercent: string
  netIO: string
  blockIO: string
}

export interface RedisEngineMetrics {
  usedMemoryHuman: string
  usedMemoryBytes: number
  maxMemoryHuman: string
  connectedClients: number
  totalCommandsProcessed: number
  keyspaceHits: number
  keyspaceMisses: number
  expiredKeys: number
  evictedKeys: number
}

export interface LatencyDistribution {
  count: number
  minMs: number
  avgMs: number
  stdDevMs: number
  p50Ms: number
  p90Ms: number
  p95Ms: number
  p99Ms: number
  maxMs: number
  buckets: {
    under2ms: number
    from2To5ms: number
    from5To10ms: number
    from10To25ms: number
    from25To50ms: number
    from50To100ms: number
    over100ms: number
  }
}

export function sanitizeSecrets(text: string): string {
  if (!text) return ''
  return text
    .replace(/(:\/\/)([^:@'"]*):([^@'"]*)@/g, '$1$2:******@')
    .replace(/Bearer\s+([A-Za-z0-9_\-.~+/]+=*)/gi, 'Bearer ******')
    .replace(/("accessToken"\s*:\s*")([^"]+)(")/gi, '$1******$3')
    .replace(/("password"\s*:\s*")([^"]+)(")/gi, '$1******$3')
    .replace(/([?&](?:token|password|auth|secret)=)([^&\s]+)/gi, '$1******')
}

export async function loadLocalEnvironment(): Promise<Record<string, string | undefined>> {
  const env: Record<string, string | undefined> = { ...process.env }

  const candidatePaths = [
    new URL('../../hito-10-api/.env', import.meta.url),
    new URL('../../.env', import.meta.url),
    new URL('../config/configuracion-ejemplo.env', import.meta.url),
  ]

  for (const url of candidatePaths) {
    try {
      const content = await readFile(url, 'utf8')
      const parsed = parseEnv(content)
      for (const [k, v] of Object.entries(parsed)) {
        if ((env[k] === undefined || env[k] === '') && v !== undefined && v !== '') {
          env[k] = v
        }
      }
    } catch {
      /* El archivo opcional puede no existir en CI o clon limpio. */
    }
  }

  return env
}

export function getGitCommitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'unknown'
  }
}

export function getGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'unknown'
  }
}

export function getGitTreeState(): 'clean' | 'modified' {
  try {
    const out = execSync('git status --porcelain', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out === '' ? 'clean' : 'modified'
  } catch {
    return 'clean'
  }
}

function resolveContainerName(candidates: string[]): string | null {
  for (const name of candidates) {
    try {
      execFileSync('docker', ['inspect', '--type=container', name], {
        stdio: ['ignore', 'ignore', 'ignore'],
        timeout: 2000,
      })
      return name
    } catch {
      /* proximo alias */
    }
  }
  return null
}

function safeDockerExecVersion(candidates: string[], args: string[]): string {
  const container = resolveContainerName(candidates)
  if (!container) return 'no-disponible'
  try {
    const out = execFileSync('docker', ['exec', container, ...args], {
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out.split(/\r?\n/)[0]?.trim() || 'unknown'
  } catch {
    return 'no-disponible'
  }
}

export function collectEnvironmentMetadata(): EnvironmentMetadata {
  const cpuList = cpus()
  return {
    timestamp: new Date().toISOString(),
    gitCommit: getGitCommitSha(),
    gitBranch: getGitBranch(),
    gitTreeState: getGitTreeState(),
    host: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpuModel: cpuList[0]?.model?.trim() || 'Unknown CPU',
      logicalCpus: cpuList.length,
      totalMemoryGiB: Math.round((totalmem() / 2 ** 30) * 100) / 100,
      freeMemoryGiB: Math.round((freemem() / 2 ** 30) * 100) / 100,
      nodeVersion: process.version,
    },
    products: {
      mongodbVersion: safeDockerExecVersion(['fixture2030-mongodb-1', 'fixture2030_mongodb_1', 'mongodb'], [
        'mongod',
        '--version',
      ]),
      neo4jVersion: safeDockerExecVersion(['fixture2030-neo4j-1', 'fixture2030_neo4j_1', 'neo4j'], [
        'cypher-shell',
        '--version',
      ]),
      redisVersion: safeDockerExecVersion(['fixture2030-redis-1', 'fixture2030_redis_1', 'redis'], [
        'redis-server',
        '--version',
      ]),
      fastifyVersion: '5.12.7',
    },
  }
}

export function takeProcessSnapshot(
  previousCpu?: NodeJS.CpuUsage,
): { snapshot: ProcessResourceSnapshot; rawCpu: NodeJS.CpuUsage } {
  const mem = process.memoryUsage()
  const cpu = process.cpuUsage(previousCpu)
  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    rawCpu: process.cpuUsage(),
    snapshot: {
      rssMiB: round2(mem.rss / 2 ** 20),
      heapUsedMiB: round2(mem.heapUsed / 2 ** 20),
      heapTotalMiB: round2(mem.heapTotal / 2 ** 20),
      externalMiB: round2(mem.external / 2 ** 20),
      cpuUserMs: round2(cpu.user / 1000),
      cpuSystemMs: round2(cpu.system / 1000),
    },
  }
}

export function collectDockerContainerStats(): ContainerResourceStat[] {
  const candidateList = [
    ['fixture2030-mongodb-1', 'fixture2030_mongodb_1', 'mongodb'],
    ['fixture2030-neo4j-1', 'fixture2030_neo4j_1', 'neo4j'],
    ['fixture2030-redis-1', 'fixture2030_redis_1', 'redis'],
  ]
  const containers = candidateList.map(c => resolveContainerName(c)).filter((c): c is string => Boolean(c))
  try {
    const out = execFileSync(
      'docker',
      [
        'stats',
        '--no-stream',
        '--format',
        '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}',
        ...containers,
      ],
      {
        encoding: 'utf8',
        timeout: 6000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim()
    if (!out) return []
    return out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [container = '', cpuPercent = '', memUsage = '', memPercent = '', netIO = '', blockIO = ''] =
          line.split('|')
        return {
          container: container.trim(),
          cpuPercent: cpuPercent.trim(),
          memUsage: memUsage.trim(),
          memPercent: memPercent.trim(),
          netIO: netIO.trim(),
          blockIO: blockIO.trim(),
        }
      })
  } catch {
    return []
  }
}

export function collectRedisEngineMetrics(): RedisEngineMetrics | null {
  try {
    const out = execFileSync(
      'docker',
      ['exec', resolveContainerName(['fixture2030-redis-1', 'fixture2030_redis_1', 'redis']) || 'fixture2030-redis-1', 'redis-cli', 'INFO'],
      {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    const map = new Map<string, string>()
    for (const line of out.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue
      const idx = line.indexOf(':')
      if (idx > 0) {
        map.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim())
      }
    }
    return {
      usedMemoryHuman: map.get('used_memory_human') ?? '0B',
      usedMemoryBytes: Number(map.get('used_memory') ?? 0),
      maxMemoryHuman: map.get('maxmemory_human') ?? '256.00M',
      connectedClients: Number(map.get('connected_clients') ?? 0),
      totalCommandsProcessed: Number(map.get('total_commands_processed') ?? 0),
      keyspaceHits: Number(map.get('keyspace_hits') ?? 0),
      keyspaceMisses: Number(map.get('keyspace_misses') ?? 0),
      expiredKeys: Number(map.get('expired_keys') ?? 0),
      evictedKeys: Number(map.get('evicted_keys') ?? 0),
    }
  } catch {
    return null
  }
}

function nearestRank(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0
  const index = Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  return sorted[index] ?? 0
}

export function calculateLatencyDistribution(samplesMs: number[]): LatencyDistribution {
  const round3 = (n: number) => Math.round(n * 1000) / 1000
  if (samplesMs.length === 0) {
    return {
      count: 0,
      minMs: 0,
      avgMs: 0,
      stdDevMs: 0,
      p50Ms: 0,
      p90Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      buckets: {
        under2ms: 0,
        from2To5ms: 0,
        from5To10ms: 0,
        from10To25ms: 0,
        from25To50ms: 0,
        from50To100ms: 0,
        over100ms: 0,
      },
    }
  }
  const sorted = [...samplesMs].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, v) => acc + v, 0)
  const avg = sum / sorted.length
  const variance =
    sorted.reduce((acc, v) => acc + (v - avg) ** 2, 0) / sorted.length
  const stdDev = Math.sqrt(variance)

  const buckets = {
    under2ms: 0,
    from2To5ms: 0,
    from5To10ms: 0,
    from10To25ms: 0,
    from25To50ms: 0,
    from50To100ms: 0,
    over100ms: 0,
  }
  for (const s of sorted) {
    if (s < 2) buckets.under2ms++
    else if (s < 5) buckets.from2To5ms++
    else if (s < 10) buckets.from5To10ms++
    else if (s < 25) buckets.from10To25ms++
    else if (s < 50) buckets.from25To50ms++
    else if (s < 100) buckets.from50To100ms++
    else buckets.over100ms++
  }

  return {
    count: sorted.length,
    minMs: round3(sorted[0] ?? 0),
    avgMs: round3(avg),
    stdDevMs: round3(stdDev),
    p50Ms: round3(nearestRank(sorted, 50)),
    p90Ms: round3(nearestRank(sorted, 90)),
    p95Ms: round3(nearestRank(sorted, 95)),
    p99Ms: round3(nearestRank(sorted, 99)),
    maxMs: round3(sorted.at(-1) ?? 0),
    buckets,
  }
}

export const HITO12_ROOT = fileURLToPath(new URL('../', import.meta.url))
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
