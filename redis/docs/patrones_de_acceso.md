# Patrones de acceso

**Estado: preguntas de diseño. No son decisiones aprobadas.**

## Problema de concurrencia

El escenario académico prevé millones de usuarios simultáneos. El laboratorio deberá representar lecturas repetidas, actividad y cierre de sesiones con una muestra reproducible. Su tamaño y distribución todavía deben definirse.

El Hito 3 ya eligió Redis para validar sesiones, vigencia y cierre anticipado. El Hito 7 debe convertir esa elección en operaciones concretas.

## Patrones por definir

| Operación candidata | Entrada y consumidor | Respuesta esperada | Información pendiente |
| --- | --- | --- | --- |
| Crear y recuperar sesión | Identificador de sesión; consumidor del módulo | Usuario asociado y estado válido, o sesión ausente | Atributos, frecuencia y regla de validez |
| Registrar actividad | Sesión y petición válida | Última actividad actualizada y TTL renovado | Qué cuenta como actividad y cuántos segundos permitimos |
| Finalizar sesión | Identificador de sesión; usuario | La sesión deja de permitir acceso | Diferenciar cierre, invalidación y vencimiento |
| Consultar un dato frecuente | Identificador de equipo o partido; visitante | Copia vigente o dato recuperado desde su fuente | Elegir dato, fuente, frecuencia, estructura y TTL |
| Actualizar actividad concurrente | Contexto de usuario o partido | Actualizaciones sin pérdidas | Elegir contador o ranking y duración |

Antes de implementar, completar para cada patrón: lector o escritor, clave localizable, respuesta, frecuencia de lectura/escritura/actualización, fuente de verdad, ciclo temporal y estructura Redis con su motivo.

## Alternativas para discutir

Una ficha de equipo conserva MongoDB como fuente de verdad y suele cambiar menos que un partido en vivo. Una ficha de partido requiere considerar Neo4j y las actualizaciones del encuentro. La elección modifica la invalidación y el tiempo admisible de una copia.

Un contador de consultas permite estudiar incrementos concurrentes. Un ranking temporal permite recuperar un Top N, pero solo corresponde si declaramos una consulta que lo necesita.
