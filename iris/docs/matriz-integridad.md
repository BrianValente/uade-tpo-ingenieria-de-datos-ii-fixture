# Matriz de integridad

| Regla | Mecanismo | Resultado esperado |
| --- | --- | --- |
| Todo partido tiene codigo, fecha, equipos, arbitro y tecnicos | Propiedades `[Required]` | `%Save()` rechaza el objeto incompleto. |
| Los equipos deben ser diferentes | `%OnBeforeSave()` de `Partido` | El guardado falla antes de persistir el agregado. |
| El estado pertenece al conjunto permitido | `%OnBeforeSave()` de `Partido` | No se guarda un estado desconocido. |
| El estado avanza en orden | Propiedad privada y `CambiarEstado()` | Se rechaza `Programado -> Finalizado` y cualquier retroceso por la API de objetos. |
| Un partido no finaliza con eventos nuevos | `CambiarEstado()` recorre `Eventos` con `GetNext()` | Se exige guardar los eventos nuevos antes del cierre. |
| Solo un partido en juego recibe eventos | `RegistrarEvento()` y `%OnBeforeSave()` de `Evento` | Un partido programado o finalizado rechaza el evento, incluso si se evita el metodo de dominio. |
| El minuto esta entre 0 y 130 | `RegistrarEvento()` y `%OnBeforeSave()` de `Evento` | Se rechazan minutos fuera del rango aunque se evite el metodo de dominio. |
| El tipo de evento esta permitido | `RegistrarEvento()` y `%OnBeforeSave()` de `Evento` | Se aceptan gol, tarjetas y cambio. |
| Todo evento pertenece a un partido | Relacion `parent/children` | IRIS mantiene la referencia bidireccional. |
| Los eventos se localizan por su partido | Indice `PartidoIndex` | La carga de la coleccion no necesita recorrer toda la extension. |
| Un evento persistido no cambia | `%OnBeforeSave(insert)` de `Evento` | `%Save()` rechaza la modificacion y conserva el valor persistido. |
| Un evento persistido no se elimina de forma directa | `%OnDelete()` de `Evento` | `Evento.%DeleteId()` falla y el evento permanece guardado. |
| SQL se usa solo para consulta | Triggers `SoloLecturaSQL` en las clases `Fixture.*` | Las tablas proyectadas rechazan `INSERT`, `UPDATE` y `DELETE`. |
| Un evento comparte el ciclo de vida del partido | Relacion padre-hijo y autorizacion interna durante `Partido.%OnDelete()` | Al eliminar el padre, IRIS elimina sus hijos. La demostracion lo prueba con un agregado temporal. |
| Arbitro y tecnicos conservan identidad independiente | Referencias persistentes | Eliminar un partido no implica eliminar esas personas. |

La prueba de eliminacion usa un agregado temporal. Primero intenta borrar el evento y comprueba que permanezca guardado. Despues borra el partido, comprueba que el evento desaparezca por cascada y limpia las personas temporales. No elimina el agregado principal usado como evidencia durable.
