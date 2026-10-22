# Estrategia de Health, Readiness y Diagnóstico

**Asignatura:** Ingeniería de Datos II  
**Hito:** 11 — Evaluación de Conectividad a los Productos del Fixture 2030  
**Fecha:** Octubre 2026  

---

## 1. Separación de Responsabilidades: Liveness vs. Readiness

En arquitecturas políglotas con múltiples motores NoSQL, una política inadecuada de health check puede provocar caídas en cascada o falsos positivos. Se definen tres niveles de evaluación claramente diferenciados:

```mermaid
flowchart LR
    LB["Balanceador / Orquestador"] -->|Cada 5s| Liveness["1. Liveness Probe<br>GET /health"]
    LB -->|Al iniciar o desplegar| Readiness["2. Readiness Probe<br>GET /ready"]
    Admin["Monitoreo / SRE"] -->|Bajo demanda / Cada 30s| DeepCheck["3. Diagnóstico por Dependencia<br>Scripts Hito 11"]
```

### A. Liveness Probe (`GET /health`) — *Implementado en Hito 10*
- **Propósito:** Responder si el proceso Node.js / Fastify está vivo y el event loop puede despachar solicitudes HTTP.
- **Estado de implementación:** Actualmente implementado en `hito-10-api` (`src/app/routes/health.route.ts`).
- **Comportamiento:** No realiza consultas a ninguna base de datos ni a la red externa. Retorna un objeto estático:
  ```json
  {
    "status": "ok",
    "service": "fixture2030-api"
  }
  ```
- **Costo computacional:** Virtualmente nulo (< 1ms).
- **Frecuencia admisible:** Alta (cada 5 a 10 segundos).
- **Criterio de falla:** Si no responde dentro de 2000ms, el orquestador (Docker/K8s) reinicia el contenedor de la API.

### B. Readiness Probe (`GET /ready`) — *Propuesta Arquitectónica / Futura Extensión*
- **Propósito:** Indicar si la API está en condiciones de recibir y despachar tráfico real de usuarios hacia los motores NoSQL.
- **Estado de implementación:** **Propuesta de diseño arquitectónico** (no implementada en el código base actual de Hito 10 para no sobrecargar el core antes de validar conectividad elemental).
- **Diseño propuesto:** Comprueba las dependencias críticas mínimas de infraestructura requeridas para el arranque (por ejemplo, que Redis o MongoDB respondan al handshake inicial con timeouts acotados).
- **Criterio de degradación:** Si una dependencia secundaria (ej. Cassandra o InfluxDB) no responde, la API puede declararse en estado `DEGRADED`, sirviendo tráfico para los módulos sanos mientras se aísla el módulo afectado.

### C. Diagnóstico Profundo por Dependencia (Deep Check / Suite Hito 11)
- **Propósito:** Proporcionar visibilidad detallada y granular del estado de cada motor (MongoDB, Redis, Neo4j, Cassandra, InfluxDB, IRIS) en las capas de Transporte, Protocolo y Contexto.
- **Herramienta:** Implementado en la suite de scripts reproducibles (`scripts/evaluar_conectividad.ts`).
- **Estados reportados:** `UP`, `DOWN`, `DEGRADED`, `NOT_CONFIGURED`, `SKIP`.

---

## 2. Justificación Técnica: Por qué NO consultar todas las bases en cada request

El enunciado del Hito 11 establece explícitamente:
> *"No se deberá consultar indiscriminadamente todas las bases en cada request normal. Si se implementa un chequeo profundo, se deberá documentar su frecuencia, timeout y costo."*

### Razones Técnicas Fundamentales:
1. **Evitar la Amplificación de Tráfico y Latencia:** Si cada consulta a `GET /equipos/ARG` disparase un ping a Cassandra, Neo4j, InfluxDB y Redis, la latencia de respuesta se degradaría al peor caso de la suma de todas las bases.
2. **Eliminación del Punto Único de Falla Artificial:** Consultar todas las bases en cada petición provocaría que una falla en InfluxDB bloquee o tire abajo una consulta puramente documental de MongoDB.
3. **Saturación del Pool de Conexiones:** Los handshakes y pings concurrentes consumirían conexiones en sockets y descriptores de archivo innecesariamente.
4. **Protección del Event Loop:** Fastify utiliza un modelo asíncrono no bloqueante. Esperar timeouts múltiples en un solo request bloquea recursos del servidor.

---

## 3. Especificación de Parámetros Operativos

| Parámetro | Valor Recomendado | Justificación Técnica |
|:---|:---:|:---|
| **Timeout por Dependencia (`DEPENDENCY_TIMEOUT_MS`)** | `2000ms` (2 segundos) | Evita retenciones prolongadas de hilos HTTP ante caídas de red; falla rápido para liberar recursos. |
| **Request Timeout Global de la API** | `10000ms` (10 segundos) | Límite superior para operaciones complejas o combinadas antes de cortar la conexión. |
| **Frecuencia de Diagnóstico Periódico** | Cada `30` a `60` segundos | Intervalo óptimo para telemetría sin generar sobrecarga sobre los motores. |
| **Política de Reintentos** | Máximo 1 reintento con backoff lineal | Impide el efecto "thundering herd" contra una base que se está recuperando. |
| **Estrategia ante Degradación** | Fallo controlado con status HTTP 503 (`DEPENDENCY_FAILED`) | En la API de Hito 10 (`src/app/errors/api-error.ts`), las fallas de dependencias o timeouts de adaptadores NoSQL se traducen en HTTP 503 Service Unavailable (con payload estructurado `{ statusCode: 503, error: "Service Unavailable", message: "..." }`). El código 504 Gateway Timeout queda reservado exclusivamente para la capa de reverse proxy o gateway perimetral si el proceso Node.js dejase de responder por completo. |
