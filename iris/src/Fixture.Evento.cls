Include %occStatus

Class Fixture.Evento Extends %Persistent
{

Property Codigo As %String(MAXLEN = 50) [ Required ];

Property Tipo As %String(MAXLEN = 30) [ Required ];

Property Minuto As %Integer [ Required ];

Property Detalle As %String(MAXLEN = 250);

Relationship Partido As Fixture.Partido [ Cardinality = parent, Inverse = Eventos ];

Index PartidoIndex On Partido;

Index CodigoUnico On Codigo [ Unique ];

Trigger SoloLecturaSQL [ Event = INSERT/UPDATE/DELETE, Foreach = ROW, Time = BEFORE ]
{
    Set %ok = 0
    Set %msg = "La proyeccion SQL del modulo Fixture es de solo lectura"
}

Method %OnBeforeSave(insert As %Boolean) As %Status
{
    If 'insert {
        Quit $$$ERROR($$$GeneralError, "Los eventos persistidos son inalterables")
    }

    If '$IsObject(..Partido) {
        Quit $$$ERROR($$$GeneralError, "Todo evento debe pertenecer a un partido")
    }

    If ..Partido.ObtenerEstado() '= "EnJuego" {
        Quit $$$ERROR($$$GeneralError, "Solo un partido EnJuego puede guardar eventos nuevos o modificados")
    }

    If (..Minuto < 0) || (..Minuto > 130) {
        Quit $$$ERROR($$$GeneralError, "El minuto debe estar entre 0 y 130")
    }

    If (..Tipo '= "Gol") && (..Tipo '= "TarjetaAmarilla") && (..Tipo '= "TarjetaRoja") && (..Tipo '= "Cambio") {
        Quit $$$ERROR($$$GeneralError, "Tipo de evento no permitido: "_..Tipo)
    }

    Quit $$$OK
}

ClassMethod %OnDelete(oid As %ObjectIdentity) As %Status [ Private, ServerOnly = 1 ]
{
    Set id = $$$oidPrimary(oid)
    Set evento = ..%OpenId(id)
    If $IsObject(evento), $IsObject(evento.Partido), $Data(^||Fixture2030DeletePartido(evento.Partido.%Id())) {
        Quit $$$OK
    }

    Quit $$$ERROR($$$GeneralError, "Los eventos persistidos no se eliminan de forma directa")
}

}
