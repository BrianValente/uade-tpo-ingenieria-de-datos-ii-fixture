# Fixture 2030 — Módulo Documental (MongoDB)

**Trabajo Práctico Obligatorio — Hito 4**  
**Materia:** Ingeniería de Datos II — UADE  
**Base de Datos:** MongoDB 7.0 (Docker Compose)  

---

## 📌 Descripción del Módulo

Este repositorio contiene la implementación completa y reproducible del **Módulo Documental de Equipos y Jugadores** para la plataforma del Fixture del Mundial 2030.

### Métricas del Modelo
- **64 Selecciones Nacionales** persistidas con información oficial, confederación continental, ranking FIFA, grupo asignado (Grupos A a P), director técnico y sede principal.
- **1.600 Jugadores** persistidos (25 por selección) con datos personales, posición, club actual, valor de mercado y estadísticas de selección.
- **Validación Estricta con JSON Schema Validator** para garantizar la integridad documental directamente en el motor de base de datos.
- **Índices Estratégicos** que optimizan los tiempos de respuesta y reducen el escaneo de colecciones.
- **Consultas CRUD, Paginación, Proyecciones y Pipelines de Agregación Analítica**.

---

## 🚀 Requisitos Previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (o Docker Engine con Docker Compose).
- [Node.js](https://nodejs.org/) (v18 o superior) *(opcional para ejecutar scripts locales)*.
- [MongoDB Compass](https://www.mongodb.com/products/compass) o `mongosh` *(opcional para visualización gráfica)*.

---

## ⚡ Guía de Inicio Rápido

### 1. Variables de Entorno
Asegurarse de tener el archivo `.env` configurado (puedes copiarlo desde `.env.example`):

```bash
cp .env.example .env
```

Contenido por defecto:
```env
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=password
MONGO_DATABASE=fixture2030
MONGO_PORT=27017
```

### 2. Iniciar el Entorno con Docker Compose

```bash
docker compose up -d
```

Comprobar el estado del contenedor:
```bash
docker compose ps
```
El contenedor estará listo cuando su estado indique `healthy`.

> 💡 **Inicialización Automática**: En la primera ejecución con un volumen nuevo, MongoDB ejecuta automáticamente los scripts de `init-scripts/`:
> 1. `01-schema-validation.js`: Aplica las validaciones JSON Schema estrictas a `equipos` y `jugadores`.
> 2. `02-indexes.js`: Construye los índices únicos y compuestos.
> 3. `03-seed-data.js`: Carga las 64 selecciones y los 1.600 futbolistas de forma reproducible e idempotente.

---

## 🔌 Conexión a la Base de Datos

### Conectar mediante MongoDB Compass
URI de conexión:
```text
mongodb://admin:password@localhost:27017/fixture2030?authSource=admin
```

### Conectar mediante `mongosh` interactivo
```bash
docker compose exec mongodb mongosh --username admin --password password --authenticationDatabase admin fixture2030
```

---

## 📊 Ejecución de Operaciones y Consultas

Puedes ejecutar las consultas y demostraciones de dos formas:

### Opción A: Mediante Node.js (Recomendado)

Instalar dependencias y ejecutar todas las pruebas y consultas en un solo comando:

```bash
npm install
npm test
```

O ejecutar por partes:
```bash
node scripts/runner.js init     # Inicializar esquemas, índices y carga de datos
node scripts/runner.js queries  # Ejecutar todas las consultas, agregaciones y explain
node scripts/runner.js all      # Ejecutar el flujo completo de punta a punta
```

---

### Opción B: Mediante `mongosh` dentro del Contenedor Docker

Puedes ejecutar cada script individualmente dentro del contenedor:

```bash
# 1. Inserciones válidas y verificación de rechazo por JSON Schema
docker compose exec mongodb mongosh -u admin -p password --authenticationDatabase admin fixture2030 queries/01-inserts.js

# 2. Actualizaciones atómicas ($set, $inc, traspasos)
docker compose exec mongodb mongosh -u admin -p password --authenticationDatabase admin fixture2030 queries/02-updates.js

# 3. Consultas: Identificación directa, filtros de negocio, proyección y paginación
docker compose exec mongodb mongosh -u admin -p password --authenticationDatabase admin fixture2030 queries/03-queries.js

# 4. Pipelines de Agregación analítica
docker compose exec mongodb mongosh -u admin -p password --authenticationDatabase admin fixture2030 queries/04-aggregations.js

# 5. Análisis de rendimiento con explain("executionStats")
docker compose exec mongodb mongosh -u admin -p password --authenticationDatabase admin fixture2030 queries/05-explain-benchmark.js
```

---

## 📂 Estructura del Proyecto

```text
uade-tpo-ingenieria-de-datos-ii-fixture/
│
├── .env.example                                       # Plantilla de configuración
├── .env                                               # Variables locales de entorno
├── compose.yaml                                       # Definición del servicio MongoDB 7.0 y volumen persistente
├── package.json                                       # Dependencias y scripts de Node.js
│
├── init-scripts/                                      # Scripts de inicialización automática en Docker
│   ├── 01-schema-validation.js                        # Validaciones JSON Schema (strict / error)
│   ├── 02-indexes.js                                  # Creación de índices compuestos y únicos
│   └── 03-seed-data.js                                # Ingesta de 64 selecciones y 1.600 jugadores
│
├── data/                                              # Generación y almacenamiento del dataset
│   ├── generate-dataset.js                            # Script determinístico generador de datos
│   ├── equipos.json                                   # Dataset de 64 equipos (Grupos A a P)
│   └── jugadores.json                                 # Dataset de 1.600 jugadores
│
├── queries/                                           # Scripts modulares de consultas y operaciones
│   ├── 01-inserts.js                                  # Inserciones y control de errores por schema (RF9)
│   ├── 02-updates.js                                  # Actualizaciones atómicas ($set, $inc) (RF9)
│   ├── 03-queries.js                                  # ID, filtros, proyección, orden y paginación (RF10)
│   ├── 04-aggregations.js                             # 3 Pipelines de Agregación analíticos (RF11)
│   └── 05-explain-benchmark.js                        # Benchmarks comparativos con explain() (RF12, RF13)
│
├── scripts/                                           # Ejecutores auxiliares
│   └── runner.js                                      # Runner unificado en Node.js
│
├── docs/                                              # Documentación técnica de entrega
│   └── Grupo_N_Hito_4_Decisiones_Documentales_Fixture2030.md  # Justificación técnica completa
│
└── README.md                                          # Guía de reproducción y documentación general
```

---

## 🛑 Detención y Gestión del Entorno

Para detener los contenedores conservando los datos:
```bash
docker compose down
```

Para reiniciar desde cero (eliminando el volumen de datos persistente):
```bash
docker compose down -v
docker compose up -d
```
