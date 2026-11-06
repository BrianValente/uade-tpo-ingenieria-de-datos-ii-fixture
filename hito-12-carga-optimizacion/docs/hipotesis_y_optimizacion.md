# Hipótesis, optimizaciones y trade-offs — Hito 12

## 1. Hipótesis sobre el flujo integrado

El flujo medido combina autorización y sesión Redis con lecturas documentales MongoDB y consultas deportivas Neo4j. La [línea base](linea_base.md) y su [telemetría original](evidencia/resultados_linea_base.json) son el control experimental.

| Hipótesis | Cambio implementado | Costo o compromiso |
| :--- | :--- | :--- |
| H1: los pools pequeños y la amplificación de consultas pueden limitar las lecturas compuestas | **O1:** pools de 5 a 25, proyección BSON, lote `$in` para resolver ambos equipos y búsqueda de plantel por `equipoCodigo` | Más conexiones y recursos; conservar la validación de existencia del equipo y el contrato de paginación |
| H2: recalcular las mismas entidades desperdicia trabajo sobre claves repetidas | **O2:** caché Read-Aside Redis de equipos y planteles (300 s), partidos (120 s) y eventos (15 s) | RAM adicional y datos potencialmente desactualizados hasta el TTL si no se invalida al escribir |
| H3: renovar la sesión en cada lectura añade escrituras redundantes | **O3:** amortización Lua de 60 s; siempre valida sesión y TTL, pero limita `HSET` y `EXPIRE` | Menor resolución de última actividad y vencimiento efectivo de entre 29 y 30 minutos de inactividad |

La implementación y la configuración efectiva residen en [`servidor_optimizado.ts`](../scripts/servidor_optimizado.ts). Estos modos pertenecen al benchmark. El servidor del Hito 10 conserva sus adaptadores y el Hito 13 tiene instrumentación propia; una mejora del benchmark no se atribuye automáticamente a todos los procesos del repositorio.

## 2. Diseño experimental y devolución docente

La devolución pide **al menos una comparación que cambie una sola optimización** respecto del control. La comparación `baseline` → **`isolated_o2`** activa únicamente la política de caché:

- Pools MongoDB y Neo4j en 5, igual que la base.
- Proyecciones y batching O1 desactivados.
- Amortización de renovación O3 desactivada; la sesión se renueva por petición.
- Mismos parámetros de concurrencia, semilla, sesiones, calentamiento, rampa, sostenimiento y tope de operaciones.
- Preparación previa en cada corrida: caché fría y sesiones vigentes en el mismo alcance de prueba.

```bash
pnpm --dir hito-10-api h12:linea-base
pnpm --dir hito-10-api h12:aislada --mode=isolated_o2
pnpm --dir hito-10-api h12:aislada --mode=isolated_o1
pnpm --dir hito-10-api h12:optimizada
pnpm --dir hito-10-api h12:validar
```

El modo **`isolated_o1` evalúa un paquete de tres cambios** (pools, proyección y batching), con O2 y O3 apagadas. No permite atribuir la diferencia a los pools solos. El modo **`optimized` activa O1+O2+O3** y mide su efecto conjunto, no tres contribuciones independientes. O3 no tiene una corrida aislada publicada y no se le adjudica un porcentaje individual de mejora.

## 3. Resultados reproducibles

| Comparación | Salidas originales | Interpretación permitida |
| :--- | :--- | :--- |
| Base → solo O2 | [JSON O2](evidencia/resultados_isolated_o2.json), [comparación O2](evidencia/comparacion_isolated_o2.md) | Diferencia observada al activar la política de caché en este escenario |
| Base → paquete O1 | [JSON O1](evidencia/resultados_isolated_o1.json), [comparación O1](evidencia/comparacion_isolated_o1.md) | Diferencia del paquete de acceso a datos; no identifica sus efectos internos |
| Base → conjunto O1+O2+O3 | [JSON optimizado](evidencia/resultados_optimizados.json), [tablas y gráficos](evidencia/tablas_o_graficos.md) | Efecto conjunto del flujo optimizado |

Los reportes conservan fecha, commit, condiciones y métricas generadas por los runners. El calentamiento y la ventana medida se informan por separado. Un reporte con errores HTTP o payloads inválidos no se interpreta como una mejora funcional, aunque aumente el throughput.

## 4. Lectura de la telemetría

- Comparar p50/p95/p99 **E2E** junto con la tasa de errores y la integridad; un percentil de driver no es el percentil del usuario.
- Comparar operaciones por motor y por solicitud: completar más solicitudes en la misma ventana puede aumentar el total de operaciones aunque reduzca el costo por request.
- `isHotKey` describe la selección del generador, **no** un cache hit. Una clave fría también puede estar cacheada después de su primer acceso.
- `cacheHits`, `cacheMisses` y `cacheWrites` miden el comportamiento real de la caché; no deben inferirse del reparto 80/20.
- Los recursos Docker y la memoria del proceso son instantáneas antes/después, no picos de una serie temporal.

## 5. Decisiones y límites

El grupo conserva O1, O2 y O3 como alternativas implementadas para estudiar el acceso a datos. La adopción conjunta se evalúa con los resultados actuales y sus compromisos: más sockets, RAM Redis, frescura de datos e invalidación de caché. La latencia de un laboratorio con emulación de CPU no certifica rendimiento de producción. Una sola ventana breve tampoco elimina el ruido del host ni valida escalamiento horizontal, quórum o failover multi-región.

La [validación de integridad](integridad_y_limitaciones.md) y la separación entre el camino operacional y el [Data Mart propuesto](integracion_data_mart.md) siguen siendo requisitos distintos del throughput.
