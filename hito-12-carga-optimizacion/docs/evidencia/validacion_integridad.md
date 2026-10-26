# Reporte de Validación de Integridad Post-Carga (Hito 12)

- **Fecha de verificación:** `2026-10-26T21:09:21.930Z`
- **Estado global:** **ÍNTEGRO — TODOS LOS CONTROLES APROBADOS** (8/8 controles exitosos)

## Matriz de Controles de Integridad (RF15, RNF4, §5.8)

| ID | Categoría | Control Ejecutado | Valor Esperado | Valor Observado | Resultado |
|:---|:---|:---|:---|:---|:---:|
| `INT-01` | MongoDB Documental | Unicidad y conteo de equipos participantes (sin duplicados ni pérdidas) | 64 equipos, 64 códigos únicos | 64 equipos, 64 códigos únicos | **CUMPLE (OK)** |
| `INT-02` | MongoDB Documental | Conteo exacto por plantel (24 jugadores/equipo) y rangos de atributos (dorsal 1..99, altura 150..220 cm) | 1536 jugadores totales, 64 planteles de 24, rangos válidos=true | 1536 jugadores totales, 64 planteles de 24=true, rangos válidos=true | **CUMPLE (OK)** |
| `INT-03` | Consistencia Cruzada MongoDB <-> Neo4j | Correspondencia 1 a 1 de UUID v5 entre equipos de MongoDB y nodos :Equipo de Neo4j | 64 coincidencias exactas de UUID v5 | 64 coincidencias exactas de UUID v5 | **CUMPLE (OK)** |
| `INT-04` | Neo4j Grafo | Integridad de conteos y distribución de eventos por partido (sin duplicados ni eventos huérfanos) | 32 partidos; 384 eventos (12/partido con lote H12) o 64 eventos (2/partido limpio) | 32 partidos; 384 eventos (320 H12; min=12, max=12 por partido) | **CUMPLE (OK)** |
| `INT-05` | Redis Sesiones | Integridad de sesiones activas y preservación de TTL tras renovaciones concurrentes | Todas las sesiones presentes tienen estado_acceso=autorizado y PTTL en (0, 1800000] | 20/20 sesiones válidas con TTL activo | **CUMPLE (OK)** |
| `INT-06` | Consistencia Fuente Operacional <-> Proyección Caché | Todas las proyecciones cacheadas en Redis tienen TTL positivo y coinciden exactamente con MongoDB y Neo4j | 149/149 claves con TTL > 0 y contenido íntegro respecto de la fuente | 149/149 con TTL > 0; 149/149 consistentes con MongoDB/Neo4j | **CUMPLE (OK)** |
| `INT-07` | Contabilidad de Operaciones de Carga | Verificación de solicitudes generadas vs aceptadas vs validadas en Corrida Línea Base (resultados_linea_base.json) | generadas == exitosas + fallidas; 100% payloads HTTP 200 íntegros | generadas=635, exitosas=566, fallidas=69, íntegros=566, corruptos=0 | **CUMPLE (OK)** |
| `INT-08` | Contabilidad de Operaciones de Carga | Verificación de solicitudes generadas vs aceptadas vs validadas en Corrida Optimizada (resultados_optimizados.json) | generadas == exitosas + fallidas; 100% payloads HTTP 200 íntegros | generadas=4439, exitosas=4439, fallidas=0, íntegros=4439, corruptos=0 | **CUMPLE (OK)** |

---
*Reporte generado automáticamente por `scripts/validar_integridad.ts` comprobando las bases reales y los artefactos de evidencia.*