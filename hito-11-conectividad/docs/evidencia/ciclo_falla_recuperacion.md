# Evidencia de Simulación Híbrida In-Process de Falla y Retorno en la API — Hito 11

**Fecha de generación:** 2026-10-23T15:22:57.360Z  
**Entorno:** win32 (x64) — Node.js v25.9.0  
**Commit base:** `e3f382c`  
**Comando ejecutado:** `pnpm --dir hito-10-api exec tsx ../hito-11-conectividad/scripts/prueba_falla_controlada.ts --output=../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion.md`  
**Naturaleza de la prueba:** **Simulación híbrida in-process** sobre instancia real de Fastify (`buildServer`) y `registerErrorHandler`.  

## Alcance y Límites de la Simulación Híbrida (RNF17, RNF18)

- **Partes simuladas (dobles en memoria):** La autorización Bearer (`authModule`) y las respuestas `200 OK` de las **Etapas 1 y 3** son servidas por dobles en memoria que devuelven una entidad `ARG` fija y registran un evento explícitamente rotulado como `source: "in-memory-double"`. **No leen ni reconectan una instancia real de MongoDB.**
- **Parte ejercida contra adaptador y driver reales:** Únicamente la **Etapa 2** invoca una instancia real de `MongoDocumentRepository` (y el driver oficial `mongodb`) apuntando al puerto local sin listener `127.0.0.1:27099` (`DEPENDENCY_TIMEOUT_MS=500ms`), provocando un `MongoServerSelectionError` (`ECONNREFUSED`) real que atraviesa `DataService` y `registerErrorHandler` hasta responder `HTTP 503 DEPENDENCY_UNAVAILABLE`.
- **Límite explícito de la conclusión:** Esta prueba certifica exclusivamente el contrato HTTP de degradación controlada (`503 DEPENDENCY_UNAVAILABLE`), la correlación de `x-request-id`, el formato de logs Pino y que el servidor Fastify continúa procesando peticiones tras un rechazo del adaptador. **No comprueba restauración del servicio MongoDB, lectura de datos persistidos ni conservación de volúmenes** (cuya verificación requiere un motor MongoDB activo según la guía operativa de `docs/diagnostico_de_fallas.md` §3.2).

## Resumen del Ciclo Híbrido Ejecutado

| Etapa | Endpoint | Mecanismo Activo | HTTP Status | Request ID (`x-request-id`) | Latencia | Resultado Observado |
|:---|:---|:---|:---:|:---|:---:|:---|
| 1. Estado Inicial Simulado en API (Doble en memoria -> HTTP 200 OK) | `GET /equipos/ARG` | Doble en memoria (entidad ARG fija y sesión simulada; sin conexión a MongoDB) | **200 OK** | `f2aa6f94-9fd1-42b1-b5a7-1469c8e81522` | 218ms | Respuesta 200 OK desde doble en memoria (entidad `ARG` fija; sin lectura real a MongoDB) |
| 2. Falla de Conexión Real en Adaptador (MongoDocumentRepository contra 127.0.0.1:27099 -> HTTP 503 DEPENDENCY_UNAVAILABLE) | `GET /equipos/ARG` | Adaptador real MongoDocumentRepository + driver mongodb contra 127.0.0.1:27099 sin listener (timeout 500ms) | **503 Service Unavailable** | `75e22946-bebf-40c2-98ff-302b39a83b7e` | 520ms | Degradación controlada (`DEPENDENCY_UNAVAILABLE`) tras rechazo TCP real en `MongoDocumentRepository` |
| 3. Retorno Simulado en API al Conmutar Doble (Doble en memoria -> HTTP 200 OK) | `GET /equipos/ARG` | Conmutación al doble en memoria sin reiniciar Fastify (no reconecta ni lee MongoDB real) | **200 OK** | `cfb049c4-8aa7-4092-b837-ec5fb552a8a3` | 1ms | Respuesta 200 OK desde doble en memoria (entidad `ARG` fija; sin lectura real a MongoDB) |

## Detalle por Etapa (Cuerpos HTTP y Logs Estructurados Pino)

### 1. Estado Inicial Simulado en API (Doble en memoria -> HTTP 200 OK)

- **Mecanismo activo:** Doble en memoria (entidad ARG fija y sesión simulada; sin conexión a MongoDB)
- **Status HTTP:** `200`
- **Header `x-request-id`:** `f2aa6f94-9fd1-42b1-b5a7-1469c8e81522`
- **Latencia medida:** `218ms`

**Respuesta HTTP capturada:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "code": "ARG",
  "name": "Argentina",
  "confederation": "CONMEBOL",
  "selectionOrigin": "Anfitrión conmemorativo",
  "qualificationStage": "Clasificado directo",
  "participates": true,
  "trainingBase": "Predio Lionel Andrés Messi (Ezeiza)"
}
```

**Logs estructurados Pino emitidos por el servidor Fastify:**
```json
{"level":30,"time":1792768976834,"pid":2592,"hostname":"DESKTOP-ABP7874","reqId":"f2aa6f94-9fd1-42b1-b5a7-1469c8e81522","dependency":"MongoDB","operation":"findTeam","result":"simulated_double_success","source":"in-memory-double","durationMs":0.009299999997892883,"msg":"Operación simulada en doble de prueba (sin conexión a MongoDB)"}
{"level":30,"time":1792768976837,"pid":2592,"hostname":"DESKTOP-ABP7874","reqId":"f2aa6f94-9fd1-42b1-b5a7-1469c8e81522","method":"GET","route":"/equipos/:codigo","statusCode":200,"durationMs":5.269099999997707,"msg":"Solicitud finalizada"}
```

### 2. Falla de Conexión Real en Adaptador (MongoDocumentRepository contra 127.0.0.1:27099 -> HTTP 503 DEPENDENCY_UNAVAILABLE)

- **Mecanismo activo:** Adaptador real MongoDocumentRepository + driver mongodb contra 127.0.0.1:27099 sin listener (timeout 500ms)
- **Status HTTP:** `503`
- **Header `x-request-id`:** `75e22946-bebf-40c2-98ff-302b39a83b7e`
- **Latencia medida:** `520ms`

**Respuesta HTTP capturada:**
```json
{
  "code": "DEPENDENCY_UNAVAILABLE",
  "message": "Una dependencia no está disponible.",
  "requestId": "75e22946-bebf-40c2-98ff-302b39a83b7e"
}
```

**Logs estructurados Pino emitidos por el servidor Fastify:**
```json
{"level":30,"time":1792768977357,"pid":2592,"hostname":"DESKTOP-ABP7874","reqId":"75e22946-bebf-40c2-98ff-302b39a83b7e","dependency":"MongoDB","operation":"findTeam","result":"failure","durationMs":519.1098999999995,"msg":"Operación de dependencia"}
{"level":50,"time":1792768977358,"pid":2592,"hostname":"DESKTOP-ABP7874","reqId":"75e22946-bebf-40c2-98ff-302b39a83b7e","code":"DEPENDENCY_UNAVAILABLE","statusCode":503,"msg":"Solicitud rechazada"}
{"level":30,"time":1792768977358,"pid":2592,"hostname":"DESKTOP-ABP7874","reqId":"75e22946-bebf-40c2-98ff-302b39a83b7e","method":"GET","route":"/equipos/:codigo","statusCode":503,"durationMs":520.2936000000009,"msg":"Solicitud finalizada"}
```

### 3. Retorno Simulado en API al Conmutar Doble (Doble en memoria -> HTTP 200 OK)

- **Mecanismo activo:** Conmutación al doble en memoria sin reiniciar Fastify (no reconecta ni lee MongoDB real)
- **Status HTTP:** `200`
- **Header `x-request-id`:** `cfb049c4-8aa7-4092-b837-ec5fb552a8a3`
- **Latencia medida:** `1ms`

**Respuesta HTTP capturada:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "code": "ARG",
  "name": "Argentina",
  "confederation": "CONMEBOL",
  "selectionOrigin": "Anfitrión conmemorativo",
  "qualificationStage": "Clasificado directo",
  "participates": true,
  "trainingBase": "Predio Lionel Andrés Messi (Ezeiza)"
}
```

**Logs estructurados Pino emitidos por el servidor Fastify:**
```json
{"level":30,"time":1792768977359,"pid":2592,"hostname":"DESKTOP-ABP7874","reqId":"cfb049c4-8aa7-4092-b837-ec5fb552a8a3","dependency":"MongoDB","operation":"findTeam","result":"simulated_double_success","source":"in-memory-double","durationMs":0.004400000001623994,"msg":"Operación simulada en doble de prueba (sin conexión a MongoDB)"}
{"level":30,"time":1792768977359,"pid":2592,"hostname":"DESKTOP-ABP7874","reqId":"cfb049c4-8aa7-4092-b837-ec5fb552a8a3","method":"GET","route":"/equipos/:codigo","statusCode":200,"durationMs":0.29209999999875436,"msg":"Solicitud finalizada"}
```

---
*Reporte generado automáticamente por `prueba_falla_controlada.ts` sin edición manual posterior.*