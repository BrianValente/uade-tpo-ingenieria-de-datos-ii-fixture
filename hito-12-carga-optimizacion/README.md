# Hito 12 — Pruebas de Carga y Optimización del Fixture 2030

**Asignatura:** Ingeniería de Datos II  
**Repositorio:** Fixture Mundial 2030  
**Entrega:** Hito 12 — Pruebas de Carga, Optimización y Análisis Multi-Motor  

---

## 1. Descripción del Hito

Este módulo contiene la implementación reproducible, los generadores determinísticos de carga, la instrumentación multi-capa y la documentación técnica para evaluar y optimizar el rendimiento de la **API integrada de consulta en vivo del Fixture 2030** (desarrollada sobre **Fastify 5 + Node.js**) interactuando con **MongoDB 7.0**, **Neo4j 5.26** y **Redis 8.10**.

El trabajo sigue una metodología experimental rigurosa en seis etapas:
1. **Delimitación del flujo crítico multi-motor y preparación reproducible del dataset** (`64` equipos, `1.536` jugadores, `32` partidos, `8` sedes, `384` eventos —incluyendo `320` eventos sintéticos identificados con `lotePrueba: "HITO_12"`— y `20` sesiones activas en Redis).
2. **Establecimiento de una Línea Base (`baseline`) reproducible** antes de introducir mejoras, midiendo latencia (`min`, `avg`, `stdDev`, `p50`, `p90`, `p95`, `p99`, `max`), throughput, tasa de error y métricas diferenciadas por capa (Generador HTTP, Fastify, Drivers NoSQL y Contenedores Docker).
3. **Formulación de hipótesis técnicas verificables (`H1`, `H2`, `H3`)** e implementación de **optimizaciones concretas (`O1`, `O2`, `O3`)**:
   - **O1:** Ampliación de pools de conexiones (`maxPoolSize=25`, `maxConnectionPoolSize=25` frente a `10 / 10` en base), proyección documental acotada (`_id`, `codigo`, `nombre`, `confederacion`, `esCabezaDeSerie`) y resolución batch en MongoDB (`find({ codigo: { $in: [...] } })`).
   - **O2:** Caché Read-Aside en Redis (`h12:cache:*`) con TTL explícito diferenciado por volatilidad (`15 s` para eventos, `120 s` para detalle de partido, `300 s` para planteles y fichas de selecciones).
   - **O3:** Throttling de ventana deslizante en sesiones Redis (`HSET` + `EXPIRE` solo cuando `now - last_activity >= 60 s`).
4. **Repetición de la prueba bajo idéntico escenario (`optimized`)** y comparación cuantitativa Antes vs. Después, incluyendo el análisis explícito de **trade-offs** (memoria RAM en Redis/Node.js, frescura/TTL y complejidad operativa).
5. **Propuesta de integración analítica hacia un Data Mart** (constelación Kimball `fact_rendimiento_equipo_bloque15m` y `fact_interaccion_partido_bloque15m`) y **comparación condicionada frente a una alternativa Relacional 3FN**.
6. **Validación automatizada de integridad post-carga** (`8/8` controles superados, `0` registros perdidos/duplicados/corruptos, `100 %` de consistencia caché-fuente) y **limpieza selectiva no destructiva**.

---

## 2. Resumen Ejecutivo de Resultados (Línea Base vs. Optimizado)

Ambas corridas se ejecutaron bajo el mismo escenario reproducible (`24` usuarios virtuales concurrentes, `3 s` de warm-up, `4 s` de ramp-up, `12 s` de estado estable, distribución 40/30/20/10 sobre 4 partidos y 8 selecciones calientes en proporción 80/20 con semilla PRNG `203012`):

| Indicador Clave | Línea Base (`baseline`) | Prueba Optimizada (`optimized`) | Variación |
| :--- | ---: | ---: | ---: |
| **Throughput Global** | `34.96 ops/s` (`635` ops) | **`276.94 ops/s`** (`4.439` ops) | **`+692.2 %` ($7,92\times$)** |
| **Tasa de Error HTTP** | `10.87 %` (`69` fallos: 64 `HTTP 503` + 5 `CLIENT_TIMEOUT`) | **`0.00 %`** (`0` errores) | **`-10.87 pp` (`-100 %`)** |
| **Latencia Media E2E (`avg`)** | `606.01 ms` | **`77.88 ms`** | **`-87.1 %`** |
| **Latencia Mediana E2E (`p50`)** | `267.81 ms` | **`65.83 ms`** | **`-75.4 %`** |
| **Latencia Percentil 95 (`p95`)** | `2039.77 ms` | **`159.28 ms`** | **`-92.2 %` ($12,81\times$)** |
| **Latencia Percentil 99 (`p99`)** | `3922.69 ms` | **`245.07 ms`** | **`-93.8 %` ($16,01\times$)** |
| **Consultas Driver MongoDB** | `1.034` llamadas | **`118` llamadas** | **`-88.6 %`** |
| **Consultas Driver Neo4j** | `401` llamadas | **`60` llamadas** | **`-85.0 %`** |
| **Cache Hit Ratio (Read-Aside Redis)** | `0.00 %` (sin caché) | **`96.53 %`** (`4.285` hits / `154` misses) | **`+96.53 pp`** |
| **Renovaciones de Sesión Ahorradas** | `0` | **`4.439` escrituras (`HSET`+`EXPIRE`)** | **`100 %` en ventana $<60\text{ s}$** |

---

## 3. Estructura de Entregables

```text
hito-12-carga-optimizacion/
├── README.md                                  # Este documento: guía general, comandos y resultados
├── compose-o-instrucciones-del-entorno.md     # Instrucciones detalladas de contenedores y entorno
├── package.json                               # Scripts de preparación, carga, validación y limpieza
├── tsconfig.json                              # Configuración de chequeo estático TypeScript
├── .gitignore                                 # Protección contra filtración de secretos y archivos temporales
├── config/
│   ├── configuracion-ejemplo.env              # Plantilla de parámetros del escenario sin secretos
│   └── .gitignore                             # Exclusión de archivos .env locales
├── datos-o-generadores/
│   ├── README.md                              # Documentación del generador determinístico y dataset
│   └── generador_escenario.ts                 # Generador PRNG Mulberry32 (seed 203012) y distribución 80/20
├── scripts/
│   ├── entorno_y_recursos.ts                  # Captura de entorno, recursos Docker/OS y sanitización
│   ├── preparar_datos.ts                      # Siembra idempotente de eventos HITO_12, sesiones e índices
│   ├── servidor_optimizado.ts                 # Adaptadores instrumentados (Baseline vs Optimizado O1/O2/O3)
│   ├── ejecutar_carga.ts                      # Motor de carga multi-etapa y generación de evidencia
│   ├── ejecutar_linea_base.ts                 # Runner reproducible de la Línea Base
│   ├── ejecutar_prueba_optimizada.ts          # Runner reproducible de la Prueba Optimizada
│   ├── validar_integridad.ts                  # Verificación post-carga de integridad y consistencia caché
│   └── limpiar_datos_de_prueba.ts             # Limpieza selectiva no destructiva de datos HITO_12
└── docs/
    ├── flujo_y_escenario_de_carga.md          # Delimitación arquitectónica, pesos y modelo de concurrencia
    ├── linea_base.md                          # Análisis de resultados de línea base y cuellos de botella
    ├── hipotesis_y_optimizacion.md            # Hipótesis H1-H3, optimizaciones O1-O3, antes/después y trade-offs
    ├── integracion_data_mart.md               # Diseño estrella fact_rendimiento_audiencia_bloque15m y ETL
    ├── comparacion_relacional.md              # Comparación condicionada Políglota vs Relacional 3FN
    ├── integridad_y_limitaciones.md           # Auditoría de integridad post-carga y limitaciones del laboratorio
    └── evidencia/
        ├── resultados_linea_base.json         # Métricas crudas de la Línea Base
        ├── resultados_linea_base.md           # Reporte autogenerado de la Línea Base
        ├── resultados_optimizados.json        # Métricas crudas de la Prueba Optimizada
        ├── resultados_optimizados.md          # Reporte autogenerado de la Prueba Optimizada
        ├── tablas_o_graficos.md               # Tablas comparativas y gráficos Mermaid Antes vs Después
        ├── validacion_integridad.json         # Resultado estructurado de los 8 controles de integridad
        ├── validacion_integridad.md           # Reporte de auditoría de integridad post-carga
        └── capturas_redactadas/               # Guía de auditoría y política de cero secretos
            └── README.md
```

---

## 4. Requisitos e Inicio Rápido

1. **Contenedores Docker Activos:** `mongodb`, `neo4j` y `redis` iniciados desde la raíz del repositorio (`docker compose up -d mongodb neo4j redis`) con los datasets canónicos cargados (ver [compose-o-instrucciones-del-entorno.md](compose-o-instrucciones-del-entorno.md)).
2. **Node.js y Dependencias:** Node.js v24+ y dependencias instaladas en `hito-10-api/` (`pnpm install --frozen-lockfile` y `pnpm env:local`).

### Ejecución Paso a Paso desde `hito-10-api/`

```bash
cd hito-10-api

# 1. Preparar datos sintéticos idempotentes (320 eventos HITO_12, 20 sesiones Redis e índices):
pnpm h12:preparar

# 2. Ejecutar Línea Base (Baseline sin optimizaciones):
pnpm h12:linea-base

# 3. Ejecutar Prueba Optimizada (con O1 + O2 + O3 y generación de tablas comparativas):
pnpm h12:optimizada

# 4. Validar integridad post-carga en MongoDB, Neo4j y Redis (8 controles):
pnpm h12:validar

# 5. (Opcional) Limpiar selectivamente solo los datos sintéticos de HITO_12 sin afectar datos canónicos:
pnpm h12:limpiar

# 6. Smoke test determinístico in-process (sin requerir Docker, ideal para CI):
pnpm h12:smoke
```

También pueden ejecutarse directamente desde `hito-12-carga-optimizacion/` usando `pnpm run preparar`, `pnpm run linea-base`, `pnpm run optimizada`, `pnpm run validar`, `pnpm run limpiar` y `pnpm run smoke`.

---

## 5. Documentación Detallada de Referencia

- [Instrucciones del Entorno y Contenedores](compose-o-instrucciones-del-entorno.md)
- [Flujo Seleccionado y Escenario de Carga](docs/flujo_y_escenario_de_carga.md)
- [Medición y Diagnóstico de Línea Base](docs/linea_base.md)
- [Hipótesis, Optimizaciones, Comparación Antes/Después y Trade-offs](docs/hipotesis_y_optimizacion.md)
- [Propuesta de Integración con el Data Mart Analítico](docs/integracion_data_mart.md)
- [Comparación Condicionada frente a Alternativa Relacional 3FN](docs/comparacion_relacional.md)
- [Validación de Integridad Post-Carga y Limitaciones](docs/integridad_y_limitaciones.md)
- **Evidencia Empírica Autogenerada:**
  - [Reporte de Línea Base (`resultados_linea_base.md`)](docs/evidencia/resultados_linea_base.md)
  - [Reporte de Prueba Optimizada (`resultados_optimizados.md`)](docs/evidencia/resultados_optimizados.md)
  - [Tablas y Gráficos Comparativos (`tablas_o_graficos.md`)](docs/evidencia/tablas_o_graficos.md)
  - [Reporte de Validación de Integridad (`validacion_integridad.md`)](docs/evidencia/validacion_integridad.md)

---

## 6. Política de Seguridad, Cero Secretos y No Destructividad (RNF7, RNF8, RF16)

- **Cero Secretos:** Ninguna contraseña, token ni URI con credenciales se versiona en el código ni en los archivos de evidencia. El módulo [`entorno_y_recursos.ts`](scripts/entorno_y_recursos.ts) redacta automáticamente cualquier credencial (`******`).
- **Aislamiento y Limpieza No Destructiva:** Todos los datos sintéticos creados para el Hito 12 llevan marcadores explícitos (`lotePrueba: "HITO_12"`, `id: "F2030-H12-EVT-*"`, prefijos `h12:cache:*` y sesiones `fixture2030:h10:h12-bench:sesion:*`), permitiendo que [`limpiar_datos_de_prueba.ts`](scripts/limpiar_datos_de_prueba.ts) restaure el estado exacto previo sin alterar ningún registro canónico de los Hitos 4 a 11.
