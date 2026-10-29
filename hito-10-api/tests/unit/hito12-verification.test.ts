import { describe, expect, it } from 'vitest'

import { verifyPayloadIntegrity } from '../../../hito-12-carga-optimizacion/scripts/ejecutar_carga.js'

describe('Hito 12 - Verificación de Integridad de Payloads (H12-01, RF15, RNF4)', () => {
  it('aprueba un plantel íntegro de 24 jugadores únicos con su equipo y dorsales válidos', () => {
    const items = Array.from({ length: 24 }, (_, i) => ({
      id: `PLY-${String(i + 1).padStart(3, '0')}`,
      teamCode: 'ARG',
      name: `Jugador ${i + 1}`,
      dorsal: i + 1,
      position: 'Delantero',
    }))

    const valid = verifyPayloadIntegrity('team_players', 'ARG', {
      items,
      total: 24,
      page: 1,
      limit: 24,
    })
    expect(valid).toBe(true)
  })

  it('rechaza un plantel con 24 copias del mismo jugador (caso negativo H12-01)', () => {
    const singlePlayer = {
      id: 'PLY-001',
      teamCode: 'ARG',
      name: 'Jugador Duplicado',
      dorsal: 10,
      position: 'Delantero',
    }
    const duplicateItems = Array.from({ length: 24 }, () => ({ ...singlePlayer }))

    const valid = verifyPayloadIntegrity('team_players', 'ARG', {
      items: duplicateItems,
      total: 24,
      page: 1,
      limit: 24,
    })
    expect(valid).toBe(false)
  })

  it('rechaza un plantel con dorsales duplicados o fuera de rango [1, 99]', () => {
    const items = Array.from({ length: 24 }, (_, i) => ({
      id: `PLY-${String(i + 1).padStart(3, '0')}`,
      teamCode: 'ARG',
      name: `Jugador ${i + 1}`,
      dorsal: i === 23 ? 1 : i + 1, // dorsal 1 duplicado
      position: 'Delantero',
    }))

    expect(
      verifyPayloadIntegrity('team_players', 'ARG', {
        items,
        total: 24,
        page: 1,
        limit: 24,
      }),
    ).toBe(false)
  })

  it('rechaza un plantel donde algún jugador no pertenece al equipo consultado', () => {
    const items = Array.from({ length: 24 }, (_, i) => ({
      id: `PLY-${String(i + 1).padStart(3, '0')}`,
      teamCode: i === 0 ? 'BRA' : 'ARG', // Jugador infiltrado de otro equipo
      name: `Jugador ${i + 1}`,
      dorsal: i + 1,
      position: 'Delantero',
    }))

    expect(
      verifyPayloadIntegrity('team_players', 'ARG', {
        items,
        total: 24,
        page: 1,
        limit: 24,
      }),
    ).toBe(false)
  })

  it('rechaza eventos con IDs duplicados o pertenecientes a otro partido', () => {
    const validEvents = [
      { id: 'EVT-01', partidoId: 'F2030-001', tipo: 'GOL', minuto: 12 },
      { id: 'EVT-02', partidoId: 'F2030-001', tipo: 'TARJETA_AMARILLA', minuto: 34 },
    ]
    expect(
      verifyPayloadIntegrity('match_events', 'F2030-001', {
        items: validEvents,
        limit: 20,
      }),
    ).toBe(true)

    // Caso negativo: ID duplicado
    const duplicateEvents = [
      { id: 'EVT-01', partidoId: 'F2030-001', tipo: 'GOL', minuto: 12 },
      { id: 'EVT-01', partidoId: 'F2030-001', tipo: 'GOL', minuto: 15 },
    ]
    expect(
      verifyPayloadIntegrity('match_events', 'F2030-001', {
        items: duplicateEvents,
        limit: 20,
      }),
    ).toBe(false)

    // Caso negativo: evento de otro partido
    const wrongMatchEvents = [
      { id: 'EVT-01', partidoId: 'F2030-999', tipo: 'GOL', minuto: 12 },
    ]
    expect(
      verifyPayloadIntegrity('match_events', 'F2030-001', {
        items: wrongMatchEvents,
        limit: 20,
      }),
    ).toBe(false)
  })
})
