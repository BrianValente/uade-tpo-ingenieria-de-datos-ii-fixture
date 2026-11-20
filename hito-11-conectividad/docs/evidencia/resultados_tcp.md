# Hito 11 — Resultados tcp

Fecha: 2026-11-06T18:47:50.383Z. Código: `cd653d6`. Modo: live-http.

Node24.13 y Ubuntu24.04 x64, SDK IRIS oficial sin modificar. Motores reales: Mongo7 e Influx3 bajo QEMU user-mode; IRIS2026.2 en VM Linux QEMU TCG. Emulacion sin AVX fisico; no certifica rendimiento de produccion.

Desglose de los mismos registros del [consolidado](reporte_conectividad_inicial.json), no una ejecución independiente.

| Producto / Listener | Host:Puerto | Protocolo | Estado | Latencia | Diagnóstico Técnico |
|:---|:---|:---|:---:|:---:|:---|
| MongoDB | `127.0.0.1:27017` | MongoDB Wire Protocol | **UP (OK)** | 3ms | Existe un listener activo y accesible en el host y puerto probado. |
| Redis | `127.0.0.1:6379` | RESP | **UP (OK)** | 1ms | Existe un listener activo y accesible en el host y puerto probado. |
| Neo4j (Bolt) | `127.0.0.1:7687` | Bolt | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
| Neo4j (HTTP) | `127.0.0.1:7474` | HTTP | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
| Cassandra (CQL) | `127.0.0.1:9042` | CQL | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
| InfluxDB 3 Core (HTTP) | `127.0.0.1:8181` | HTTP | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
| InterSystems IRIS (SuperServer) | `127.0.0.1:1972` | SuperServer | **UP (OK)** | 1ms | Existe un listener activo y accesible en el host y puerto probado. |
| InterSystems IRIS (Web/Portal) | `127.0.0.1:52773` | HTTP | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
| API Integrada Fixture 2030 | `127.0.0.1:8000` | HTTP | **UP (OK)** | 0ms | Existe un listener activo y accesible en el host y puerto probado. |
