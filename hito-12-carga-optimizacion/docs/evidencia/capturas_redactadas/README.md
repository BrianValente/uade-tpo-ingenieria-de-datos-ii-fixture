# Capturas y Evidencia Redactada — Hito 12

Este directorio forma parte de la estructura de evidencia exigida en la Sección 9 del **Hito 12** (`docs/evidencia/capturas_redactadas/`).

---

## 1. Artefactos de Evidencia Verificables Generados en `docs/evidencia/`

Toda la evidencia de ejecución del Hito 12 fue generada mediante scripts automatizados sobre los contenedores Docker reales (`fixture2030-mongodb-1`, `fixture2030-neo4j-1`, `fixture2030-redis-1`) y sanitizada automáticamente para impedir cualquier filtración de contraseñas, tokens Bearer o URIs con secretos (RNF8):

1. **[`../resultados_linea_base.md`](../resultados_linea_base.md)** y **[`../resultados_linea_base.json`](../resultados_linea_base.json):**
   - Captura completa de la corrida de **Línea Base (`baseline`)** con 24 usuarios virtuales concurrentes, incluyendo distribución de latencias (`min`, `media`, `stdDev`, `p50`, `p90`, `p95`, `p99`, `max`), separación por claves calientes (80 %) y frías (20 %), telemetría interna por motor NoSQL y estadísticas de contenedores Docker (`docker stats --no-stream`).
2. **[`../resultados_optimizados.md`](../resultados_optimizados.md)** y **[`../resultados_optimizados.json`](../resultados_optimizados.json):**
   - Captura completa de la corrida con las **tres optimizaciones activas (`optimized`)**: ampliación de pools (`5 -> 25`) + proyección/batching `$in` (O1), caché Read-Aside en Redis con TTL diferenciado (O2) y amortización de escrituras de renovación de sesión en Redis (O3).
3. **[`../tablas_o_graficos.md`](../tablas_o_graficos.md):**
   - Tablas comparativas Antes vs. Después, variaciones porcentuales por endpoint y gráficos `xychart-beta` de Mermaid para percentiles de latencia y throughput.
4. **[`../validacion_integridad.md`](../validacion_integridad.md)** y **[`../validacion_integridad.json`](../validacion_integridad.json):**
   - Auditoría automatizada de 8 controles de integridad (conteos documentales, integridad referencial en grafo, correspondencia 1:1 de UUID v5 MongoDB-Neo4j, validez de TTL y consistencia exacta entre proyecciones en caché Redis y fuentes operacionales).

---

## 2. Política de Redacción de Secretos (RNF8)

- Ningún archivo dentro de `docs/evidencia/` ni `capturas_redactadas/` contiene valores de `MONGO_ROOT_PASSWORD`, `NEO4J_PASSWORD`, `INFLUXDB_TOKEN`, `API_SEED_*_PASSWORD` ni tokens de sesión en texto plano.
- Para regenerar todos los artefactos en cualquier entorno local, seguir los comandos de reproducción del [`README.md`](../../README.md).
