# Modelo de objetos

El modulo modela el partido como una entidad con estado y comportamiento. Los eventos dependen del partido. Los arbitros y tecnicos poseen identidad propia y comparten los datos de una persona.

```mermaid
classDiagram
    class Persona {
        +Codigo: String [Required]
        +Nombre: String [Required]
        +Nacionalidad: String [Required]
    }
    class Arbitro {
        +Licencia: String [Required]
        +Categoria: String [Required]
    }
    class Tecnico {
        +Licencia: String [Required]
        +SeleccionCodigo: String [Required]
    }
    class Partido {
        +Codigo: String [Required]
        +FechaHora: TimeStamp [Required]
        +EquipoLocalCodigo: String [Required]
        +EquipoVisitanteCodigo: String [Required]
        -Estado: String [Required]
        +ArbitroPrincipal: Arbitro [Required]
        +TecnicoLocal: Tecnico [Required]
        +TecnicoVisitante: Tecnico [Required]
        +CambiarEstado(nuevoEstado) Status
        +RegistrarEvento(codigo, tipo, minuto, detalle) Status
        +ObtenerEstado() String
        +CantidadEventos() Integer
        +ObtenerEvento(indice) Evento
        -%OnBeforeSave(insert) Status
    }
    class Evento {
        +Codigo: String [Required]
        +Tipo: String [Required]
        +Minuto: Integer [Required]
        +Detalle: String
        -%OnBeforeSave(insert) Status
    }

    Persona <|-- Arbitro
    Persona <|-- Tecnico
    Partido "1 Eventos" *-- "0..* Partido" Evento : relacion bidireccional
    Partido --> "1" Arbitro : arbitro principal
    Partido --> "1" Tecnico : tecnico local
    Partido --> "1" Tecnico : tecnico visitante
```

## Decisiones

- `Persona` es una clase persistente abstracta. `Arbitro` y `Tecnico` representan especializaciones estables.
- `Partido` y `Evento` forman una relacion padre-hijo. Un evento no tiene sentido fuera de su partido.
- `Evento.Partido` tiene un indice porque es el extremo que apunta al padre.
- Los estados permitidos son `Programado`, `EnJuego` y `Finalizado`.
- Las unicas transiciones permitidas son `Programado -> EnJuego` y `EnJuego -> Finalizado`.
- Solo un partido `EnJuego` puede recibir eventos.
- `Estado` es privado y las transiciones deben pasar por `CambiarEstado()`.
- `RegistrarEvento()` es la interfaz de escritura del agregado. La validacion de `Evento` tambien rechaza un guardado directo si el partido no esta `EnJuego`.
- El minuto debe estar entre 0 y 130.
- Los codigos `ARG`, `BRA` y `F2030` mantienen continuidad con la muestra sintetica de Neo4j. El modulo no implementa sincronizacion entre motores.

## Limite del agregado

El guardado parte de `Partido`. IRIS persiste el arbitro, los tecnicos y los eventos alcanzables como una transaccion. El agregado no incluye todos los equipos, jugadores o partidos del torneo.
