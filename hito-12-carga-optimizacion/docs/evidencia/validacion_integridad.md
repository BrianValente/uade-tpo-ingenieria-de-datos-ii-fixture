# Reporte de Validación de Integridad Post-Carga (Hito 12)

- **Fecha de verificación:** `2026-10-30T12:59:46.151Z`
- **Objetivo de validación:** `post-carga`
- **Estado global:** **ÍNTEGRO — TODOS LOS CONTROLES APROBADOS** (8/8 controles exitosos)

## Matriz de Controles de Integridad (RF15, RNF4, §5.8)

| ID | Categoría | Control Ejecutado | Valor Esperado | Valor Observado | Resultado |
|:---|:---|:---|:---|:---|:---:|
| `INT-01` | MongoDB Documental | Unicidad y conteo de equipos participantes (sin duplicados ni pérdidas) | 64 equipos, 64 códigos únicos | 64 equipos, 64 códigos únicos | **CUMPLE (OK)** |
| `INT-02` | MongoDB Documental | Conteo exacto por plantel (24 jugadores/equipo) y rangos de atributos (dorsal 1..99, altura 150..220 cm) | 1536 jugadores totales, 64 planteles de 24, rangos válidos=true | 1536 jugadores totales, 64 planteles de 24=true, rangos válidos=true | **CUMPLE (OK)** |
| `INT-03` | Consistencia Cruzada MongoDB <-> Neo4j | Correspondencia 1 a 1 de UUID v5 entre equipos de MongoDB y nodos :Equipo de Neo4j | 64 coincidencias exactas de UUID v5 | 64 coincidencias exactas de UUID v5 | **CUMPLE (OK)** |
| `INT-04` | Neo4j Grafo | Integridad de conteos y distribución de eventos por partido (post-carga) | 32 partidos, 384 eventos enlazados (320 H12, min=12, max=12 por partido), 0 huérfanos, total grafo 384 | 32 partidos, 384 eventos (320 H12, min=12, max=12 por partido), 0 huérfanos, total grafo 384 | **CUMPLE (OK)** |
| `INT-05` | Redis Sesiones | Integridad de sesiones activas del lote (post-carga) | Exactamente 20 sesiones esperadas presentes con estado_acceso=autorizado y PTTL en (0, 1800000] | 20/20 sesiones válidas observadas (20/20 del lote identificadas) | **CUMPLE (OK)** |
| `INT-06` | Consistencia Fuente Operacional <-> Proyección Caché | Todas las proyecciones cacheadas coinciden exactamente con MongoDB y Neo4j (post-carga) | Al menos 1 clave activa cacheada; 100% con TTL > 0 y contenido íntegro verificado contra MongoDB y Neo4j | 157 claves activas en caché; 157 con TTL > 0; 157 íntegras | **CUMPLE (OK)** |
| `INT-07` | Contabilidad de Operaciones de Carga | Verificación de solicitudes generadas vs aceptadas vs validadas en Corrida Línea Base (resultados_linea_base.json) | generadas == exitosas + fallidas; 100% payloads HTTP 200 íntegros | generadas=2227, exitosas=2227, fallidas=0, íntegros=2227, corruptos=0 | **CUMPLE (OK)** |
| `INT-08` | Contabilidad de Operaciones de Carga | Verificación de solicitudes generadas vs aceptadas vs validadas en Corrida Optimizada (resultados_optimizados.json) | generadas == exitosas + fallidas; 100% payloads HTTP 200 íntegros | generadas=7129, exitosas=7129, fallidas=0, íntegros=7129, corruptos=0 | **CUMPLE (OK)** |

---
*Reporte generado automáticamente por `scripts/validar_integridad.ts` comprobando las bases reales y los artefactos de evidencia.*