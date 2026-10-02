# Ciclo de vida e invalidación

## Sesiones

1. **Crear:** el consumidor provee un ID de sesión sintético, usuario y dispositivo. `crear_sesion.lua` rechaza un ID existente y guarda atributos junto con `EXPIRE 1800`.
2. **Recuperar:** la sesión debe existir, tener TTL positivo y `estado_acceso=autorizado`. La consulta sin actividad autenticada no modifica última actividad ni TTL.
3. **Renovar:** cada request autenticado ejecuta `actividad_sesion.lua`. Comprueba vigencia, actualiza última actividad y renueva el TTL a 1800 s.
4. **Expirar:** Redis elimina la clave por inactividad. El consumidor recibe ausencia y debe pedir login. No usamos un proceso que recorra sesiones para vencerlas.
5. **Cerrar o invalidar:** `finalizar_sesion` borra la clave exacta. El otro dispositivo conserva su sesión.
6. **Fallo de Redis u OOM:** propagamos el error. El consumidor no debe autorizar la operación ni informar una renovación exitosa.

Los scripts no verifican contraseñas ni implementan una API de autenticación. `autenticada=True` representa una request autenticada del consumidor. Los IDs legibles de las demostraciones no deben usarse como credenciales reales.

## Atomicidad de sesiones

El riesgo es que una request consulte una sesión, otro cliente la cierre y la primera request la recree al ejecutar `HSET`. Evitamos separar esas acciones: el script Lua comprueba y modifica sin intercalación de otros clientes. Si el cierre ocurre antes, el script no escribe. Si ocurre después, `DEL` elimina el estado actualizado.

La creación también agrega atributos y TTL dentro del mismo script. Validamos el TTL antes de escribir. Lua no ofrece rollback general ante errores; los scripts son cortos y no realizan trabajo externo. La evidencia prueba el cierre concurrente y la ausencia de recreación después del vencimiento.

## Fuente de verdad y caché

MongoDB conserva la ficha original. En el laboratorio, `FuenteSimulada` representa esa fuente con cuatro equipos en memoria. Las lecturas y actualizaciones de esta muestra no son operaciones reales sobre MongoDB.

- **Hit:** existe el String JSON; devolvemos la copia sin renovar su TTL.
- **Miss:** recuperamos la ficha de la fuente simulada y ejecutamos `SET ... EX 300`.
- **Equipo inexistente:** devolvemos ausencia, sin inventar datos ni crear una copia negativa.
- **Actualización:** cambiamos primero la fuente y luego invalidamos la clave exacta. La lectura siguiente recupera la versión nueva.
- **Redis inaccesible u OOM al cargar:** devolvemos la fuente con `degradado=True`. La caché es una optimización, no un permiso de acceso.
- **Invalidación fallida:** informamos el fallo y omitimos la caché de ese equipo en el proceso. No servimos la copia anterior. La omisión se conserva hasta una actualización con invalidación exitosa.

El máximo de permanencia de cada copia es 300 s desde su carga. El TTL no garantiza que esa copia siga vigente si cambia la fuente.

Para impedir una carga vieja después de invalidar, el simulador comparte un lock entre lectura/carga y actualización/invalidación. Esto serializa esos flujos dentro de un proceso. No brinda coherencia entre procesos independientes. El namespace nuevo de cada demostración evita compartir una fuente simulada reiniciada con copias de otra ejecución. La integración futura deberá definir coordinación entre escritores; no afirmamos que esta prueba resuelva ese problema.

## Contador y ranking temporal

`consulta_equipo.lua` ejecuta `ZINCRBY` y `EXPIREAT` como una secuencia sin intercalación. El score del equipo es su contador; la misma estructura permite el Top N. No existe un segundo total que pueda quedar desactualizado.

La clave vence al finalizar la hora UTC del servidor. El script valida que la ventana siga abierta antes de escribir. Si cambió entre calcular la clave y ejecutar, el cliente recalcula la hora. Reaplicar la misma fecha de vencimiento no extiende la ventana.

No reintentamos automáticamente escrituras ante fallos de conexión: una respuesta perdida puede dejar una escritura confirmada cuyo resultado el cliente desconoce. El conteo no ofrece procesamiento exactamente una vez frente a esos fallos. La prueba concurrente compara 800 incrementos confirmados con 800 observados en una misma hora.
