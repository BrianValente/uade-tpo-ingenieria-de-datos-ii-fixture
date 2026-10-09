# Hito 9: entidades complejas en InterSystems IRIS

Este modulo implementa una porcion compleja del Fixture 2030 mediante clases persistentes de InterSystems IRIS. El caso elegido es un partido con arbitro, tecnicos, estado y eventos subordinados.

## Requisitos

- Docker con Docker Compose.
- La imagen `intersystems/iris-community:latest-cd`.
- El directorio durable `~/docker/data/iris` con permisos de escritura para el contenedor.

Preparar el directorio una sola vez:

```bash
mkdir -p ~/docker/data/iris
sudo chown -R "$(id -u):$(id -g)" ~/docker/data/iris
sudo chmod -R 777 ~/docker/data/iris
```

## Inicio

Desde la raiz del repositorio:

```bash
make up iris
make status
```

El Management Portal queda disponible en `http://localhost:52773/csp/sys/UtilHome.csp`. El superserver escucha en `127.0.0.1:1972`.

## Compilacion

```bash
make load-iris
```

El script carga y compila todos los archivos `.cls` de `iris/src` en el namespace `USER`.

La operacion equivalente desde el Terminal es:

```objectscript
Set sc = $System.OBJ.LoadDir("/workspace/iris/src", "ck", , 1)
If $System.Status.IsError(sc) Do $System.Status.DisplayError(sc)
```

## Demostracion completa

```bash
make verify-iris
```

La prueba crea un partido sintetico entre `ARG` y `BRA`. Primero comprueba el rechazo de propiedades obligatorias ausentes y el rollback completo de un agregado con un hijo invalido. Despues agrega dos eventos y comprueba que el partido no pueda finalizar mientras esos eventos sean nuevos. Una sola llamada a `partido.%Save()` persiste la creacion inicial del agregado.

La prueba tambien navega las referencias con `GetNext()`, consulta las proyecciones SQL y comprueba sus cantidades. Las tablas `Fixture.*` rechazan escrituras SQL directas mediante triggers y se usan como proyecciones de solo lectura. Por ultimo, la prueba finaliza el partido, rechaza cambios y eliminaciones directas de eventos persistidos, comprueba el borrado en cascada con un agregado temporal y reinicia IRIS para comprobar la persistencia durable.

## Operaciones manuales

Abrir el Terminal:

```bash
docker compose exec iris iris session IRIS -U USER
```

Ejecutar la demostracion:

```objectscript
Set sc = ##class(Fixture.Demo).Ejecutar()
If $System.Status.IsError(sc) Do $System.Status.DisplayError(sc)
```

Consultar los objetos como filas:

```sql
SELECT ID, Codigo, Estado, EquipoLocalCodigo, EquipoVisitanteCodigo
FROM Fixture.Partido
ORDER BY ID DESC;
```

Las modificaciones del dominio deben usar los metodos de los objetos. Las proyecciones SQL de `Fixture.*` permiten consultas, pero sus triggers rechazan `INSERT`, `UPDATE` y `DELETE`.

El orden operativo para cerrar un partido es:

1. Registrar los eventos mientras el estado es `EnJuego`.
2. Guardar el partido para persistir los eventos nuevos.
3. Ejecutar `CambiarEstado("Finalizado")`.
4. Guardar el partido finalizado.

## Documentacion

- [Modelo y diagrama de clases](docs/modelo.md)
- [Matriz de integridad](docs/matriz-integridad.md)
- [Evidencia observada](docs/evidencia/README.md)

## Alcance y limitaciones

- Los datos son sinteticos y no representan un partido oficial.
- La prueba local valida comportamiento y persistencia. No demuestra rendimiento, alta disponibilidad ni los objetivos distribuidos del escenario.
- Neo4j conserva la responsabilidad definida anteriormente para recorridos del grafo. IRIS demuestra persistencia de objetos y reglas encapsuladas.
- El modulo reutiliza codigos de negocio, pero no sincroniza datos entre motores.
- La validacion local no prueba una carrera entre dos sesiones concurrentes.
