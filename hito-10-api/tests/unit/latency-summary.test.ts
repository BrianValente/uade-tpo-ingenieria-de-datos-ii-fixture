import { expect, it } from 'vitest'
import { summarizeLatency } from '../../scripts/latency-summary.js'

it('calcula media y p95 nearest-rank con 20 valores conocidos sin alterar las muestras', () => {
  const values = Array.from({ length: 20 }, (_, index) => 20 - index)
  expect(summarizeLatency(values)).toEqual({
    count: 20,
    minMs: 1,
    meanMs: 10.5,
    p95Ms: 19,
    maxMs: 20,
  })
  expect(values[0]).toBe(20)
})

it('rechaza conjuntos vacíos o duraciones que invalidarían una medición', () => {
  for (const values of [[], [NaN], [Infinity], [-1]])
    expect(() => summarizeLatency(values)).toThrow()
})
