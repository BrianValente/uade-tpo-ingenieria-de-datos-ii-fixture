# Ciclo de vida e invalidación

**Estado: criterios para discutir; flujos aún no implementados.**

## Sesiones

Debemos definir creación, recuperación, actividad válida, renovación, cierre e invalidación. El enunciado exige expiración nativa por inactividad y una consecuencia explícita cuando la clave no existe.

Preguntas: ¿cuánta inactividad permitimos y por qué? ¿Una lectura de consulta pública renueva sesión? ¿Qué debe hacer el consumidor cuando la sesión vence? ¿Qué ocurre cuando Redis no responde?

`HSET` conserva el TTL existente, pero no lo renueva. Una renovación debe comprobar que la sesión siga vigente. Crear un Hash después de que venció puede recuperar por error una sesión cerrada. `MULTI`/`EXEC` evita intercalación, pero no decide por sí solo si la sesión existe ni ofrece rollback general.

## Fuente de verdad y caché

La ficha completa de equipo pertenece a MongoDB. Los partidos y eventos pertenecen al módulo Neo4j. Debemos elegir al menos un dato frecuente y explicar la copia en Redis.

Para Cache-Aside debemos completar: hit, miss, consulta de fuente, carga con TTL, actualización de fuente, invalidación y recuperación si Redis está ausente. Un TTL limita la vida de la copia, pero no garantiza que siga vigente tras un cambio.

La demostración puede usar una fuente de muestra explícitamente simulada, sin integrar físicamente los motores. No se debe presentar esa simulación como una consulta real a MongoDB o Neo4j.

Debemos considerar qué ocurre si una lectura carga una copia vieja después de la invalidación y qué hacemos cuando falla la invalidación. El análisis debe declarar el atraso aceptable sin prometer coherencia no probada.

## Concurrencia

Comparar un incremento nativo con leer, sumar y escribir desde el cliente. Si agregamos TTL u otro cambio al incremento, debemos justificar la secuencia completa. La prueba deberá usar clientes simultáneos y comparar el total esperado con el observado.
