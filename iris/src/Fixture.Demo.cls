Include %occStatus

Class Fixture.Demo
{

ClassMethod Ejecutar() As %Status
{
    Write "=== Hito 9: entidades complejas en IRIS ===", !

    Set sc = ..ProbarPropiedadObligatoria()
    If $$$ISERR(sc) Quit sc

    Set numero = $Increment(^Fixture2030Demo)
    Set sufijo = $Justify(numero, 4)
    Set sufijo = $Translate(sufijo, " ", "0")

    Set arbitro = ##class(Fixture.Arbitro).%New()
    Set arbitro.Codigo = "ARB-"_sufijo
    Set arbitro.Nombre = "Arbitro de prueba "_sufijo
    Set arbitro.Nacionalidad = "Uruguay"
    Set arbitro.Licencia = "FIFA-ARB-"_sufijo
    Set arbitro.Categoria = "Internacional"

    Set tecnicoLocal = ##class(Fixture.Tecnico).%New()
    Set tecnicoLocal.Codigo = "TEC-ARG-"_sufijo
    Set tecnicoLocal.Nombre = "Tecnico local "_sufijo
    Set tecnicoLocal.Nacionalidad = "Argentina"
    Set tecnicoLocal.Licencia = "LIC-ARG-"_sufijo
    Set tecnicoLocal.SeleccionCodigo = "ARG"

    Set tecnicoVisitante = ##class(Fixture.Tecnico).%New()
    Set tecnicoVisitante.Codigo = "TEC-BRA-"_sufijo
    Set tecnicoVisitante.Nombre = "Tecnico visitante "_sufijo
    Set tecnicoVisitante.Nacionalidad = "Brasil"
    Set tecnicoVisitante.Licencia = "LIC-BRA-"_sufijo
    Set tecnicoVisitante.SeleccionCodigo = "BRA"

    Set partido = ##class(Fixture.Partido).%New()
    Set partido.Codigo = "F2030-IRIS-"_sufijo
    Set partido.FechaHora = "2030-06-13 16:00:00"
    Set partido.EquipoLocalCodigo = "ARG"
    Set partido.EquipoVisitanteCodigo = "BRA"
    Set partido.ArbitroPrincipal = arbitro
    Set partido.TecnicoLocal = tecnicoLocal
    Set partido.TecnicoVisitante = tecnicoVisitante

    Set sc = partido.CambiarEstado("Finalizado")
    If $$$ISOK(sc) Quit $$$ERROR($$$GeneralError, "La transicion Programado -> Finalizado no fue rechazada")
    Write "OK: transicion Programado -> Finalizado rechazada", !
    Do $System.Status.DisplayError(sc)

    Set sc = partido.CambiarEstado("EnJuego")
    If $$$ISERR(sc) Quit sc

    Set sc = partido.RegistrarEvento("EVT-IRIS-"_sufijo_"-01", "Gol", 18, "Gol del equipo local")
    If $$$ISERR(sc) Quit sc

    Set sc = partido.RegistrarEvento("EVT-IRIS-"_sufijo_"-02", "TarjetaAmarilla", 63, "Amonestacion del equipo visitante")
    If $$$ISERR(sc) Quit sc

    // El unico guardado explicito persiste el partido y todo el grafo alcanzable.
    Set sc = partido.%Save()
    If $$$ISERR(sc) Quit sc

    Write "OK: guardado del agregado con una sola invocacion de %Save()", !
    Write "PARTIDO_ID=", partido.%Id(), !
    Write "PARTIDO_CODIGO=", partido.Codigo, !
    Write "ARBITRO_ID=", arbitro.%Id(), !
    Write "TECNICO_LOCAL_ID=", tecnicoLocal.%Id(), !
    Write "TECNICO_VISITANTE_ID=", tecnicoVisitante.%Id(), !

    Set sc = ..NavegarObjetos(partido.%Id())
    If $$$ISERR(sc) Quit sc

    Set sc = ..MostrarSQL(partido.%Id(), partido.Codigo, arbitro.Codigo, tecnicoLocal.Codigo, tecnicoVisitante.Codigo)
    If $$$ISERR(sc) Quit sc

    Set sc = partido.CambiarEstado("Finalizado")
    If $$$ISERR(sc) Quit sc
    Set sc = partido.%Save()
    If $$$ISERR(sc) Quit sc

    Set sc = partido.RegistrarEvento("EVT-IRIS-"_sufijo_"-03", "Gol", 90, "Evento posterior al cierre")
    If $$$ISOK(sc) Quit $$$ERROR($$$GeneralError, "Un partido finalizado acepto un evento")
    Write "OK: evento posterior a Finalizado rechazado", !
    Do $System.Status.DisplayError(sc)

    Write "OK: demostracion completa", !
    Quit $$$OK
}

ClassMethod ProbarPropiedadObligatoria() As %Status
{
    Set invalido = ##class(Fixture.Partido).%New()
    Set invalido.FechaHora = "2030-06-13 16:00:00"
    Set invalido.EquipoLocalCodigo = "ARG"
    Set invalido.EquipoVisitanteCodigo = "BRA"

    Set sc = invalido.%Save()
    If $$$ISOK(sc) Quit $$$ERROR($$$GeneralError, "IRIS acepto un partido sin propiedades obligatorias")

    Write "OK: guardado sin propiedades obligatorias rechazado", !
    Do $System.Status.DisplayError(sc)
    Quit $$$OK
}

ClassMethod NavegarObjetos(idPartido As %String) As %Status
{
    Set partido = ##class(Fixture.Partido).%OpenId(idPartido)
    If '$IsObject(partido) Quit $$$ERROR($$$GeneralError, "No se pudo abrir el partido "_idPartido)

    Write "NAVEGACION: ", partido.Codigo, " | estado=", partido.ObtenerEstado(), " | eventos=", partido.CantidadEventos(), !
    Write "ARBITRO: ", partido.ArbitroPrincipal.Nombre, " | licencia=", partido.ArbitroPrincipal.Licencia, !

    For indice = 1:1:partido.CantidadEventos() {
        Set evento = partido.ObtenerEvento(indice)
        Write "EVENTO: ", evento.Codigo, " | ", evento.Tipo, " | minuto=", evento.Minuto, !
    }

    Quit $$$OK
}

ClassMethod MostrarSQL(idPartido As %String, codigoPartido As %String, codigoArbitro As %String, codigoTecnicoLocal As %String, codigoTecnicoVisitante As %String) As %Status
{
    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare("SELECT ID, Codigo, FechaHora, Estado, EquipoLocalCodigo, EquipoVisitanteCodigo, ArbitroPrincipal, TecnicoLocal, TecnicoVisitante FROM Fixture.Partido WHERE Codigo = ?")
    If $$$ISERR(sc) Quit sc

    Set resultado = sentencia.%Execute(codigoPartido)
    If resultado.%SQLCODE < 0 Quit $$$ERROR($$$GeneralError, resultado.%Message)

    Write "SQL PARTIDO: proyeccion del objeto principal", !
    Do resultado.%Display()
    Write !

    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare("SELECT ID, Codigo, Tipo, Minuto, Detalle, Partido FROM Fixture.Evento WHERE Partido = ? ORDER BY Minuto")
    If $$$ISERR(sc) Quit sc

    Set resultado = sentencia.%Execute(idPartido)
    If resultado.%SQLCODE < 0 Quit $$$ERROR($$$GeneralError, resultado.%Message)

    Write "SQL EVENTOS: proyeccion de los hijos", !
    Do resultado.%Display()
    Write !

    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare("SELECT ID, Codigo, Nombre, Nacionalidad, Licencia, Categoria FROM Fixture.Arbitro WHERE Codigo = ?")
    If $$$ISERR(sc) Quit sc

    Set resultado = sentencia.%Execute(codigoArbitro)
    If resultado.%SQLCODE < 0 Quit $$$ERROR($$$GeneralError, resultado.%Message)

    Write "SQL ARBITRO: proyeccion de la herencia Persona -> Arbitro", !
    Do resultado.%Display()
    Write !

    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare("SELECT ID, Codigo, Nombre, Nacionalidad, Licencia, SeleccionCodigo FROM Fixture.Tecnico WHERE Codigo IN (?, ?) ORDER BY SeleccionCodigo")
    If $$$ISERR(sc) Quit sc

    Set resultado = sentencia.%Execute(codigoTecnicoLocal, codigoTecnicoVisitante)
    If resultado.%SQLCODE < 0 Quit $$$ERROR($$$GeneralError, resultado.%Message)

    Write "SQL TECNICOS: proyeccion de la herencia Persona -> Tecnico", !
    Do resultado.%Display()
    Write !
    Quit $$$OK
}

ClassMethod VerificarPersistencia(idPartido As %String) As %Status
{
    Set partido = ##class(Fixture.Partido).%OpenId(idPartido)
    If '$IsObject(partido) Quit $$$ERROR($$$GeneralError, "El partido no sobrevivio al reinicio")

    Write "OK: persistencia durable despues del reinicio", !
    Write "PERSISTIDO: ", partido.Codigo, " | estado=", partido.ObtenerEstado(), " | eventos=", partido.CantidadEventos(), !
    Quit $$$OK
}

}
