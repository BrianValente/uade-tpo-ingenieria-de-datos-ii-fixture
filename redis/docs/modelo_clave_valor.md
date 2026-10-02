# Modelo clave/valor

## Claves y atributos

Usamos el prefijo `fixture2030:h7:<alcance>`. Cada ejecución imprime un alcance nuevo para aislar los datos sintéticos de las demostraciones. Los separadores `:` son una convención de nombres, no carpetas de Redis.

| Clave | Tipo | Contenido y operación | Vida |
| --- | --- | --- | --- |
| `fixture2030:h7:<alcance>:sesion:<sesion_id>` | Hash | `sesion_id`, `usuario_id`, `dispositivo`, `estado_acceso`, `rol`, `creada_en`, `ultima_actividad`; lectura y renovación por ID | 1800 s por inactividad; cierre o invalidación con `DEL` |
| `fixture2030:h7:<alcance>:cache:equipo:<equipo_id>` | String JSON | `_id`, `codigo`, `nombre`, `confederacion`, `version_muestra`; `GET`, `SET EX` e invalidación | 300 s desde la carga, sin renovación por hit |
| `fixture2030:h7:<alcance>:consultas:hora:<hora_epoch>` | Sorted Set | Miembro: UUID de equipo; score: cantidad de consultas; `ZINCRBY` y Top N | Vence al terminar la hora UTC; no se extiende con consultas |

`hora_epoch` es el cociente entero entre los segundos UTC del servidor y 3600. `version_muestra` ayuda a verificar cambios en la fuente simulada; no es una propiedad agregada a MongoDB.

Las fechas de sesión usan segundos y microsegundos UTC de `TIME` en Redis. El consumidor puede localizar la sesión con alcance e ID. No mantenemos un índice de sesiones por usuario porque no definimos una operación que necesite listar o cerrar todas sus sesiones.

## Elección de estructuras

Elegimos Hash para modificar última actividad sin reemplazar todos los atributos. La alternativa es String JSON con `SET EX`, pero requiere recuperar y serializar la sesión completa para cambiarla. Un script corto hace inseparables los atributos y su TTL en los flujos implementados.

Elegimos String para la ficha porque se consume como un conjunto. El Hash permitiría lecturas parciales, pero no las necesita el patrón actual.

El Sorted Set reemplaza dos estructuras: el score es el contador y el orden permite recuperar el ranking. No duplicamos un contador String por equipo; así evitamos sincronizar dos totales.

## Datos cargados

La carga usa 10 usuarios sintéticos, 20 sesiones (dos dispositivos por usuario), 4 copias de fichas y 1 Sorted Set: 25 claves. ARG recibe 6 consultas, BRA 2, ESP 1 y MAR 1. Los usuarios no se guardan como perfiles persistentes: solo sus IDs en las sesiones.

Las fichas de muestra contienen cuatro campos del módulo documental y un marcador de versión. Sus nombres y UUID mantienen la regla del Hito 4. La carga no consulta MongoDB y no representa una ficha completa de producción.

Cada ejecución usa un alcance nuevo. Los datos y la distribución son determinísticos; no se promete que ejecutar dos veces conserve el mismo namespace. Todas las claves temporales tienen vencimiento. No publicamos contraseñas ni tokens reales.
