# Evidencia del Hito 9

Este directorio conserva salidas observadas de la ejecucion local. No contiene archivos internos ni datos raw de IRIS.

La evidencia se genera con:

```bash
make verify-iris
```

## Ejecucion observada

La validacion se ejecuto el 9 de octubre de 2026 con Docker Desktop en macOS. El contenedor informo InterSystems IRIS Community 2026.2, build 221U, para ARM64.

La salida completa relevante esta en [ejecucion-2026-10-09.txt](ejecucion-2026-10-09.txt).

La ejecucion comprobo:

- compilacion sin errores;
- rechazo de propiedades obligatorias ausentes;
- rollback completo ante un hijo invalido;
- rechazo de la transicion `Programado -> Finalizado`;
- rechazo del cierre con eventos nuevos sin guardar;
- guardado del partido y sus objetos relacionados con una sola invocacion de `%Save()`;
- navegacion desde el partido hacia arbitro y eventos mediante `GetNext()`;
- comprobacion de referencias inversas;
- proyeccion SQL del partido, sus eventos y las subclases de `Persona`, con cantidades esperadas;
- rechazo de escrituras SQL directas;
- rechazo de eventos posteriores a la finalizacion;
- rechazo de cambios en eventos persistidos;
- rechazo de la eliminacion directa de un evento persistido;
- eliminacion en cascada de un evento al borrar su partido temporal;
- recuperacion del partido despues de reiniciar el contenedor.

El partido de la ejecucion registrada fue `F2030-IRIS-0011`, con ID persistente `17`. IRIS recupero dos eventos, sus referencias inversas y el estado `Finalizado` despues del reinicio. Esta demostracion valida el comportamiento funcional en una instancia local. No es una prueba de rendimiento, concurrencia ni alta disponibilidad.
