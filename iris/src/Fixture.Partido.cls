Include %occStatus

Class Fixture.Partido Extends %Persistent
{

Property Codigo As %String(MAXLEN = 50) [ Required ];

Property FechaHora As %TimeStamp [ Required ];

Property EquipoLocalCodigo As %String(MAXLEN = 3) [ Required ];

Property EquipoVisitanteCodigo As %String(MAXLEN = 3) [ Required ];

Property Estado As %String(MAXLEN = 20) [ InitialExpression = "Programado", Private, Required ];

Property ArbitroPrincipal As Fixture.Arbitro [ Required ];

Property TecnicoLocal As Fixture.Tecnico [ Required ];

Property TecnicoVisitante As Fixture.Tecnico [ Required ];

Relationship Eventos As Fixture.Evento [ Cardinality = children, Inverse = Partido ];

Index CodigoUnico On Codigo [ Unique ];

Trigger SoloLecturaSQL [ Event = INSERT/UPDATE/DELETE, Foreach = ROW, Time = BEFORE ]
{
    Set %ok = 0
    Set %msg = "La proyeccion SQL del modulo Fixture es de solo lectura"
}

Method CambiarEstado(nuevoEstado As %String) As %Status
{
    If (..Estado = "Programado") && (nuevoEstado = "EnJuego") {
        Set ..Estado = nuevoEstado
        Quit $$$OK
    }

    If (..Estado = "EnJuego") && (nuevoEstado = "Finalizado") {
        Set clave = ""
        Set hayEventosNuevos = 0
        For {
            Set evento = ..Eventos.GetNext(.clave)
            Quit:clave=""
            If evento.%Id() = "" Set hayEventosNuevos = 1
        }

        If hayEventosNuevos {
            Quit $$$ERROR($$$GeneralError, "Debe guardar los eventos nuevos antes de finalizar el partido")
        }

        Set ..Estado = nuevoEstado
        Quit $$$OK
    }

    Quit $$$ERROR($$$GeneralError, "Transicion de estado ilegal: "_..Estado_" -> "_nuevoEstado)
}

Method ObtenerEstado() As %String
{
    Quit ..Estado
}

Method CantidadEventos() As %Integer
{
    Quit ..Eventos.Count()
}

Method ObtenerSiguienteEvento(ByRef clave As %String) As Fixture.Evento
{
    Quit ..Eventos.GetNext(.clave)
}

Method RegistrarEvento(codigo As %String, tipo As %String, minuto As %Integer, detalle As %String = "") As %Status
{
    If ..Estado '= "EnJuego" {
        Quit $$$ERROR($$$GeneralError, "Solo un partido EnJuego puede recibir eventos")
    }

    If (minuto < 0) || (minuto > 130) {
        Quit $$$ERROR($$$GeneralError, "El minuto debe estar entre 0 y 130")
    }

    If (tipo '= "Gol") && (tipo '= "TarjetaAmarilla") && (tipo '= "TarjetaRoja") && (tipo '= "Cambio") {
        Quit $$$ERROR($$$GeneralError, "Tipo de evento no permitido: "_tipo)
    }

    Set evento = ##class(Fixture.Evento).%New()
    Set evento.Codigo = codigo
    Set evento.Tipo = tipo
    Set evento.Minuto = minuto
    Set evento.Detalle = detalle
    Do ..Eventos.Insert(evento)

    Quit $$$OK
}

Method %OnBeforeSave(insert As %Boolean) As %Status
{
    If ..EquipoLocalCodigo = ..EquipoVisitanteCodigo {
        Quit $$$ERROR($$$GeneralError, "Los equipos local y visitante deben ser diferentes")
    }

    If (..Estado '= "Programado") && (..Estado '= "EnJuego") && (..Estado '= "Finalizado") {
        Quit $$$ERROR($$$GeneralError, "Estado de partido no permitido: "_..Estado)
    }

    Quit $$$OK
}

ClassMethod %OnDelete(oid As %ObjectIdentity) As %Status [ Private, ServerOnly = 1 ]
{
    Set id = $$$oidPrimary(oid)
    Set ^||Fixture2030DeletePartido(id) = 1
    Quit $$$OK
}

ClassMethod %OnDeleteFinally(oid As %ObjectIdentity, status As %Status) [ ServerOnly = 1 ]
{
    Set id = $$$oidPrimary(oid)
    Kill ^||Fixture2030DeletePartido(id)
}

}
