# Referencia local de latencia

## Método y entorno

Se ejecutó `pnpm --silent measure:latency` el 16 de octubre de 2026 a las
18:42:06 UTC contra la API HTTP real en `http://127.0.0.1:8000`, iniciada mediante
`pnpm dev:lab`. Los adaptadores consultaron los seis servicios reales del proyecto
Compose `fixture2030`; no se usaron dobles de prueba.

Cliente y API usaron Node.js 24.22.0. La notebook es ARM64, Apple M3 Pro, con
11 CPU lógicas y 18 GiB de RAM; el sistema reportó Darwin 27.0.0. Los motores
corrieron en Docker Desktop y compartieron la notebook con otros procesos.
Los timeouts de adaptadores mantienen la configuración de laboratorio de 2000 ms.

El script usa `fetch()` y `performance.now()`. La duración comienza antes de la
solicitud y termina después de leer y parsear el JSON completo. Incluye HTTP,
autenticación por sesión, consulta y transformación; no es el tiempo interno del
driver. Cada caso tuvo tres solicitudes de calentamiento y veinte medidas, con
concurrencia **uno** y reutilización de conexiones del cliente HTTP. Cada solicitud
tuvo un límite de espera de 10 segundos.

Volumen del script: **160 solicitudes medidas**, 24 de calentamiento y dos de
control para login/logout: **186 solicitudes HTTP** en total. Todos los perfiles
medidos respondieron `200`; el script se detiene si recibe otro estado.

La media usa todas las duraciones medidas. El p95 usa _nearest rank_: ordenar
las veinte muestras y tomar la posición `ceil(0.95 × 20) = 19`, contando desde uno.
No se descartaron valores altos. Las cifras se redondearon a tres decimales.

## Resultados observados

| Perfil                            | Volumen nominal de respuesta                         | Muestras | Media (ms) | p95 (ms) | Máximo (ms) |
| --------------------------------- | ---------------------------------------------------- | -------- | ---------- | -------- | ----------- |
| Redis: sesión                     | Una sesión, 201 bytes.                               | 20       | 1.237      | 2.141    | 2.717       |
| MongoDB: equipo ARG               | Un equipo, 222 bytes.                                | 20       | 2.987      | 3.766    | 10.762      |
| MongoDB: plantel, página 1        | Cinco jugadores de 24, 1665 bytes.                   | 20       | 3.283      | 4.329    | 4.625       |
| Neo4j + MongoDB: ficha de partido | Un partido y dos fichas, 697 bytes.                  | 20       | 7.208      | 9.048    | 11.388      |
| Neo4j: eventos                    | Dos eventos, límite cinco, 446 bytes.                | 20       | 6.157      | 9.937    | 14.810      |
| Cassandra: comentarios            | Dos comentarios, límite dos, 636 bytes.              | 20       | 3.422      | 5.916    | 6.228       |
| InfluxDB: intervalo de un minuto  | Cero equipos con puntos en ese intervalo; 102 bytes. | 20       | 3.716      | 5.575    | 5.629       |
| IRIS: detalle de partido          | Un agregado finalizado con dos eventos, 724 bytes.   | 20       | 18.374     | 20.219   | 20.383      |

Las rutas, parámetros exactos, tamaños y las 160 muestras están en
[`latencia-local.json`](latencia-local.json), que conserva la salida de la corrida.
Los ejemplos ilustrativos de OpenAPI no se usaron como resultados de medición.

## Reproducción

Con los servicios saludables y los datos de laboratorio cargados, iniciar en una
terminal desde `hito-10-api/`:

```bash
pnpm dev:lab
```

En otra terminal, desde la misma carpeta:

```bash
pnpm --silent measure:latency
```

El comando lee las contraseñas locales para iniciar sesión; no las imprime ni
guarda tokens. Cierra su propia sesión al terminar. No crea comentarios ni cambia
objetos de negocio. Emite JSON por stdout para permitir conservar otra corrida
por separado sin reemplazar esta evidencia.

Se pueden configurar `MEASURE_URL`, `MEASURE_REQUESTS`, `MEASURE_WARMUP` y
`MEASURE_IRIS_CODE` mediante el entorno. Los valores predeterminados son la URL
local, veinte, tres y `F2030-IRIS-0011`. En una carga nueva del Hito 9, usar el
código de partido que informó su demostración; el contador puede generar otro
código. La medición no crea un objeto para reemplazarlo. Se deben
registrar esos valores si se cambia el procedimiento. El comando solo acepta una
URL HTTP local sin credenciales embebidas.

## Limitaciones

- Es una referencia secuencial con datos pequeños y calentamiento, no una prueba
  de carga, saturación ni escalabilidad.
- Veinte muestras no estabilizan un percentil de producción: el p95 corresponde
  a una posición muy próxima al máximo y puede cambiar entre corridas.
- No se aisló CPU, memoria, caché o tráfico de la notebook y los contenedores.
- El volumen nominal describe las solicitudes y sus respuestas. No se contó el
  tamaño global de todas las bases durante esta medición.
- InfluxDB midió una consulta válida sin puntos. Su cifra no demuestra el coste de
  agregar un intervalo con gran cantidad de puntos.
- No se midieron escrituras, Argon2 del login ni logout dentro de los perfiles.
- Las cifras no demuestran los objetivos de millones de usuarios, p95 global
  menor a 100 ms ni disponibilidad distribuida del escenario académico.

Las evidencias anteriores indicaban que todavía no se había medido rendimiento.
Este registro agrega una referencia básica posterior; no convierte aquellas
pruebas funcionales en un benchmark.
