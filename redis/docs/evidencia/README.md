# Pruebas y evidencia

**Estado: ejecución del servidor pendiente.**

Durante el inicio del módulo, el contexto Docker seleccionado fue `desktop-linux`. `docker compose ps` no pudo conectar al socket del motor. No registramos `PONG`, versión del servidor, TTL ni métricas de una instancia Redis.

Para la ejecución funcional debemos guardar:

- Fecha, versión observada de Redis e imagen utilizada.
- Comandos de inicio y estado del servicio.
- Origen, cantidad y distribución de usuarios, sesiones y claves de caché sintéticas.
- Creación, consulta, renovación y cierre de una sesión; TTL antes y después; vencimiento sin recreación.
- Miss, hit, actualización de fuente e invalidación; respuesta ante dato o servidor ausente.
- Clientes concurrentes, operaciones por cliente, total esperado y total observado.
- Métricas antes y después de la prueba; CPU, RAM y recursos de Docker si medimos rendimiento.
- Método, salida verificable y límites del laboratorio.

Los contadores de `INFO stats` corresponden a toda la instancia. No permiten atribuir una tasa de hit al módulo sin aislar la prueba y registrar los deltas apropiados.

Una demostración muestra operaciones. Una prueba automatizada incluye aserciones. Una medición requiere método y resultados observados. No hay mediciones de rendimiento en este avance.
