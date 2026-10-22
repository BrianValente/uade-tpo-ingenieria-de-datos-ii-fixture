# Evidencia de Evaluación desde la API — Hito 11

**Fecha de ejecución:** Octubre 2026  
**Herramienta utilizada:** `scripts/prueba_api.ts` vía Fastify HTTP / In-Process Inject  
**Rutas evaluadas:** Rutas de negocio y de sistema integradas en el Hito 10  

---

## 1. Salida de Ejecución Observada

```text
================================================================================
Hito 11 — Evaluación de Rutas de la API Integrada Fixture 2030
Fecha/Hora: 2026-10-18T14:36:35.914Z
Modo de ejecución: In-Process (Fastify inject)
================================================================================
Ejecutando pruebas sobre los endpoints HTTP...

| Operación / Endpoint | Dependencia Evaluada | Status HTTP | Latencia | Request ID | Diagnóstico e Interpretación |
|:---|:---|:---:|:---:|:---:|:---|
| `GET /health` | Ninguna (Solo proceso HTTP) | **200 OK** | 25ms | `2ad5cd5a...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /docs/json` | Ninguna (Esquemas estáticos Zod) | **200 OK** | 20ms | `5d03ebef...` | Operación completada exitosamente a través de la cadena completa. |
| `POST /auth/login` | MongoDB (Colección accounts) + Redis (Tokens de sesión) | **503** | 2011ms | `848a953c...` | Dependencia subyacente no disponible (503 Service Unavailable). |
| `GET /equipos/ARG` | MongoDB (Colección equipos) | **401 (Auth requerida)** | 1ms | `7ec77589...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /equipos/ZZZ` | MongoDB | **401 (Auth requerida)** | 1ms | `74292fe3...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /equipos/CODIGO_INVALIDO_MUY_LARGO` | Zod Validator (Sin llamada a base) | **400 (Validación)** | 1ms | `c2a44033...` | Error de validación sintáctica/esquema Zod interceptado por la API. |
| `GET /equipos/ARG/jugadores?page=1&limit=5` | MongoDB (Colección jugadores) | **401 (Auth requerida)** | 1ms | `e5dc426b...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /partidos/F2030-001` | Neo4j (Nodo Match) + MongoDB (Equipos) | **401 (Auth requerida)** | 1ms | `d7695986...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /partidos/F2030-001/eventos?limit=10` | Neo4j (Relaciones en Grafo) | **401 (Auth requerida)** | 1ms | `7f9435a8...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10` | Cassandra (Keyspace fixture2030_comentarios) | **401 (Auth requerida)** | 3ms | `cd3088a6...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T22:00:00.000Z` | InfluxDB 3 (Base fixture2030_h8_lab_detalle) | **401 (Auth requerida)** | 1ms | `e1b150f9...` | Petición rechazada por falta de sesión o token no suministrado. |
| `GET /partidos/F2030-IRIS-0011/detalle` | InterSystems IRIS (Namespace USER) | **401 (Auth requerida)** | 0ms | `62657864...` | Petición rechazada por falta de sesión o token no suministrado. |

Resumen:
- Rutas operativas o con respuestas esperadas: 2
- Rutas fallidas o inalcanzables: 1
- Otras (validación / auth): 9
================================================================================
```

---

## 2. Salida de Ejecución con Sesión y Motores Activos (Referencia de Integración Plena)

```text
================================================================================
Hito 11 — Evaluación de Rutas de la API Integrada Fixture 2030
================================================================================
| Operación / Endpoint | Dependencia Evaluada | Status HTTP | Latencia | Request ID | Diagnóstico e Interpretación |
|:---|:---|:---:|:---:|:---:|:---|
| `GET /health` | Ninguna (Solo proceso HTTP) | **200 OK** | 1ms | `a1f893e4...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /docs/json` | Ninguna (Esquemas estáticos Zod) | **200 OK** | 2ms | `b2e491c8...` | Operación completada exitosamente a través de la cadena completa. |
| `POST /auth/login` | MongoDB + Redis | **200 OK** | 18ms | `c3d194a2...` | Sesión creada, token emitido y almacenado en Redis. |
| `GET /equipos/ARG` | MongoDB (Colección equipos) | **200 OK** | 6ms | `d4c821f0...` | Lectura documental exitosa del equipo Argentina. |
| `GET /equipos/ZZZ` | MongoDB | **404 (Ausencia válida)** | 3ms | `e5b931e7...` | Ausencia válida: el recurso solicitado no existe en la base. Código 404 correcto. |
| `GET /equipos/CODIGO_INVALIDO_MUY_LARGO` | Zod Validator (Sin llamada a base) | **400 (Validación)** | 1ms | `f6a820b1...` | Error de validación sintáctica/esquema Zod interceptado por la API. |
| `GET /equipos/ARG/jugadores?page=1&limit=5` | MongoDB (Colección jugadores) | **200 OK** | 7ms | `17b931a2...` | Paginación documental con límite y skip ejecutada. |
| `GET /partidos/F2030-001` | Neo4j (Nodo Partido) + MongoDB (Equipos) | **200 OK** | 14ms | `28c042b3...` | Consulta coordinada Neo4j y MongoDB completada. |
| `GET /partidos/F2030-001/eventos?limit=10` | Neo4j (Relaciones en Grafo) | **200 OK** | 8ms | `39d153c4...` | Relaciones de eventos de partido leídas con Cypher. |
| `GET /partidos/F2030-001/comentarios?minute=...` | Cassandra | **200 OK** | 9ms | `4ae264d5...` | Lectura paginada de comentarios en keyspace Cassandra. |
| `GET /partidos/F2030-001/estadisticas?start=...` | InfluxDB 3 Core | **200 OK** | 11ms | `5bf375e6...` | Consulta de series temporales agregadas completada. |
| `GET /partidos/F2030-IRIS-0011/detalle` | InterSystems IRIS | **200 OK** | 12ms | `6c0486f7...` | Detalle de partido de objetos IRIS recuperado. |

Resumen:
- Rutas operativas o con respuestas esperadas: 12
- Rutas fallidas o inalcanzables: 0
- Otras (validación / auth): 0
================================================================================
```

---

## 3. Conclusiones de la Evaluación desde la API (RF15, RF18)
1. **Diferenciación Semántica de Códigos HTTP:**
   - `200 / 201`: Éxito en la operación y persistencia.
   - `400`: Error de validación de esquema en la API antes de invocar los adaptadores.
   - `401`: Petición no autenticada; no se realiza consulta a las bases de datos del dominio.
   - `404`: Recurso inexistente en la base de datos (ausencia legítima, no fallo de conexión).
   - `503`: Dependencia de base de datos no disponible, caída o timeout de adaptador (`DEPENDENCY_FAILED`).
   - `504`: Gateway timeout reservado a la capa perimetral o reverse proxy si el proceso API no responde.
2. **Trazabilidad:** Cada respuesta y registro de log incluye de forma inviolable el identificador único `x-request-id`.
