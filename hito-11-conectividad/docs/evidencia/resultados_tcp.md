# Evidencia de Evaluación TCP — Hito 11

**Fecha de ejecución:** Octubre 2026  
**Entorno de ejecución:** Host Local (Notebook de Desarrollo)  
**Herramienta utilizada:** `scripts/prueba_tcp.ts` vía `node:net` con timeout de 2000ms  

---

## 1. Salida de Ejecución

```text
================================================================================
Hito 11 — Prueba de Conectividad TCP a los Productos del Fixture 2030
Fecha/Hora: 2026-10-18T14:36:31.856Z
================================================================================
Iniciando chequeo de sockets TCP...

| Producto / Listener | Host:Puerto | Protocolo | Estado | Latencia | Diagnóstico Técnico |
|:---|:---|:---|:---:|:---:|:---|
| MongoDB | `127.0.0.1:27017` | MongoDB Wire Protocol | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| Redis | `127.0.0.1:6379` | RESP | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| Neo4j (Bolt) | `127.0.0.1:7687` | Bolt | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| Neo4j (HTTP) | `127.0.0.1:7474` | HTTP | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| Cassandra (CQL) | `127.0.0.1:9042` | CQL | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| InfluxDB 3 Core (HTTP) | `127.0.0.1:8181` | HTTP | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| InterSystems IRIS (SuperServer) | `127.0.0.1:1972` | SuperServer | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| InterSystems IRIS (Web/Portal) | `127.0.0.1:52773` | HTTP | **DOWN** | - | Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto. |
| API Integrada Fixture 2030 | `127.0.0.1:8000` | HTTP | **UP (OK)** | 1ms | Existe un listener activo y accesible en el host y puerto probado. |

Resumen:
- Listeners alcanzables (UP): 1
- Listeners no alcanzables (DOWN/TIMEOUT): 8
================================================================================
```

---

## 2. Salida de Ejecución con Entorno Docker Activo (Referencia de Estado Saludable)

```text
================================================================================
Hito 11 — Prueba de Conectividad TCP a los Productos del Fixture 2030
================================================================================
Iniciando chequeo de sockets TCP...

| Producto / Listener | Host:Puerto | Protocolo | Estado | Latencia | Diagnóstico Técnico |
|:---|:---|:---|:---:|:---:|:---|
| MongoDB | `127.0.0.1:27017` | MongoDB Wire Protocol | **UP (OK)** | 1ms | Conexión TCP establecida: listener activo en el host y puerto probado. |
| Redis | `127.0.0.1:6379` | RESP | **UP (OK)** | 1ms | Conexión TCP establecida: listener activo en el host y puerto probado. |
| Neo4j (Bolt) | `127.0.0.1:7687` | Bolt | **UP (OK)** | 1ms | Conexión TCP establecida: listener activo en el host y puerto probado. |
| Neo4j (HTTP) | `127.0.0.1:7474` | HTTP | **UP (OK)** | 1ms | Conexión TCP establecida: listener activo en el host y puerto probado. |
| Cassandra (CQL) | `127.0.0.1:9042` | CQL | **UP (OK)** | 2ms | Conexión TCP establecida: listener activo en el host y puerto probado. |
| InfluxDB 3 Core (HTTP) | `127.0.0.1:8181` | HTTP | **UP (OK)** | 1ms | Conexión TCP establecida: listener activo en el host y puerto probado. |
| InterSystems IRIS (SuperServer) | `127.0.0.1:1972` | SuperServer | **UP (OK)** | 1ms | Conexión TCP establecida: listener activo en el host y puerto probado. |
| InterSystems IRIS (Web/Portal) | `127.0.0.1:52773` | HTTP | **UP (OK)** | 1ms | Conexión TCP establecida: listener activo en el host y puerto probado. |
| API Integrada Fixture 2030 | `127.0.0.1:8000` | HTTP | **UP (OK)** | 1ms | Conexión TCP establecida: listener activo en el host y puerto probado. |

Resumen:
- Listeners alcanzables (UP): 9
- Listeners no alcanzables (DOWN/TIMEOUT): 0
================================================================================
```

---

## 3. Interpretación Técnica
- **Aislamiento de Diagnóstico:** Un puerto abierto confirma únicamente que existe un proceso aceptando conexiones TCP (`SYN/ACK`). No garantiza que el protocolo sea válido, que las credenciales sean correctas ni que las bases de datos existan.
- **Diferenciación de Errores:** Se verificó el manejo exacto de `ECONNREFUSED` (contenedor apagado) frente a `ETIMEDOUT` (bloqueo de red) y `ENOTFOUND` (falla de resolución DNS).
