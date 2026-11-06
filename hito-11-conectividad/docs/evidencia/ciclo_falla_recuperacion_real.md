# Caída y recuperación de Redis real — Hito 11

Fecha UTC: 2026-11-06T18:46:55.074Z. Código: `cd653d6` (modified).
docker compose stop/start redis; API persistente y mismo token real; sin dobles, reinicio de API ni borrado de datos/volúmenes

| Fase | HTTP GET /equipos/ARG | PING nativo | Request ID |
| :--- | ---: | :--- | :--- |
| Antes | 200 | PONG | 29c24d34-2e82-499b-bc2f-b81e4f1d7f28 |
| Durante | 503 | DOWN | d3b2418a-af55-477c-9539-ff7c59707140 |
| Después | 200 | PONG | 1d9fee67-5f85-4136-bec8-ef2a9641500e |

- initialRead: **PASS**.
- realOutage: **PASS**.
- recoveredRead: **PASS**.
- samePersistedEntity: **PASS**.
- sameSession: **PASS**.
- sameContainerAndVolumes: **PASS**.

El JSON adjunto conserva cuerpos sanitizados, identidad de sesión resumida mediante SHA-256, TTL y mounts antes/después. La evidencia solo demuestra el ciclo de esta dependencia en este laboratorio; no un failover de clúster ni una garantía de pérdida cero ante cualquier falla.

Laboratorio funcional con motores oficiales reales. MongoDB 7 e InfluxDB 3 bajo QEMU user-mode; IRIS 2026.2 en VM Linux QEMU TCG sin ISCAgent; plugins de paquetes Influx deshabilitados. H11 nativo y API H10 sobre Node 24.13/Ubuntu 24.04 para SDK IRIS oficial; H12/H13 sobre Node 24.13/Linux host. CPU fisica sin AVX. Tiempos de laboratorio emulado, no capacidad de produccion.
