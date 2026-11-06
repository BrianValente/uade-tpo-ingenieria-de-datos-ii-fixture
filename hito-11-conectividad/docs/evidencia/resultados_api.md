# Hito 11 — Resultados api

Fecha: 2026-11-06T18:47:50.383Z. Código: `cd653d6`. Modo: live-http.

Node24.13 y Ubuntu24.04 x64, SDK IRIS oficial sin modificar. Motores reales: Mongo7 e Influx3 bajo QEMU user-mode; IRIS2026.2 en VM Linux QEMU TCG. Emulacion sin AVX fisico; no certifica rendimiento de produccion.

Desglose de los mismos registros del [consolidado](reporte_conectividad_inicial.json), no una ejecución independiente.

| Operación / Endpoint | Dependencia | Status HTTP | Esperado | Conforme | Latencia | Request ID | Diagnóstico e Interpretación |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `GET /health` | Ninguna (Solo proceso HTTP) | **200 OK** | 200 | SÍ | 5ms | `7694c14f...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /docs/json` | Ninguna (Esquemas estáticos Zod) | **200 OK** | 200 | SÍ | 2ms | `8b3c9573...` | Operación completada exitosamente a través de la cadena completa. |
| `POST /auth/login` | MongoDB (Colección accounts) + Redis (Tokens de sesión) | **200 OK** | 200 | SÍ | 41ms | `b19ff685...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /equipos/ARG` | MongoDB (Colección equipos) | **200 OK** | 200 | SÍ | 4ms | `c77870b1...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /equipos/ZZZ` | MongoDB | **404** | 404 | SÍ | 3ms | `6edb8a12...` | Ausencia válida esperada: recurso inexistente retornó 404 correctamente. |
| `GET /equipos/CODIGO_INVALIDO_MUY_LARGO` | Zod Validator (Sin llamada a base) | **400** | 400 | SÍ | 1ms | `f0372a80...` | Error de validación sintáctica esperado: esquema Zod interceptó el parámetro inválido (400). |
| `GET /equipos/ARG/jugadores?page=1&limit=5` | MongoDB (Colección jugadores) | **200 OK** | 200 | SÍ | 5ms | `8bf8db89...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001` | Neo4j (Nodo Partido) + MongoDB (Equipos) | **200 OK** | 200 | SÍ | 5ms | `983e9733...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001/eventos?limit=10` | Neo4j (Relaciones en Grafo) | **200 OK** | 200 | SÍ | 4ms | `f76816ea...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10` | Cassandra (Keyspace fixture2030_comentarios) | **200 OK** | 200 | SÍ | 2ms | `bcc2d223...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T22:00:00.000Z` | InfluxDB 3 (Base fixture2030_h8_lab_detalle) | **200 OK** | 200 | SÍ | 23ms | `4a32a6d8...` | Operación completada exitosamente a través de la cadena completa. |
| `GET /partidos/F2030-IRIS-0001/detalle` | InterSystems IRIS (Namespace USER) | **200 OK** | 200 | SÍ | 205ms | `f1bc342c...` | Operación completada exitosamente a través de la cadena completa. |
