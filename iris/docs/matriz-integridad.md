# Matriz de integridad

| Regla | Mecanismo | Resultado esperado |
| --- | --- | --- |
| Todo partido tiene codigo, fecha, equipos, arbitro y tecnicos | Propiedades `[Required]` | `%Save()` rechaza el objeto incompleto. |
| Los equipos deben ser diferentes | `%OnBeforeSave()` de `Partido` | El guardado falla antes de persistir el agregado. |
| El estado pertenece al conjunto permitido | `%OnBeforeSave()` de `Partido` | No se guarda un estado desconocido. |
| El estado avanza en orden | Propiedad privada y `CambiarEstado()` | Se rechaza `Programado -> Finalizado` y cualquier retroceso. |
| Solo un partido en juego recibe eventos | `RegistrarEvento()` y `%OnBeforeSave()` de `Evento` | Un partido programado o finalizado rechaza el evento, incluso si se evita el metodo de dominio. |
| El minuto esta entre 0 y 130 | `RegistrarEvento()` y `%OnBeforeSave()` de `Evento` | Se rechazan minutos fuera del rango aunque se evite el metodo de dominio. |
| El tipo de evento esta permitido | `RegistrarEvento()` y `%OnBeforeSave()` de `Evento` | Se aceptan gol, tarjetas y cambio. |
| Todo evento pertenece a un partido | Relacion `parent/children` | IRIS mantiene la referencia bidireccional. |
| Los eventos se localizan por su partido | Indice `PartidoIndex` | La carga de la coleccion no necesita recorrer toda la extension. |
| Un evento comparte el ciclo de vida del partido | Relacion padre-hijo | Al eliminar el padre, IRIS elimina sus hijos. La demostracion no borra datos. |
| Arbitro y tecnicos conservan identidad independiente | Referencias persistentes | Eliminar un partido no implica eliminar esas personas. |

La conducta de eliminacion se documenta desde la semantica de la relacion. No se ejecuta una eliminacion automatica porque la evidencia del hito debe conservarse.
