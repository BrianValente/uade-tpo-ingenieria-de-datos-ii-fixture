# Hito 13 — Monitoreo y Defensa Final del Fixture Mundial FIFA 2030

Este directorio contiene la implementación completa del **Hito 13**, que integra observabilidad con **Prometheus (`v3.2.1`)**, **Redis Exporter (`v1.67.0`)** y **Grafana (`11.5.2`)** sobre la API REST políglota y los motores NoSQL del proyecto, junto con la prueba controlada de disponibilidad/falla/recuperación y el paquete completo de defensa técnica de 20 minutos ante el comité evaluador de la FIFA.

---

## 1. Requisitos Previos e Instalación en un Clon Nuevo

- **Node.js** `24.x` o `26.x` y **pnpm** `10.34.7` (versiones declaradas en `hito-10-api/package.json`)
- **Docker** y **Docker Compose v2** activos
- **Configuración inicial en un clon nuevo:**
  ```bash
  # 1. Instalar dependencias en el directorio del paquete de la API:
  corepack pnpm@10.34.7 --dir hito-10-api install --frozen-lockfile

  # 2. Crear la configuración de Compose y reemplazar ambas contraseñas change-me
  # por contraseñas propias antes de continuar. No sobrescribir un .env existente:
  test -f .env || cp .env.example .env
  chmod 600 .env
  # Editar .env: MONGO_ROOT_PASSWORD y NEO4J_PASSWORD.
  # env:local copia esa configuración y genera las contraseñas de usuarios de prueba:
  pnpm --dir hito-10-api env:local

  # 3. Levantar los motores base de datos y esperar su disponibilidad saludable:
  docker compose up -d --wait mongodb neo4j redis

  # 4. Sembrar datos funcionales indispensables usando los wrappers canónicos del proyecto:
  # Carga 64 selecciones y 1.536 jugadores en MongoDB (Hito 4) vía mongosh con variables de contenedor:
  sh ./scripts/load-data.sh
  # Exporta CSVs de importación y carga estructura de sedes, partidos y eventos en Neo4j (Hito 5) vía Cypher:
  sh ./scripts/load-neo4j.sh

  # 5. Sembrar usuarios de prueba en MongoDB y Redis (Hito 10):
  pnpm --dir hito-10-api seed:users

  # 6. Preparar datos de prueba y pre-calentar sesiones para Hito 12 / Hito 13:
  pnpm --dir hito-10-api h12:preparar
  ```
  *(Nota: `prepareTestData()` en Hito 12 y Hito 13 valida que existan estas 64 selecciones y 1.536 jugadores antes de sembrar sesiones y limpiar claves de caché en Redis).*

---

## 2. Modos de Ejecución (RNF1, RNF2, RNF11)

Se distinguen **dos modos operativos bien diferenciados** para evitar conflictos de puerto (`EADDRINUSE 0.0.0.0:8013`):

### Modo A: Runner Autónomo de Verificación Integral (Recomendado para Entrega y CI)
Ejecuta de principio a fin todo el flujo del Hito 13 en un único comando orquestado: inicia los contenedores de observabilidad (`Prometheus :9090`, `Redis Exporter :9121`, `Grafana :3000`), levanta su propia instancia del servidor Fastify en `:8013`, valida targets `UP`, corre 240 operaciones políglotas, evalúa PromQL, valida el dashboard de Grafana mediante su API, ejecuta la prueba controlada de falla en 3 fases y genera los reportes en `evidencia/`.

> [!IMPORTANT]
> **No mantenga abierto `h13:servidor` antes de lanzar este runner.** Si tenía un servidor previo en `:8013`, deténgalo (`Ctrl+C`) para que el runner pueda orquestar el puerto sin error de dirección en uso.

```bash
# Ejecutar verificación completa y generación de evidencia:
pnpm --dir hito-10-api h13:prueba-controlada

# Para entornos de CI sin Docker (smoke test rápido en memoria):
pnpm --dir hito-10-api h13:smoke
```

---

### Modo B: Servidor Persistente, Exploración Manual y Demo en Vivo
Para interactuar manualmente con la API Swagger, explorar paneles de Grafana o realizar consultas PromQL en tiempo real:

- **Terminal 1 (Infraestructura y Monitoreo):**
  ```bash
  pnpm --dir hito-10-api h13:iniciar
  ```
- **Terminal 2 (Servidor API Instrumentado):**
  ```bash
  pnpm --dir hito-10-api h13:servidor
  ```
- **Terminal 3 (Consultas y Verificación de Targets):**
  ```bash
  # Verificar endpoint de métricas
  curl -s http://127.0.0.1:8013/metrics | head -n 30

  # Verificar targets activos y reglas de alerta en Prometheus
  pnpm --dir hito-10-api h13:verificar-targets
  ```

- **Detención limpia:** Presionar `Ctrl+C` en Terminal 2 para detener el servidor API, y luego en Terminal 1:
  ```bash
  pnpm --dir hito-10-api h13:limpiar
  ```

### URLs locales de los servicios

| Servicio | URL Local | Descripción |
| :--- | :--- | :--- |
| **API Instrumentada (`/metrics`)** | `http://127.0.0.1:8013/metrics` | Exposición Prometheus `0.0.4` (métricas HTTP, drivers políglotas, caché, sesiones, proceso Node.js y sondas `fixture2030_component_up`) |
| **Healthcheck HTTP (`/health`)** | `http://127.0.0.1:8013/health` | Verificación rápida del servidor Fastify (`{"status":"ok"}`) |
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
- [`docs/inventario_de_componentes.md`](docs/inventario_de_componentes.md): inventario completo de los 6 motores NoSQL + API + stack de monitoreo, diferenciando monitoreo activo (`active_probe`), exporter nativo (`redis_exporter`) y sondas TCP informativas (`tcp_socket_probe`), así como métricas de aplicación vs. infraestructura (**RF1, RF3, RF4, RNF3**).
- [`docs/metricas_y_consultas.md`](docs/metricas_y_consultas.md): parámetros de scrape de Prometheus, protocolo de validación de targets `UP`/`DOWN` y catálogo de 8 consultas PromQL (**RF2, RF4, RF8, RNF9**).
- [`docs/alertas_y_umbral.md`](docs/alertas_y_umbral.md): matriz de 6 alertas operativas con métrica, condición, ventana `for`, severidad, componente, impacto, rol responsable de atención, runbook y justificación empírica sobre los resultados del Hito 12 y Hito 13 (**RF9, RF10**).
- [`docs/decisiones_de_arquitectura.md`](docs/decisiones_de_arquitectura.md): defensa en los 10 puntos obligatorios de §6.4 de cada uno de los 6 modelos (MongoDB, Neo4j, Cassandra, Redis, InfluxDB, IRIS), relación de métricas con objetivos del TPO, los 8 ejes transversales de distribución y mejoras fundamentadas en evidencia (**RF11, RF12, RF14, RF15**).
- [`docs/limitaciones_y_evidencia.md`](docs/limitaciones_y_evidencia.md): clasificación estricta entre mediciones reales de laboratorio, datos por exporter/sonda y proyecciones de diseño hacia los 127 partidos de 2030 (**RNF3, RNF8, RNF9**).
- [`docs/defensa_final.md`](docs/defensa_final.md): respuesta a la pregunta central del Hito 13 (§11), trazabilidad completa de los Hitos 1 a 13 y respuestas técnicas a las 14 preguntas oficiales del comité evaluador de la FIFA (§6.5) (**RF13, RF16, RNF10, RNF12**).

### Evidencia Verificable (`evidencia/`)
- [`evidencia/prometheus_targets.md`](evidencia/prometheus_targets.md) y [`.json`](evidencia/prometheus_targets.json): estado real de `/api/v1/targets`, `/api/v1/rules` y sondas políglotas (**RF1, RF2, RF3**).
- [`evidencia/resultados_sin_secretos/consultas_promql_observadas.md`](evidencia/resultados_sin_secretos/consultas_promql_observadas.md) y [`.json`](evidencia/resultados_sin_secretos/consultas_promql_observadas.json): salidas reales sanitizadas de las 8 consultas PromQL (**RF8, RNF6**).
- [`evidencia/dashboards/resumen_dashboard_observado.md`](evidencia/dashboards/resumen_dashboard_observado.md): validación del provisioning de Grafana y de todas las expresiones habilitadas de sus 9 paneles mediante el datasource configurado, sin acceso directo alternativo a Prometheus (**RF5, RF6, RF7, RNF4**).
- [`evidencia/prueba_de_falla.md`](evidencia/prueba_de_falla.md) y [`.json`](evidencia/prueba_de_falla.json): evidencia antes, durante y después de la prueba controlada de indisponibilidad y recuperación (**RF10, RNF5**).

### Material de Defensa de 20 Minutos (`defensa/`)
- [`defensa/presentacion.html`](defensa/presentacion.html): presentación interactiva autocontenida en HTML/CSS/JS navegable con teclado (`←` / `→`).
- [`defensa/guion_de_20_minutos.md`](defensa/guion_de_20_minutos.md): cronograma minuto a minuto (6 bloques de §6.2), distribución de los 3 expositores del Grupo 5 y Plan B ante fallas locales (**RF16, RNF7, RNF12**).
- [`defensa/demo.md`](defensa/demo.md): comandos reproducibles para la demostración en vivo de 4 minutos incluyendo consultas en clientes nativos, API, Prometheus y Grafana (**RF16, RNF7, §6.3**).
