# Hito 11 — Evaluación de Conectividad a los Productos del Fixture 2030

**Asignatura:** Ingeniería de Datos II  
**Repositorio:** Fixture Mundial 2030  
**Entrega:** Hito 11 — Diagnóstico y Evaluación de Conectividad  

---

## 1. Descripción del Hito

Este módulo contiene la implementación reproducible y la documentación técnica para evaluar la conectividad de la **API integrada** (desarrollada en el Hito 10) con los seis motores de bases de datos NoSQL del Fixture 2030:
- **MongoDB 7.0:** Modelo Documental y Cuentas de Usuarios
- **Redis:** Sesiones en Memoria y Control de Acceso
- **Neo4j:** Grafo de Partidos, Sedes y Eventos
- **Apache Cassandra:** Módulo de Comentarios Masivos
- **InfluxDB 3 Core:** Series Temporales y Estadísticas de Partidos
- **InterSystems IRIS:** Persistencia Orientada a Objetos y Multimodelo

El objetivo es diagnosticar la conectividad capa por capa (Configuración $\rightarrow$ Red $\rightarrow$ TCP $\rightarrow$ Protocolo $\rightarrow$ Autenticación $\rightarrow$ Contexto $\rightarrow$ Operación Mínima $\rightarrow$ API HTTP), garantizando que un contenedor activo no se confunda con un servicio disponible, y aislando fallas sin exponer secretos.

---

## 2. Estructura de Entregables

```text
hito-11-conectividad/
├── README.md                                  # Este documento: guía general y ejecución
├── package.json                               # Configuración de scripts y comandos de ejecución
├── .gitignore                                 # Protección contra filtración de secretos y logs locales
├── config/
│   ├── configuracion-ejemplo.env             # Plantilla de variables de entorno sin secretos
│   └── .gitignore                             # Exclusión de archivos .env y credenciales
├── scripts/
│   ├── evaluar_conectividad.ts                # Orquestador principal de diagnóstico
│   ├── evaluar_conectividad.ps1               # Runner para Windows PowerShell
│   ├── evaluar_conectividad.sh                # Runner para Linux / macOS
│   ├── prueba_tcp.ts                         # Verificación de sockets TCP y análisis de listeners
│   ├── prueba_clientes_nativos.ts             # Verificación con drivers oficiales y protocolos nativos
│   └── prueba_api.ts                         # Verificación de endpoints HTTP y cadena completa
└── docs/
    ├── mapa_de_dependencias.md                # Mapa técnico detallado de cada producto
    ├── topologia_y_entornos.md                # Topología de red, puertos y diferencias host vs docker
    ├── matriz_de_conectividad.md              # Matriz de estados por capa y diagnóstico técnico
    ├── diagnostico_de_fallas.md               # Análisis de errores y prueba de falla controlada
    ├── health_readiness.md                    # Estrategia de liveness, readiness y deep checks
    └── evidencia/
        ├── reporte_conectividad_inicial.md    # Reporte consolidado generado automáticamente
        ├── resultados_tcp.md                  # Evidencia y salidas de transporte TCP
        ├── resultados_clientes.md             # Evidencia y salidas de clientes nativos
        ├── resultados_api.md                  # Evidencia y salidas de rutas HTTP
        └── capturas_redactadas/               # Directorio para capturas y evidencias visuales
```

---

## 3. Requisitos y Preparación del Entorno

1. **Node.js:** Versión 24 LTS o compatible (probado en Node.js v25.9.0 / v24).
2. **Dependencias:** Instaladas en `hito-10-api` vía `pnpm install` (`mongodb`, `redis`, `neo4j-driver`, `cassandra-driver`, `@intersystems/intersystems-iris-native`, `fastify`).
3. **Variables de Entorno:**
   - Para ejecutar pruebas con parámetros personalizados, copiar `config/configuracion-ejemplo.env` como `.env` en la raíz de `hito-10-api` o en este directorio:
     ```bash
     cp config/configuracion-ejemplo.env ../hito-10-api/.env
     ```

---

## 4. Modos de Ejecución Rápida

La suite de diagnóstico puede ejecutarse mediante los scripts dedicados en PowerShell / Bash o mediante `pnpm` desde el directorio de la API:

### Opción A. Desde `hito-10-api/` con pnpm
```bash
# 1. Evaluación completa (TCP + Clientes Nativos + API):
pnpm eval:conectividad

# 2. Solo prueba de conectividad y sockets TCP:
pnpm eval:tcp

# 3. Solo prueba de clientes y drivers nativos:
pnpm eval:nativos

# 4. Solo prueba de endpoints de la API:
pnpm eval:api
```

### Opción B. En Windows con PowerShell (desde `hito-11-conectividad/`)
```powershell
# Evaluación completa generando reporte Markdown automático:
.\scripts\evaluar_conectividad.ps1 -All -Output "docs/evidencia/reporte_conectividad.md"

# Evaluación con la API en modo In-Process (Fastify inject):
.\scripts\evaluar_conectividad.ps1 -All -InProcess

# Solo pruebas TCP:
.\scripts\evaluar_conectividad.ps1 -Tcp

# Solo clientes nativos:
.\scripts\evaluar_conectividad.ps1 -Nativos
```

### Opción C. En Linux / macOS con Bash
```bash
# Otorgar permisos de ejecución
chmod +x scripts/evaluar_conectividad.sh

# Ejecución completa
./scripts/evaluar_conectividad.sh --all --output=docs/evidencia/reporte_conectividad.md
```

---

## 5. Convenciones de Estados y Clasificación

El sistema clasifica el resultado de cada prueba según los lineamientos de la cátedra (RNF9, 5.6):
- **`UP` (OK):** La prueba terminó exitosamente en la capa evaluada. Existe conectividad, protocolo válido, contexto accesible y respuesta no destructiva correcta.
- **`DOWN`:** La prueba falló por rechazo de puerto (`ECONNREFUSED`), timeout de socket (`ETIMEDOUT`) o error de conexión.
- **`DEGRADED`:** El socket TCP está abierto pero la capa lógica no opera con normalidad (ej. keyspace no creado o credencial inválida).
- **`NOT_CONFIGURED` / `SKIP`:** La prueba no fue ejecutada debido a la ausencia intencional de credenciales opcionales o herramientas en el entorno. No equivale a servicio caído.
- **`UNKNOWN`:** No se dispone de información técnica suficiente para dictaminar estado.

---

## 6. Documentación Detallada de Referencia

- [Mapa de Dependencias](docs/mapa_de_dependencias.md): Módulo, host, puerto, protocolo, contexto lógico, driver y endpoints asociados.
- [Topología y Entornos](docs/topologia_y_entornos.md): Diagrama de arquitectura, diferencias entre `localhost` de host y red Docker, y puertos publicados.
- [Matriz de Conectividad](docs/matriz_de_conectividad.md): Diagnóstico exhaustivo capa por capa para los 6 motores y la API.
- [Diagnóstico de Fallas y Simulación](docs/diagnostico_de_fallas.md): Diferenciación semántica de errores y escenario de falla controlada reversible.
- [Estrategia de Health & Readiness](docs/health_readiness.md): Análisis de liveness vs readiness, costos computacionales y por qué no encadenar chequeos profundos en cada request.
- [Evidencia de Pruebas TCP](docs/evidencia/resultados_tcp.md): Salidas de conectividad de puertos y sockets.
- [Evidencia de Clientes Nativos](docs/evidencia/resultados_clientes.md): Salidas de handshake, ping y lecturas acotadas con drivers.
- [Evidencia de Rutas API](docs/evidencia/resultados_api.md): Salidas HTTP, correlación con `x-request-id` y tiempos de respuesta.

---

## 7. Política de Seguridad y Sanitización (RNF7, RNF8)

- **Cero Secretos:** Ninguna contraseña, token Bearer ni clave privada se encuentra versionada en el código fuente ni en los reportes de evidencia.
- **Redacción Automática:** Las URIs de bases de datos que contienen credenciales son redactadas automáticamente (`mongodb://admin:******@127.0.0.1:27017/...`).
- **Pruebas No Destructivas:** Todas las verificaciones se limitan a lecturas (`findOne`, `MATCH`, `SELECT`, `PING`), health checks o escrituras efímeras con TTL que expiran automáticamente.
