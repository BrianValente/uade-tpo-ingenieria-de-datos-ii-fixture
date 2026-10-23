# Evidencia de Ciclo Controlado de Falla y Recuperación — Hito 11

**Fecha de generación:** 2026-10-23T12:12:57.240Z  
**Entorno:** win32 (x64) — Node.js v25.9.0  
**Commit base:** `f65b6ec`  
**Comando ejecutado:** `pnpm --dir hito-10-api exec tsx ../hito-11-conectividad/scripts/prueba_falla_controlada.ts --output=../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion.md`  
**Tipo de prueba:** Ejecución controlada reproducible in-process sobre instancia real de Fastify (`buildServer`), `MongoDocumentRepository` real (ante puerto desconectado en etapa 2) y manejador de errores del Hito 10 (`registerErrorHandler`).  

## Resumen del Ciclo Ejecutado

| Etapa | Endpoint | HTTP Status | Request ID (`x-request-id`) | Latencia | Resultado |
|:---|:---|:---:|:---|:---:|:---|
| 1. Estado Inicial Operativo (Dependencia MongoDB UP) | `GET /equipos/ARG` | **200 OK** | `5a57f7ec-01b0-46ee-bcfa-b6405038f7ae` | 26ms | Lectura exitosa de entidad `ARG` en MongoDB |
| 2. Falla Controlada de Dependencia (MongoDB DOWN -> HTTP 503 DEPENDENCY_UNAVAILABLE) | `GET /equipos/ARG` | **503 Service Unavailable** | `ed52f060-badf-481f-b1d8-fc40fbf29d15` | 519ms | Degradación controlada (`DEPENDENCY_UNAVAILABLE`) |
| 3. Recuperación de Dependencia y Reintento Exitoso (MongoDB UP -> HTTP 200 OK) | `GET /equipos/ARG` | **200 OK** | `c7a5ee6d-086a-4c6d-8f87-39f5f58f573a` | 1ms | Lectura exitosa de entidad `ARG` en MongoDB |

## Detalle por Etapa (Cuerpos HTTP y Logs Estructurados Pino)

### 1. Estado Inicial Operativo (Dependencia MongoDB UP)

- **Status HTTP:** `200`
- **Header `x-request-id`:** `5a57f7ec-01b0-46ee-bcfa-b6405038f7ae`
- **Latencia medida:** `26ms`

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
{"level":30,"time":1792757576716,"pid":16152,"hostname":"DESKTOP-ABP7874","reqId":"5a57f7ec-01b0-46ee-bcfa-b6405038f7ae","dependency":"MongoDB","operation":"findTeam","result":"success","durationMs":0.009000000000014552,"msg":"Operación de dependencia"}
{"level":30,"time":1792757576720,"pid":16152,"hostname":"DESKTOP-ABP7874","reqId":"5a57f7ec-01b0-46ee-bcfa-b6405038f7ae","method":"GET","route":"/equipos/:codigo","statusCode":200,"durationMs":5.014900000000125,"msg":"Solicitud finalizada"}
```

### 2. Falla Controlada de Dependencia (MongoDB DOWN -> HTTP 503 DEPENDENCY_UNAVAILABLE)

- **Status HTTP:** `503`
- **Header `x-request-id`:** `ed52f060-badf-481f-b1d8-fc40fbf29d15`
- **Latencia medida:** `519ms`

**Respuesta HTTP capturada:**
```json
{
  "code": "DEPENDENCY_UNAVAILABLE",
  "message": "Una dependencia no está disponible.",
  "requestId": "ed52f060-badf-481f-b1d8-fc40fbf29d15"
}
```

**Logs estructurados Pino emitidos por el servidor Fastify:**
```json
{"level":30,"time":1792757577238,"pid":16152,"hostname":"DESKTOP-ABP7874","reqId":"ed52f060-badf-481f-b1d8-fc40fbf29d15","dependency":"MongoDB","operation":"findTeam","result":"failure","durationMs":517.6034,"msg":"Operación de dependencia"}
{"level":50,"time":1792757577238,"pid":16152,"hostname":"DESKTOP-ABP7874","reqId":"ed52f060-badf-481f-b1d8-fc40fbf29d15","code":"DEPENDENCY_UNAVAILABLE","statusCode":503,"msg":"Solicitud rechazada"}
{"level":30,"time":1792757577239,"pid":16152,"hostname":"DESKTOP-ABP7874","reqId":"ed52f060-badf-481f-b1d8-fc40fbf29d15","method":"GET","route":"/equipos/:codigo","statusCode":503,"durationMs":518.739,"msg":"Solicitud finalizada"}
```

### 3. Recuperación de Dependencia y Reintento Exitoso (MongoDB UP -> HTTP 200 OK)

- **Status HTTP:** `200`
- **Header `x-request-id`:** `c7a5ee6d-086a-4c6d-8f87-39f5f58f573a`
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
{"level":30,"time":1792757577240,"pid":16152,"hostname":"DESKTOP-ABP7874","reqId":"c7a5ee6d-086a-4c6d-8f87-39f5f58f573a","dependency":"MongoDB","operation":"findTeam","result":"success","durationMs":0.0037999999999556167,"msg":"Operación de dependencia"}
{"level":30,"time":1792757577240,"pid":16152,"hostname":"DESKTOP-ABP7874","reqId":"c7a5ee6d-086a-4c6d-8f87-39f5f58f573a","method":"GET","route":"/equipos/:codigo","statusCode":200,"durationMs":0.26490000000012515,"msg":"Solicitud finalizada"}
```

---
*Reporte generado automáticamente por `prueba_falla_controlada.ts` sin edición manual posterior.*