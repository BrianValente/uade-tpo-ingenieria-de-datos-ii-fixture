export function summarizeLatency(samples: readonly number[]) {
  if (
    samples.length === 0 ||
    samples.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error('La medición requiere duraciones finitas y no negativas.')
  }
  const sorted = [...samples].sort((left, right) => left - right)
  const round = (value: number) => Math.round(value * 1000) / 1000
  return {
    count: samples.length,
    minMs: round(sorted[0]!),
    meanMs: round(
      samples.reduce((sum, value) => sum + value, 0) / samples.length,
    ),
    p95Ms: round(sorted[Math.ceil(0.95 * sorted.length) - 1]!),
    maxMs: round(sorted.at(-1)!),
  }
}
