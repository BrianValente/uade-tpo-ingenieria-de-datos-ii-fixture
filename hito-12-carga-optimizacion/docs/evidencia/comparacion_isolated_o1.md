# Comparación Experimental Aislada: Línea Base vs. ISOLATED_O1

Esta comparación evalúa el paquete O1 (pools, proyección y batching). No separa la contribución individual de sus tres cambios.

> **Política o paquete aplicado:** **Solo O1 (Pools & Proyecciones):** Pools ampliados a 25 en MongoDB y Neo4j, proyecciones BSON explícitas y lote $in. Caché Read-Aside desactivada (0 hits) y renovación de sesión por request.

- **Fecha corrida Línea Base:** `2026-11-06T18:42:56.624Z` (Commit `cd653d6`)
- **Fecha corrida Aislada:** `2026-11-06T18:43:22.515Z` (Commit `cd653d6`)
- **Condiciones invariantes:** Concurrencia = **24 VUs**, Semilla PRNG = `203012`, Duración = ~16.0 s, Distribución Pareto 80/20.

---

## 1. Comparación E2E observada

| Métrica E2E | Línea Base (`baseline`) | Prueba Aislada (`isolated_o1`) | Variación Observada | Interpretación |
|:---|---:|---:|---:|:---|
| **Throughput Sostenido** | 1103.48 ops/s | **1274 ops/s** | **+15.5 %** | Variación de caudal bajo el perfil configurado |
| **Latencia p50 (Mediana)** | 19.573 ms | **17.327 ms** | **-11.5 %** | Variación de mediana observada |
| **Latencia p95** | 31.381 ms | **24.791 ms** | **-21.0 %** | Variación de latencia de cola observada |
| **Tasa de Errores** | 0 % | **0 %** | 0.00 pp | Payloads íntegros: 20398/20398; errores de integridad: 0 |

---

## 2. Telemetría de Capas y Dependencias

| Capa / Motor | Métrica | Línea Base | Prueba Aislada | Variación |
|:---|:---|---:|---:|:---|
| **MongoDB** | Operaciones al motor | 31914 | **16363** | -48.7 % |
| **MongoDB** | Latencia p95 driver | 14.259 ms | **12.789 ms** | -10.3 % |
| **Neo4j** | Operaciones Cypher | 10639 | **12249** | +15.1 % |
| **Neo4j** | Latencia p95 driver | 7.867 ms | **7.998 ms** | +1.7 % |
| **Redis Sesión** | Escrituras HSET ejecutadas | 17669 | **20398** | -2729 escrituras omitidas |
| **Redis Caché** | Hit ratio | 0 % | **0 %** | 0 hits / 0 misses |
