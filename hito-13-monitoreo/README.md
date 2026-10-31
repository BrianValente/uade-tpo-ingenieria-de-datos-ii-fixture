# Hito 13 — Monitoreo y Defensa Final del Fixture Mundial FIFA 2030

Este directorio contiene la implementación completa del **Hito 13**, que integra observabilidad con **Prometheus (`v3.2.1`)**, **Redis Exporter (`v1.67.0`)** y **Grafana (`11.5.2`)** sobre la API REST políglota y los motores NoSQL del proyecto, junto con la prueba controlada de disponibilidad/falla/recuperación y el paquete completo de defensa técnica de 20 minutos ante el comité evaluador de la FIFA.

---

## 1. Requisitos Previos

- **Node.js** `>= 24` y **pnpm** `10.x`
- **Docker** y **Docker Compose v2** activos
- Archivo `.env` configurado en la raíz del repositorio (puede generarse automáticamente con `pnpm --dir hito-10-api env:local`)

---

## 2. Comandos Exactos de Ejecución (RNF1, RNF2, RNF11)

Todos los comandos pueden ejecutarse desde `hito-10-api` mediante scripts `pnpm h13:*`:

```bash
# 1. Levantar motores activos (MongoDB, Neo4j, Redis) y stack de monitoreo (Prometheus :9090, Redis Exporter :9121, Grafana :3000)
pnpm --dir hito-10-api h13:iniciar

# 2. Iniciar el servidor API instrumentado con endpoint /metrics en 127.0.0.1:8013
pnpm --dir hito-10-api h13:servidor

# 3. Verificar targets activos y reglas de alerta en Prometheus (/api/v1/targets y /api/v1/rules)
pnpm --dir hito-10-api h13:verificar-targets

# 4. Ejecutar el flujo completo automatizado (preparación + carga + consultas PromQL + verificación Grafana + prueba controlada de falla y recuperación en 3 fases)
pnpm --dir hito-10-api h13:prueba-controlada

# 5. Ejecutar smoke test rápido en memoria (sin requerir Docker, ideal para CI)
pnpm --dir hito-10-api h13:smoke

# 6. Detener los contenedores de monitoreo sin borrar datos ni volúmenes de bases de datos (RNF11)
pnpm --dir hito-10-api h13:limpiar
```

### URLs locales de los servicios

| Servicio | URL Local | Descripción |
| :--- | :--- | :--- |
| **API Instrumentada (`/metrics`)** | `http://127.0.0.1:8013/metrics` | Exposición Prometheus `0.0.4` (métricas HTTP, drivers políglotas, caché, sesiones, proceso Node.js y sondas `fixture2030_component_up`) |
| **Swagger / OpenAPI UI** | `http://127.0.0.1:8013/docs` | Documentación interactiva del contrato HTTP |
| **Prometheus UI / Targets** | `http://127.0.0.1:9090/targets` | Estado `UP`/`DOWN` de los 3 jobs (`prometheus`, `fixture2030_api`, `redis_exporter`) |
| **Prometheus Rules / Alerts** | `http://127.0.0.1:9090/alerts` | Evaluación cada `5s` de las 6 reglas definidas en `prometheus/reglas-o-alertas.yml` |
| **Redis Exporter** | `http://127.0.0.1:9121/metrics` | Telemetría interna del motor Redis (`6379`) |
| **Grafana Dashboard** | `http://127.0.0.1:3000/d/fixture2030-hito13-obs` | Tablero aprovisionado automáticamente con 9 paneles (acceso `Viewer` sin login para laboratorio local) |

---

## 3. Estructura del Directorio y Trazabilidad de Requisitos (§9, §10)

```text
hito-13-monitoreo/
├── README.md
├── .gitignore
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── prometheus.yml
├── prometheus/
│   └── reglas-o-alertas.yml
├── grafana/
│   ├── README.md
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── prometheus.yml
│   │   └── dashboards/
│   │       └── dashboards.yml
│   └── dashboards/
│       └── fixture2030_observabilidad.json
├── scripts/
│   ├── iniciar_monitoreo.ts
│   ├── servidor_monitoreo.ts
│   ├── verificar_targets.ts
│   ├── ejecutar_prueba_controlada.ts
│   └── limpiar_entorno.ts
├── docs/
│   ├── inventario_de_componentes.md
│   ├── metricas_y_consultas.md
│   ├── alertas_y_umbral.md
│   ├── decisiones_de_arquitectura.md
│   ├── limitaciones_y_evidencia.md
│   └── defensa_final.md
├── evidencia/
│   ├── prometheus_targets.json
│   ├── prometheus_targets.md
│   ├── prueba_de_falla.json
│   ├── prueba_de_falla.md
│   ├── dashboards/
│   │   └── resumen_dashboard_observado.md
│   └── resultados_sin_secretos/
│       ├── README.md
│       ├── consultas_promql_observadas.json
│       └── consultas_promql_observadas.md
└── defensa/
    ├── presentacion.html
    ├── guion_de_20_minutos.md
    └── demo.md
```

---

## 4. Índice de Documentación, Evidencia y Defensa

### Documentación Técnica (`docs/`)
- [`docs/inventario_de_componentes.md`](docs/inventario_de_componentes.md): inventario completo de los 6 motores NoSQL + API + stack de monitoreo, diferenciando monitoreo activo (`active_probe`) de sondas TCP informativas (`tcp_socket_probe`) y métricas de aplicación vs. infraestructura (**RF1, RF3, RF4, RNF3**).
- [`docs/metricas_y_consultas.md`](docs/metricas_y_consultas.md): parámetros de scrape de Prometheus, protocolo de validación de targets `UP`/`DOWN` y catálogo de 8 consultas PromQL (**RF2, RF4, RF8**).
- [`docs/alertas_y_umbral.md`](docs/alertas_y_umbral.md): matriz de 6 alertas operativas con métrica, condición, ventana `for`, severidad, componente, impacto, runbook y justificación empírica (**RF9**).
- [`docs/decisiones_de_arquitectura.md`](docs/decisiones_de_arquitectura.md): defensa en 10 puntos de cada uno de los 6 modelos (MongoDB, Neo4j, Cassandra, Redis, InfluxDB, IRIS), por qué un único motor no basta, separación OLTP vs. Data Mart OLAP y 4 propuestas de mejora basadas en evidencia (**RF11, RF12, RF14, RF15**).
- [`docs/limitaciones_y_evidencia.md`](docs/limitaciones_y_evidencia.md): clasificación estricta entre mediciones reales de laboratorio, datos por exporter/sonda y proyecciones de diseño hacia los 127 partidos de 2030 (**RNF3, RNF8**).
- [`docs/defensa_final.md`](docs/defensa_final.md): respuesta a la pregunta central del Hito 13, trazabilidad de los Hitos 1 a 13 y respuestas técnicas a las 14 preguntas del comité evaluador de la FIFA (**RF13, RF16, RNF12**).

### Evidencia Verificable (`evidencia/`)
- [`evidencia/prometheus_targets.md`](evidencia/prometheus_targets.md) y [`.json`](evidencia/prometheus_targets.json): estado real de `/api/v1/targets`, `/api/v1/rules` y sondas políglotas (**RF1, RF2, RF3**).
- [`evidencia/resultados_sin_secretos/consultas_promql_observadas.md`](evidencia/resultados_sin_secretos/consultas_promql_observadas.md) y [`.json`](evidencia/resultados_sin_secretos/consultas_promql_observadas.json): salidas reales sanitizadas de las 8 consultas PromQL (**RF8, RNF6**).
- [`evidencia/dashboards/resumen_dashboard_observado.md`](evidencia/dashboards/resumen_dashboard_observado.md): validación del provisioning de Grafana y de las 9 consultas del tablero JSON (**RF5, RF6, RF7, RNF4**).
- [`evidencia/prueba_de_falla.md`](evidencia/prueba_de_falla.md) y [`.json`](evidencia/prueba_de_falla.json): evidencia antes, durante y después de la prueba controlada de indisponibilidad y recuperación (**RF10, RNF5**).

### Material de Defensa de 20 Minutos (`defensa/`)
- [`defensa/presentacion.html`](defensa/presentacion.html): presentación interactiva autocontenida en HTML/CSS/JS navegable con teclado (`←` / `→`).
- [`defensa/guion_de_20_minutos.md`](defensa/guion_de_20_minutos.md): cronograma minuto a minuto (6 bloques) y Plan B ante fallas locales (**RF16, RNF7**).
- [`defensa/demo.md`](defensa/demo.md): comandos reproducibles para la demostración en vivo de 4 minutos (**RF16, RNF7**).
