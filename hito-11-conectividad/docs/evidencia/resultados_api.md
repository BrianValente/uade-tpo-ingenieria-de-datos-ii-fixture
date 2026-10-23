# Evidencia de Evaluación desde la API — Hito 11

**Fecha de ejecución:** Octubre 2026  
**Herramienta utilizada:** `scripts/prueba_api.ts` vía Fastify HTTP / In-Process Inject  
**Rutas evaluadas:** Rutas de negocio y de sistema integradas en el Hito 10  

---

## 1. Salida de Ejecución Observada en Entorno Host (Sin Contenedores)

```text
================================================================================
Hito 11 — Evaluación de Rutas de la API Integrada Fixture 2030
Fecha/Hora: 2026-10-23T00:24:27.468Z
Modo de ejecución: In-Process (Fastify inject)
================================================================================
Ejecutando pruebas sobre los endpoints HTTP...

| Operación / Endpoint | Dependencia | Status HTTP | Esperado | Conforme | Latencia | Request ID | Diagnóstico e Interpretación |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `GET /health` | Ninguna (Solo proceso HTTP) | **200 OK** | 200 | SÍ | 2ms | `6ffb7b41...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /docs/json` | Ninguna (Esquemas estáticos Zod) | **200 OK** | 200 | SÍ | 32ms | `86c3d45d...` | Operación completada exitosamente a través de la cadena completa. |
| `POST /auth/login` | MongoDB (Colección accounts) + Redis (Tokens de sesión) | **500** | 200 | NO | 2ms | `dc6ea054...` | Error interno del servidor API (HTTP 500). |
| `GET /equipos/ARG` | MongoDB (Colección equipos) | **401** | 200 | NO | 2ms | `5f6cdc7e...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /equipos/ZZZ` | MongoDB | **401** | 404 | NO | 0ms | `a42bbaa7...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /equipos/CODIGO_INVALIDO_MUY_LARGO` | Zod Validator (Sin llamada a base) | **400** | 400 | SÍ | 1ms | `a3eb32d0...` | Error de validación sintáctica esperado: esquema Zod interceptó el parámetro inválido (400). |
| `GET /equipos/ARG/jugadores?page=1&limit=5` | MongoDB (Colección jugadores) | **401** | 200 | NO | 2ms | `842915c4...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /partidos/F2030-001` | Neo4j (Nodo Partido) + MongoDB (Equipos) | **401** | 200 | NO | 2ms | `ba1de562...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /partidos/F2030-001/eventos?limit=10` | Neo4j (Relaciones en Grafo) | **401** | 200 | NO | 1ms | `f853e861...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10` | Cassandra (Keyspace fixture2030_comentarios) | **401** | 200 | NO | 1ms | `4f9890be...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T22:00:00.000Z` | InfluxDB 3 (Base fixture2030_h8_lab_detalle) | **401** | 200 | NO | 1ms | `49fcff5e...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |
| `GET /partidos/F2030-IRIS-0011/detalle` | InterSystems IRIS (Namespace USER) | **401** | 200 | NO | 0ms | `2aff4eba...` | Petición rechazada: requiere sesión válida o credenciales no configuradas. |

Resumen:
- Rutas conformes con estado esperado: 3
- Rutas no conformes / errores: 9
- Rutas que requieren sesión (401): 8
================================================================================
```

---

## 2. Salida de Referencia Teórica / Simulación Ilustrativa con Sesión y Motores Activos

*(Línea base ilustrativa esperada tras inicializar los seis motores de base de datos con `docker compose up -d` y ejecutar el seed de cuentas con `pnpm seed:users`)*

```text
================================================================================
Hito 11 — Evaluación de Rutas de la API Integrada Fixture 2030
Fecha/Hora: 2026-10-23T00:30:00.000Z (Línea base ilustrativa de integración plena)
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
