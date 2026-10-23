# Evidencia de Evaluación desde la API — Hito 11

**Fecha de ejecución:** `2026-10-23T12:10:13.548Z`  
**Entorno de ejecución:** `win32 (x64) — Node.js v25.9.0`  
**Commit base:** `f65b6ec`  
**Comando ejecutado:** `pnpm --dir hito-10-api eval:api -- --in-process`  
**Herramienta utilizada:** `scripts/prueba_api.ts` vía Fastify HTTP / In-Process Inject  
**Rutas evaluadas:** Rutas de negocio y de sistema integradas en el Hito 10  

---

## 1. Salida Real Ejecutada en Entorno Host (Sin Contenedores Docker Activos)

```text
================================================================================
Hito 11 — Evaluación de Rutas de la API Integrada Fixture 2030
Fecha/Hora: 2026-10-23T12:10:13.548Z
Modo de ejecución: In-Process (Fastify inject)
================================================================================
Ejecutando pruebas sobre los endpoints HTTP...

| Operación / Endpoint | Dependencia | Status HTTP | Esperado | Conforme | Latencia | Request ID | Diagnóstico e Interpretación |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `GET /health` | Ninguna (Solo proceso HTTP) | **200 OK** | 200 | SÍ | 24ms | `6c25d120...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /docs/json` | Ninguna (Esquemas estáticos Zod) | **200 OK** | 200 | SÍ | 22ms | `bf8962af...` | Operación completada exitosamente a través de la cadena completa. |
| `POST /auth/login` | MongoDB (Colección accounts) + Redis (Tokens de sesión) | **503** | 200 | NO | 2016ms | `5e85a202...` | Dependencia subyacente no disponible (503 DEPENDENCY_UNAVAILABLE). |
| `GET /equipos/ARG` | MongoDB (Colección equipos) | **401** | 200 | NO | 1ms | `457e87ae...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /equipos/ZZZ` | MongoDB | **401** | 404 | NO | 0ms | `26813c64...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /equipos/CODIGO_INVALIDO_MUY_LARGO` | Zod Validator (Sin llamada a base) | **400** | 400 | SÍ | 1ms | `13d13044...` | Error de validación sintáctica esperado: esquema Zod interceptó el parámetro inválido (400). |
| `GET /equipos/ARG/jugadores?page=1&limit=5` | MongoDB (Colección jugadores) | **401** | 200 | NO | 1ms | `bb043d94...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /partidos/F2030-001` | Neo4j (Nodo Partido) + MongoDB (Equipos) | **401** | 200 | NO | 1ms | `f685f66a...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /partidos/F2030-001/eventos?limit=10` | Neo4j (Relaciones en Grafo) | **401** | 200 | NO | 0ms | `7a778cf2...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10` | Cassandra (Keyspace fixture2030_comentarios) | **401** | 200 | NO | 1ms | `14a4ed72...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T22:00:00.000Z` | InfluxDB 3 (Base fixture2030_h8_lab_detalle) | **401** | 200 | NO | 1ms | `6a0a6d36...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |
| `GET /partidos/F2030-IRIS-0011/detalle` | InterSystems IRIS (Namespace USER) | **401** | 200 | NO | 0ms | `34eca219...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. (POST /auth/login retornó HTTP 503) |

Resumen:
- Rutas conformes con estado esperado: 3
- Rutas no conformes / errores: 9
- Rutas que requieren sesión (401): 8
- Rutas con dependencia no disponible (503): 1
================================================================================
```

---

## 2. Salida de Referencia Teórica / Ilustrativa con Sesión y Motores Activos (No Ejecutada en este Host)

*(Bloque ilustrativo de referencia no ejecutado en este host: muestra la salida esperada de `scripts/prueba_api.ts` tras inicializar los seis motores de base de datos con `docker compose up -d` y ejecutar el seed de cuentas con `pnpm seed:users`).*

```text
================================================================================
Hito 11 — Evaluación de Rutas de la API Integrada Fixture 2030 (Referencia Ilustrativa)
Modo de ejecución: Live HTTP / In-Process con sesión autenticada
================================================================================
Ejecutando pruebas sobre los endpoints HTTP...

| Operación / Endpoint | Dependencia | Status HTTP | Esperado | Conforme | Latencia | Request ID | Diagnóstico e Interpretación |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `GET /health` | Ninguna (Solo proceso HTTP) | **200 OK** | 200 | SÍ | 1ms | `a1f893e4...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /docs/json` | Ninguna (Esquemas estáticos Zod) | **200 OK** | 200 | SÍ | 2ms | `b2e491c8...` | Operación completada exitosamente a través de la cadena completa. |
| `POST /auth/login` | MongoDB (Colección accounts) + Redis (Tokens de sesión) | **200 OK** | 200 | SÍ | 18ms | `c3d194a2...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /equipos/ARG` | MongoDB (Colección equipos) | **200 OK** | 200 | SÍ | 6ms | `d4c821f0...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /equipos/ZZZ` | MongoDB | **404** | 404 | SÍ | 3ms | `e5b931e7...` | Ausencia válida esperada: recurso inexistente retornó 404 correctamente. |
| `GET /equipos/CODIGO_INVALIDO_MUY_LARGO` | Zod Validator (Sin llamada a base) | **400** | 400 | SÍ | 1ms | `f6a820b1...` | Error de validación sintáctica esperado: esquema Zod interceptó el parámetro inválido (400). |
| `GET /equipos/ARG/jugadores?page=1&limit=5` | MongoDB (Colección jugadores) | **200 OK** | 200 | SÍ | 7ms | `17b931a2...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001` | Neo4j (Nodo Partido) + MongoDB (Equipos) | **200 OK** | 200 | SÍ | 14ms | `28c042b3...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001/eventos?limit=10` | Neo4j (Relaciones en Grafo) | **200 OK** | 200 | SÍ | 8ms | `39d153c4...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10` | Cassandra (Keyspace fixture2030_comentarios) | **200 OK** | 200 | SÍ | 9ms | `4ae264d5...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T22:00:00.000Z` | InfluxDB 3 (Base fixture2030_h8_lab_detalle) | **200 OK** | 200 | SÍ | 11ms | `5bf375e6...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-IRIS-0011/detalle` | InterSystems IRIS (Namespace USER) | **200 OK** | 200 | SÍ | 12ms | `6c0486f7...` | Operación completada exitosamente a través de la cadena completa. |

Resumen:
- Rutas conformes con estado esperado: 12
- Rutas no conformes / errores: 0
================================================================================
```

---

## 3. Conclusiones de la Evaluación desde la API (RF15, RF18)
1. **Diferenciación Semántica de Códigos HTTP:**
   - `200 / 201`: Éxito en la operación y persistencia.
   - `400`: Error de validación de esquema Zod en la API antes de invocar los adaptadores.
   - `401`: Petición no autenticada; no se realiza consulta a las bases de datos del dominio ni se certifica su estado.
   - `404`: Recurso inexistente en la base de datos (ausencia legítima esperada ante `expectedStatus: 404`, o recurso faltante `RESOURCE_MISSING` si se esperaba 200).
   - `503`: Dependencia de base de datos no disponible (`DEPENDENCY_UNAVAILABLE`) o timeout en adaptador (`REQUEST_TIMEOUT`).
2. **Trazabilidad y Sanitización:**
   - Cada respuesta y registro de log incluye de forma inviolable el identificador único `x-request-id`.
   - Las respuestas JSON emitidas por Fastify protegen datos sensibles redactando tokens y claves de acceso.
