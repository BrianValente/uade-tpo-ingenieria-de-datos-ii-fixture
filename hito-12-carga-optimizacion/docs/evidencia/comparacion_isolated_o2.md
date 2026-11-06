# Comparación Experimental Aislada: Línea Base vs. ISOLATED_O2

Esta comparación cambia solo una política respecto de la línea base; los valores observados pertenecen a este laboratorio y no establecen capacidad de producción.

> **Política o paquete aplicado:** **Solo O2 (Caché Read-Aside):** Caché Read-Aside en Redis activa con TTLs. Pools en 5 y sin throttling de sesión.

- **Fecha corrida Línea Base:** `2026-11-06T18:42:56.624Z` (Commit `cd653d6`)
- **Fecha corrida Aislada:** `2026-11-06T18:43:48.278Z` (Commit `cd653d6`)
- **Condiciones invariantes:** Concurrencia = **24 VUs**, Semilla PRNG = `203012`, Duración = ~16.0 s, Distribución Pareto 80/20.

---

## 1. Comparación E2E observada

| Métrica E2E | Línea Base (`baseline`) | Prueba Aislada (`isolated_o2`) | Variación Observada | Interpretación |
|:---|---:|---:|---:|:---|
| **Throughput Sostenido** | 1103.48 ops/s | **4028.12 ops/s** | **+265.0 %** | Variación de caudal bajo el perfil configurado |
| **Latencia p50 (Mediana)** | 19.573 ms | **5.232 ms** | **-73.3 %** | Variación de mediana observada |
| **Latencia p95** | 31.381 ms | **9.539 ms** | **-69.6 %** | Variación de latencia de cola observada |
| **Tasa de Errores** | 0 % | **0 %** | 0.00 pp | Payloads íntegros: 64462/64462; errores de integridad: 0 |

---

## 2. Telemetría de Capas y Dependencias

| Capa / Motor | Métrica | Línea Base | Prueba Aislada | Variación |
|:---|:---|---:|---:|:---|
| **MongoDB** | Operaciones al motor | 31914 | **2** | -100.0 % |
| **MongoDB** | Latencia p95 driver | 14.259 ms | **7.056 ms** | -50.5 % |
| **Neo4j** | Operaciones Cypher | 10639 | **37** | -99.7 % |
| **Neo4j** | Latencia p95 driver | 7.867 ms | **11.47 ms** | +45.8 % |
| **Redis Sesión** | Escrituras HSET ejecutadas | 17669 | **64462** | -46793 escrituras omitidas |
| **Redis Caché** | Hit ratio | 0 % | **99.94 %** | 64423 hits / 39 misses |
