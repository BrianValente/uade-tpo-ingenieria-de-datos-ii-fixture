# Documento de Decisiones Técnicas — Hito 4: Módulo Documental de Equipos y Jugadores del Fixture 2030

**Materia:** Ingeniería de Datos II — UADE  
**Proyecto:** Plataforma de Fixture del Mundial 2030  
**Motor de Base de Datos:** MongoDB 7.x (Documental / NoSQL)  

---

## 1. Tabla Resumen de Decisiones de Diseño Técnico

A continuación se detallan las decisiones arquitectónicas y de modelado adoptadas para el módulo documental, justificando técnicamente su elección frente a las alternativas consideradas y analizando el impacto esperado en rendimiento, escalabilidad y consistencia.

| Decisión | Alternativas consideradas | Elección | Justificación | Impacto esperado |
| :--- | :--- | :--- | :--- | :--- |
| **Relación equipo–jugador** | 1. *Embedding puro*: Documento de equipo con arreglo `jugadores: [...]` embebido.<br>2. *Referencia pura*: Colección `jugadores` con `equipo_id` (modelo relacional estándar).<br>3. *Híbrido (Referencia + Desnormalización selectiva)*. | **Híbrido (Colecciones separadas con Referencia por `codigo_fifa` y desnormalización de `equipo_nombre`)** | Incrustar 25-30 jugadores en el equipo violaría el principio de crecimiento controlado y aumentaría el tamaño del documento a modificar por cada cambio menor (ej: actualización de goles o tarjetas). Además, complicaría consultas transversales (ej: "jugadores de la Premier League" o "tabla de goleadores"). La referencia por `codigo_fifa` combinada con el nombre del equipo desnormalizado permite consultas rápidas de listas de jugadores sin requerir `$lookup`. | Operaciones de actualización atómicas sobre jugadores aislados, tamaño de documento predecible y lecturas de alta velocidad sin sobrecargar la red. |
| **Validación documental** | 1. *Sin validación* (schema-less en motor, validación en app).<br>2. *JSON Schema Validator nativo* en MongoDB (`validationLevel: "strict"`, `validationAction: "error"`).<br>3. *Validación a nivel API/ORM* (ej: Mongoose / Pydantic). | **JSON Schema Validator nativo en MongoDB** | Garantiza la integridad de datos directamente en el motor de persistencia independientemente del cliente que inserte (mongosh, scripts ETL, API). Se definieron restricciones estrictas de tipos BSON, expresiones regulares (`^[A-Z]{3}$` para código FIFA), rangos numéricos (edad 15-50, ranking 1-211) y enumeraciones de confederaciones y posiciones. | Imposibilidad de persistir documentos corruptos o incompletos. Rechazo automático en tiempo de inserción/actualización con impacto cero en la capa de datos. |
| **Estrategia de identificadores** | 1. *Solo `_id` ObjectId autogenerado*.<br>2. *Clave natural de negocio como `_id` (`_id: "ARG"`)*.<br>3. *ObjectId estándar como `_id` + Clave natural indexada con restricción `unique: true`*. | **ObjectId nativo para `_id` + Claves de negocio únicas indexadas (`codigo_fifa` en equipos y `{equipo_codigo, numero_camiseta}` en jugadores)** | El `ObjectId` de 12 bytes proporciona ordenamiento temporal implícito y distribución uniforme en sharding futuro. Las claves de negocio (`codigo_fifa` y `numero_camiseta`) cuentan con índices únicos secundarios, lo que ofrece flexibilidad y compatibilidad con estándares internacionales (ISO/FIFA). | Integridad referencial garantizada sin riesgo de colisión, búsquedas por código natural en tiempo $O(1)$ gracias al índice `unique`. |
| **Índices principales** | 1. *Solo índice por defecto `_id`* (COLLSCAN para el resto).<br>2. *Indexación de todos los atributos* (sobrecosto en disco y escrituras).<br>3. *Indexación estratégica compuesta y selectiva según patrones de acceso*. | **Índices compuestos y específicos según patrones de consulta identificados**: `codigo_fifa` (unique), `confederacion`, `{grupo: 1, ranking_fifa: 1}`, `{equipo_codigo: 1, posicion: 1}`, `{equipo_codigo: 1, numero_camiseta: 1}` (unique), `club_actual.liga`, `valor_mercado_eur: -1`, `{apellido: 1, nombre: 1}`. | Cada índice responde a un caso de uso concreto del Fixture 2030: armar planteles por posición, filtrar por ligas, ordenar top de jugadores más valiosos y búsquedas por grupo. Evita el escaneo total de colecciones (`COLLSCAN`) reduciendo `totalDocsExamined` a solo los documentos devueltos. | Rendimiento óptimo en lecturas ($IXSCAN$), reducción del tiempo de respuesta a < 5ms y uso racional de memoria RAM (Working Set). |
| **Carga y actualización** | 1. *Inserciones secuenciales `insertOne`* con riesgo de duplicados.<br>2. *Drop and recreate* destructivo en cada corrida.<br>3. *Carga reproducible e idempotente mediante `bulkWrite` y `updateOne` con `{upsert: true}`*. | **Carga idempotente mediante `bulkWrite` con operaciones de `upsert`** | Permite ejecutar el script de inicialización o sincronización múltiples veces sin duplicar registros ni fallar por violaciones de clave única. Agrupa cientos de operaciones en un solo viaje de red (*batch network roundtrip*). | Carga de 64 equipos y 1.600 jugadores en menos de 2 segundos, reproducibilidad absoluta (RNF1, RF8) y consistencia del 100%. |

---

## 2. Ambiente de Ejecución y Persistencia

### 2.1 Orquestación con Docker Compose
El entorno se encuentra definido en el archivo `compose.yaml` utilizando la imagen oficial `mongo:7.0`.

- **Persistencia**: Se configuró el volumen persistente con nombre `mongodb_data` mapeado al directorio interno `/data/db`. De esta forma, si el contenedor se detiene o se reinicia (`docker compose down` / `docker compose up`), ningún dato es destruido.
- **Inicialización Automatizada**: La carpeta `./init-scripts` se mapea a `/docker-entrypoint-initdb.d:ro`. Los scripts se ejecutan secuencialmente en la primera inicialización:
  - `01-schema-validation.js`: Aplica las reglas `$jsonSchema` a `equipos` y `jugadores`.
  - `02-indexes.js`: Crea los índices primarios y compuestos.
  - `03-seed-data.js`: Inserta las 64 selecciones y los 1.600 jugadores.
- **Healthcheck**: Se implementó una verificación de salud mediante `mongosh --eval "quit(db.runCommand({ ping: 1 }).ok ? 0 : 2)"` para garantizar que el servicio solo se considere listo cuando la base de datos responda consultas activamente.

---

## 3. Modelo Documental de Datos

### 3.1 Colección: `equipos`
Representa a las **64 selecciones nacionales** clasificadas para el torneo.

```json
{
  "_id": { "$oid": "66d0c1e4f1a2b3c4d5e6f701" },
  "codigo_fifa": "ARG",
  "nombre": "Argentina",
  "confederacion": "CONMEBOL",
  "ranking_fifa": 1,
  "grupo": "Grupo A",
  "entrenador": {
    "nombre": "Lionel Scaloni",
    "nacionalidad": "Argentina",
    "edad": 52
  },
  "titulos_mundiales": 3,
  "estadio_sede_principal": "Estadio Monumental, Buenos Aires",
  "activo": true,
  "creado_en": { "$date": "2026-08-31T21:00:00.000Z" },
  "actualizado_en": { "$date": "2026-08-31T21:00:00.000Z" }
}
```

### 3.2 Colección: `jugadores`
Representa a los **1.600 futbolistas** (25 por selección) con información personal, táctica, de club y estadísticas.

```json
{
  "_id": { "$oid": "66d0c1e4f1a2b3c4d5e6f801" },
  "nombre": "Lionel",
  "apellido": "Messi",
  "equipo_codigo": "ARG",
  "equipo_nombre": "Argentina",
  "posicion": "Delantero",
  "numero_camiseta": 10,
  "edad": 38,
  "fecha_nacimiento": "1987-06-24",
  "altura_cm": 170,
  "peso_kg": 72,
  "pie_habil": "Izquierdo",
  "club_actual": {
    "nombre": "Inter Miami",
    "pais": "Estados Unidos",
    "liga": "MLS"
  },
  "estadisticas_seleccion": {
    "partidos_jugados": 187,
    "goles": 109,
    "asistencias": 58,
    "tarjetas_amarillas": 8,
    "tarjetas_rojas": 1
  },
  "valor_mercado_eur": 35000000,
  "capitan": true,
  "titular_habitual": true,
  "creado_en": { "$date": "2026-08-31T21:00:00.000Z" },
  "actualizado_en": { "$date": "2026-08-31T21:00:00.000Z" }
}
```

---

## 4. Operaciones, Consultas y Agregaciones

Se diseñaron e implementaron scripts específicos en la carpeta `queries/` para dar cobertura exhaustiva a cada requisito funcional:

1. **`01-inserts.js` (RF9)**:
   - Inserción de nuevas entidades válidas.
   - Demostración de rechazo ante violación de esquema JSON (confederación no permitida o edad inválida).
2. **`02-updates.js` (RF9)**:
   - Modificación del cuerpo técnico de un equipo.
   - Actualización atómica incremental (`$inc`) de estadísticas tras un partido oficial.
   - Traspaso de club de un futbolista (`$set` de subdocumento embebido).
3. **`03-queries.js` (RF10)**:
   - **Búsqueda directa**: Recuperación de selección por `codigo_fifa` y jugador por `{equipo_codigo, numero_camiseta}`.
   - **Filtros de negocio**: Selecciones de CONMEBOL en el top 30 del ranking FIFA; Delanteros jóvenes (< 25 años) en ligas top.
   - **Proyección**: Retorno selectivo de campos esenciales para optimizar payload de red.
   - **Ordenamiento y Paginación**: Simulación de navegación en interfaz de usuario (`sort({ valor_mercado_eur: -1 })`, `skip()`, `limit()`).
4. **`04-aggregations.js` (RF11)**:
   - **Pipeline 1**: Métricas consolidadas por confederación (total selecciones, total jugadores, edad promedio, valor de mercado acumulado y promedio de goles).
   - **Pipeline 2**: Ranking de las 5 ligas de clubes que aportan más jugadores a la Copa del Mundo.
   - **Pipeline 3**: Desglose táctico y valor de mercado total por equipo dentro del Grupo A.
5. **`05-explain-benchmark.js` (RF12, RF13)**:
   - Comparación de costo y estrategia con `.explain("executionStats")`.

---

## 5. Análisis de Rendimiento e Índices

### Comparativa de Ejecución: Con Índice vs Sin Índice

| Consulta de Negocio | Sin Índice (`COLLSCAN`) | Con Índice (`IXSCAN`) | Mejora Observada |
| :--- | :--- | :--- | :--- |
| **Buscar plantel por equipo y posición**<br>`{ equipo_codigo: "ARG", posicion: "Delantero" }` | Examina **1.600 documentos**.<br>Stage: `COLLSCAN`.<br>Tiempo: ~3-6 ms. | Examina **6 documentos** (`totalDocsExamined: 6`).<br>Stage: `IXSCAN` (`idx_jugadores_equipo_posicion`).<br>Tiempo: < 1 ms. | **Reducción del 99.6%** en documentos leídos. |
| **Buscar jugadores por liga de club**<br>`{ "club_actual.liga": "Premier League" }` | Examina **1.600 documentos**.<br>Stage: `COLLSCAN`. | Examina solo las entradas del índice `idx_jugadores_club_liga`.<br>Stage: `IXSCAN`. | Ratio `nReturned / totalDocsExamined = 1.0`. |
| **Top jugadores por valor de mercado**<br>`sort({ valor_mercado_eur: -1 }).limit(10)` | Requiere carga completa en memoria y etapa `SORT` en RAM. | Utiliza el índice ordenado `idx_jugadores_valor_mercado_desc`.<br>Etapa: `IXSCAN` sin consumo de memoria para sort. | Cero costo de ordenamiento en memoria (*In-Memory Sort* eliminado). |

---

## 6. Vínculo con Hitos Previos y Consideraciones de Arquitectura

- **Vínculo con Hito 2 (Selección de Modelos)**: En la matriz de decisiones se estableció que el módulo de Equipos y Jugadores presentaba un patrón de acceso predominantemente documental (consultas frecuentes por entidad completa, variabilidad en atributos deportivos y alta necesidad de lecturas concurrentes). MongoDB fue seleccionado por su soporte nativo para esquemas semiestructurados, subdocumentos embebidos (club actual, estadísticas) y escalabilidad horizontal.
- **Vínculo con Hito 3 (Arquitectura Distribuida)**: La separación de jugadores y equipos mediante claves naturales (`codigo_fifa`) y claves compuestas únicas facilita una futura estrategia de sharding (por ejemplo, particionamiento por `confederacion` o `equipo_codigo`), evitando operaciones de scatter-gather y garantizando que los datos de un mismo plantel se almacenen en el mismo shard.
- **Limitaciones Detectadas**:
  - MongoDB no provee integridad referencial relacional automática (foreign keys en cascada). Esta regla de negocio se garantiza mediante la validación previa en los scripts de ingesta y mediante índices únicos.
  - La desnormalización de `equipo_nombre` en la colección `jugadores` requiere que, si una selección cambia de nombre oficial, se realice un `updateMany` controlado. Dado que los nombres de los países en un Mundial son altamente estables, el beneficio de lectura supera ampliamente el costo eventual de sincronización.
