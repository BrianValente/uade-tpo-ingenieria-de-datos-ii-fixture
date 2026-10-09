Include %occStatus

Class Fixture.Demo
{

ClassMethod Ejecutar() As %Status
{
    Write "=== Hito 9: entidades complejas en IRIS ===", !

    Set sc = ..ProbarPropiedadObligatoria()
    If $$$ISERR(sc) Quit sc

    Set sc = ..ProbarRollbackAgregado()
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

    Set sc = partido.CambiarEstado("Finalizado")
    If $$$ISOK(sc) Quit $$$ERROR($$$GeneralError, "El partido finalizo con eventos nuevos sin guardar")
    Write "OK: cierre con eventos nuevos rechazado", !
    Do $System.Status.DisplayError(sc)

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

    Set sc = ..ProbarSQLSoloLectura(partido.Codigo, "EVT-IRIS-"_sufijo_"-01")
    If $$$ISERR(sc) Quit sc

    Set sc = partido.CambiarEstado("Finalizado")
    If $$$ISERR(sc) Quit sc
    Set sc = partido.%Save()
    If $$$ISERR(sc) Quit sc

    Set sc = partido.RegistrarEvento("EVT-IRIS-"_sufijo_"-03", "Gol", 90, "Evento posterior al cierre")
    If $$$ISOK(sc) Quit $$$ERROR($$$GeneralError, "Un partido finalizado acepto un evento")
    Write "OK: evento posterior a Finalizado rechazado", !
    Do $System.Status.DisplayError(sc)

    Set sc = ..ProbarInmutabilidad(partido.%Id())
    If $$$ISERR(sc) Quit sc

    Set sc = ..ProbarEliminacionEvento()
    If $$$ISERR(sc) Quit sc

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

    Set textoError = $System.Status.GetErrorText(sc)
    If textoError '[ "required" Quit $$$ERROR($$$GeneralError, "El rechazo no corresponde a una propiedad requerida: "_textoError)

    Write "OK: guardado sin propiedades obligatorias rechazado", !
    Do $System.Status.DisplayError(sc)
    Quit $$$OK
}

ClassMethod ProbarRollbackAgregado() As %Status
{
    Set numero = $Increment(^Fixture2030Rollback)
    Set sufijo = "RB"_numero

    Set arbitro = ##class(Fixture.Arbitro).%New()
    Set arbitro.Codigo = "ARB-"_sufijo
    Set arbitro.Nombre = "Arbitro rollback"
    Set arbitro.Nacionalidad = "Uruguay"
    Set arbitro.Licencia = "FIFA-"_sufijo
    Set arbitro.Categoria = "Internacional"

    Set tecnicoLocal = ##class(Fixture.Tecnico).%New()
    Set tecnicoLocal.Codigo = "TEC-ARG-"_sufijo
    Set tecnicoLocal.Nombre = "Tecnico local rollback"
    Set tecnicoLocal.Nacionalidad = "Argentina"
    Set tecnicoLocal.Licencia = "LIC-ARG-"_sufijo
    Set tecnicoLocal.SeleccionCodigo = "ARG"

    Set tecnicoVisitante = ##class(Fixture.Tecnico).%New()
    Set tecnicoVisitante.Codigo = "TEC-BRA-"_sufijo
    Set tecnicoVisitante.Nombre = "Tecnico visitante rollback"
    Set tecnicoVisitante.Nacionalidad = "Brasil"
    Set tecnicoVisitante.Licencia = "LIC-BRA-"_sufijo
    Set tecnicoVisitante.SeleccionCodigo = "BRA"

    Set partido = ##class(Fixture.Partido).%New()
    Set partido.Codigo = "F2030-"_sufijo
    Set partido.FechaHora = "2030-06-13 18:00:00"
    Set partido.EquipoLocalCodigo = "ARG"
    Set partido.EquipoVisitanteCodigo = "BRA"
    Set partido.ArbitroPrincipal = arbitro
    Set partido.TecnicoLocal = tecnicoLocal
    Set partido.TecnicoVisitante = tecnicoVisitante

    Set sc = partido.CambiarEstado("EnJuego")
    If $$$ISERR(sc) Quit sc

    Set evento = ##class(Fixture.Evento).%New()
    Set evento.Codigo = "EVT-"_sufijo
    Set evento.Tipo = "Gol"
    Set evento.Minuto = 200
    Do partido.Eventos.Insert(evento)

    Set sc = partido.%Save()
    If $$$ISOK(sc) Quit $$$ERROR($$$GeneralError, "IRIS acepto un hijo invalido dentro del agregado")

    If ..ContarFilas("SELECT COUNT(*) AS Cantidad FROM Fixture.Partido WHERE Codigo = ?", partido.Codigo) '= 0 {
        Quit $$$ERROR($$$GeneralError, "El partido invalido quedo persistido parcialmente")
    }
    If ..ContarFilas("SELECT COUNT(*) AS Cantidad FROM Fixture.Evento WHERE Codigo = ?", evento.Codigo) '= 0 {
        Quit $$$ERROR($$$GeneralError, "El evento invalido quedo persistido parcialmente")
    }
    If ..ContarFilas("SELECT COUNT(*) AS Cantidad FROM Fixture.Arbitro WHERE Codigo = ?", arbitro.Codigo) '= 0 {
        Quit $$$ERROR($$$GeneralError, "El arbitro del agregado invalido quedo persistido parcialmente")
    }
    If ..ContarFilas("SELECT COUNT(*) AS Cantidad FROM Fixture.Tecnico WHERE Codigo = ?", tecnicoLocal.Codigo) '= 0 {
        Quit $$$ERROR($$$GeneralError, "El tecnico del agregado invalido quedo persistido parcialmente")
    }

    Write "OK: rollback completo ante un hijo invalido", !
    Do $System.Status.DisplayError(sc)
    Quit $$$OK
}

ClassMethod NavegarObjetos(idPartido As %String) As %Status
{
    Set partido = ##class(Fixture.Partido).%OpenId(idPartido)
    If '$IsObject(partido) Quit $$$ERROR($$$GeneralError, "No se pudo abrir el partido "_idPartido)
    If partido.CantidadEventos() '= 2 Quit $$$ERROR($$$GeneralError, "El partido no tiene los dos eventos esperados")
    If '$IsObject(partido.ArbitroPrincipal) Quit $$$ERROR($$$GeneralError, "Falta el arbitro principal")
    If '$IsObject(partido.TecnicoLocal) Quit $$$ERROR($$$GeneralError, "Falta el tecnico local")
    If '$IsObject(partido.TecnicoVisitante) Quit $$$ERROR($$$GeneralError, "Falta el tecnico visitante")

    Write "NAVEGACION: ", partido.Codigo, " | estado=", partido.ObtenerEstado(), " | eventos=", partido.CantidadEventos(), !
    Write "ARBITRO: ", partido.ArbitroPrincipal.Nombre, " | licencia=", partido.ArbitroPrincipal.Licencia, !

    Set clave = ""
    Set recorridos = 0
    For {
        Set evento = partido.ObtenerSiguienteEvento(.clave)
        Quit:clave=""
        If '$IsObject(evento) Quit $$$ERROR($$$GeneralError, "La relacion devolvio un valor que no es un objeto")
        If evento.Partido.%Id() '= partido.%Id() Quit $$$ERROR($$$GeneralError, "La referencia inversa del evento es incorrecta")
        Set recorridos = recorridos + 1
        Write "EVENTO: ", evento.Codigo, " | ", evento.Tipo, " | minuto=", evento.Minuto, !
    }

    If recorridos '= 2 Quit $$$ERROR($$$GeneralError, "La navegacion no recorrio los dos eventos")

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
    If resultado.%ROWCOUNT '= 1 Quit $$$ERROR($$$GeneralError, "SQL no devolvio un partido")
    Write !

    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare("SELECT ID, Codigo, Tipo, Minuto, Detalle, Partido FROM Fixture.Evento WHERE Partido = ? ORDER BY Minuto")
    If $$$ISERR(sc) Quit sc

    Set resultado = sentencia.%Execute(idPartido)
    If resultado.%SQLCODE < 0 Quit $$$ERROR($$$GeneralError, resultado.%Message)

    Write "SQL EVENTOS: proyeccion de los hijos", !
    Do resultado.%Display()
    If resultado.%ROWCOUNT '= 2 Quit $$$ERROR($$$GeneralError, "SQL no devolvio los dos eventos")
    Write !

    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare("SELECT ID, Codigo, Nombre, Nacionalidad, Licencia, Categoria FROM Fixture.Arbitro WHERE Codigo = ?")
    If $$$ISERR(sc) Quit sc

    Set resultado = sentencia.%Execute(codigoArbitro)
    If resultado.%SQLCODE < 0 Quit $$$ERROR($$$GeneralError, resultado.%Message)

    Write "SQL ARBITRO: proyeccion de la herencia Persona -> Arbitro", !
    Do resultado.%Display()
    If resultado.%ROWCOUNT '= 1 Quit $$$ERROR($$$GeneralError, "SQL no devolvio el arbitro")
    Write !

    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare("SELECT ID, Codigo, Nombre, Nacionalidad, Licencia, SeleccionCodigo FROM Fixture.Tecnico WHERE Codigo IN (?, ?) ORDER BY SeleccionCodigo")
    If $$$ISERR(sc) Quit sc

    Set resultado = sentencia.%Execute(codigoTecnicoLocal, codigoTecnicoVisitante)
    If resultado.%SQLCODE < 0 Quit $$$ERROR($$$GeneralError, resultado.%Message)

    Write "SQL TECNICOS: proyeccion de la herencia Persona -> Tecnico", !
    Do resultado.%Display()
    If resultado.%ROWCOUNT '= 2 Quit $$$ERROR($$$GeneralError, "SQL no devolvio los dos tecnicos")
    Write !
    Quit $$$OK
}

ClassMethod ProbarInmutabilidad(idPartido As %String) As %Status
{
    Set partido = ##class(Fixture.Partido).%OpenId(idPartido)
    If '$IsObject(partido) Quit $$$ERROR($$$GeneralError, "No se pudo abrir el partido para probar inmutabilidad")

    Set clave = ""
    Set evento = partido.ObtenerSiguienteEvento(.clave)
    If '$IsObject(evento) Quit $$$ERROR($$$GeneralError, "No se encontro un evento para probar inmutabilidad")

    Set minutoOriginal = evento.Minuto
    Set evento.Minuto = minutoOriginal + 1
    Set sc = evento.%Save()
    If $$$ISOK(sc) Quit $$$ERROR($$$GeneralError, "IRIS permitio modificar un evento persistido")

    Set minutoPersistido = ..ContarFilas("SELECT Minuto AS Cantidad FROM Fixture.Evento WHERE Codigo = ?", evento.Codigo)
    Set evento.Minuto = minutoOriginal
    If minutoPersistido '= minutoOriginal Quit $$$ERROR($$$GeneralError, "El minuto rechazado quedo persistido")

    Write "OK: modificacion de evento persistido rechazada", !
    Do $System.Status.DisplayError(sc)
    Quit $$$OK
}

ClassMethod ProbarSQLSoloLectura(codigoPartido As %String, codigoEvento As %String) As %Status
{
    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare("UPDATE Fixture.Partido SET Estado = 'Finalizado' WHERE Codigo = ?")
    If $$$ISERR(sc) Quit sc

    Set resultado = sentencia.%Execute(codigoPartido)
    If resultado.%SQLCODE >= 0 Quit $$$ERROR($$$GeneralError, "SQL permitio modificar el estado del partido")

    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare("UPDATE Fixture.Evento SET Minuto = 99 WHERE Codigo = ?")
    If $$$ISERR(sc) Quit sc

    Set resultado = sentencia.%Execute(codigoEvento)
    If resultado.%SQLCODE >= 0 Quit $$$ERROR($$$GeneralError, "SQL permitio modificar un evento")

    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare("DELETE FROM Fixture.Evento WHERE Codigo = ?")
    If $$$ISERR(sc) Quit sc

    Set resultado = sentencia.%Execute(codigoEvento)
    If resultado.%SQLCODE >= 0 Quit $$$ERROR($$$GeneralError, "SQL permitio eliminar un evento")

    Write "OK: escrituras SQL directas rechazadas", !
    Quit $$$OK
}

ClassMethod ProbarEliminacionEvento() As %Status
{
    Set numero = $Increment(^Fixture2030Delete)
    Set sufijo = "DEL"_numero

    Set arbitro = ##class(Fixture.Arbitro).%New()
    Set arbitro.Codigo = "ARB-"_sufijo
    Set arbitro.Nombre = "Arbitro eliminacion"
    Set arbitro.Nacionalidad = "Uruguay"
    Set arbitro.Licencia = "FIFA-"_sufijo
    Set arbitro.Categoria = "Internacional"

    Set tecnicoLocal = ##class(Fixture.Tecnico).%New()
    Set tecnicoLocal.Codigo = "TEC-ARG-"_sufijo
    Set tecnicoLocal.Nombre = "Tecnico local eliminacion"
    Set tecnicoLocal.Nacionalidad = "Argentina"
    Set tecnicoLocal.Licencia = "LIC-ARG-"_sufijo
    Set tecnicoLocal.SeleccionCodigo = "ARG"

    Set tecnicoVisitante = ##class(Fixture.Tecnico).%New()
    Set tecnicoVisitante.Codigo = "TEC-BRA-"_sufijo
    Set tecnicoVisitante.Nombre = "Tecnico visitante eliminacion"
    Set tecnicoVisitante.Nacionalidad = "Brasil"
    Set tecnicoVisitante.Licencia = "LIC-BRA-"_sufijo
    Set tecnicoVisitante.SeleccionCodigo = "BRA"

    Set partido = ##class(Fixture.Partido).%New()
    Set partido.Codigo = "F2030-"_sufijo
    Set partido.FechaHora = "2030-06-13 20:00:00"
    Set partido.EquipoLocalCodigo = "ARG"
    Set partido.EquipoVisitanteCodigo = "BRA"
    Set partido.ArbitroPrincipal = arbitro
    Set partido.TecnicoLocal = tecnicoLocal
    Set partido.TecnicoVisitante = tecnicoVisitante

    Set sc = partido.CambiarEstado("EnJuego")
    If $$$ISERR(sc) Quit sc
    Set sc = partido.RegistrarEvento("EVT-"_sufijo, "Gol", 10, "Evento temporal para probar eliminacion")
    If $$$ISERR(sc) Quit sc
    Set sc = partido.%Save()
    If $$$ISERR(sc) Quit sc

    Set partidoId = partido.%Id()
    Set arbitroId = arbitro.%Id()
    Set tecnicoLocalId = tecnicoLocal.%Id()
    Set tecnicoVisitanteId = tecnicoVisitante.%Id()
    Set clave = ""
    Set evento = partido.ObtenerSiguienteEvento(.clave)
    If '$IsObject(evento) Quit $$$ERROR($$$GeneralError, "No se creo el evento temporal")
    Set eventoId = evento.%Id()
    Set codigoEvento = evento.Codigo
    Set codigoPartido = partido.Codigo

    Set sc = ##class(Fixture.Evento).%DeleteId(eventoId)
    If $$$ISOK(sc) Quit $$$ERROR($$$GeneralError, "IRIS permitio eliminar un evento de forma directa")
    If ..ContarFilas("SELECT COUNT(*) AS Cantidad FROM Fixture.Evento WHERE Codigo = ?", codigoEvento) '= 1 {
        Quit $$$ERROR($$$GeneralError, "El evento desaparecio despues del rechazo de eliminacion")
    }
    Write "OK: eliminacion directa de evento rechazada", !
    Do $System.Status.DisplayError(sc)

    Set sc = ##class(Fixture.Partido).%DeleteId(partidoId)
    If $$$ISERR(sc) Quit sc
    If ..ContarFilas("SELECT COUNT(*) AS Cantidad FROM Fixture.Partido WHERE Codigo = ?", codigoPartido) '= 0 {
        Quit $$$ERROR($$$GeneralError, "El partido temporal no fue eliminado")
    }
    If ..ContarFilas("SELECT COUNT(*) AS Cantidad FROM Fixture.Evento WHERE Codigo = ?", codigoEvento) '= 0 {
        Quit $$$ERROR($$$GeneralError, "El evento temporal no fue eliminado en cascada")
    }

    Set sc = ##class(Fixture.Arbitro).%DeleteId(arbitroId)
    If $$$ISERR(sc) Quit sc
    Set sc = ##class(Fixture.Tecnico).%DeleteId(tecnicoLocalId)
    If $$$ISERR(sc) Quit sc
    Set sc = ##class(Fixture.Tecnico).%DeleteId(tecnicoVisitanteId)
    If $$$ISERR(sc) Quit sc

    Write "OK: eliminacion del partido borra sus eventos en cascada", !
    Quit $$$OK
}

ClassMethod ContarFilas(consulta As %String, parametro As %String) As %Integer
{
    Set sentencia = ##class(%SQL.Statement).%New()
    Set sc = sentencia.%Prepare(consulta)
    If $$$ISERR(sc) Quit -1

    Set resultado = sentencia.%Execute(parametro)
    If resultado.%SQLCODE < 0 Quit -1
    If 'resultado.%Next() Quit -1

    Quit resultado.%Get("Cantidad")
}

ClassMethod VerificarPersistencia(idPartido As %String) As %Status
{
    Set partido = ##class(Fixture.Partido).%OpenId(idPartido)
    If '$IsObject(partido) Quit $$$ERROR($$$GeneralError, "El partido no sobrevivio al reinicio")
    If partido.ObtenerEstado() '= "Finalizado" Quit $$$ERROR($$$GeneralError, "El partido no conservo el estado Finalizado")
    If partido.CantidadEventos() '= 2 Quit $$$ERROR($$$GeneralError, "El partido no conservo sus dos eventos")
    If '$IsObject(partido.ArbitroPrincipal) Quit $$$ERROR($$$GeneralError, "El partido no conservo su arbitro")
    If '$IsObject(partido.TecnicoLocal) Quit $$$ERROR($$$GeneralError, "El partido no conservo su tecnico local")
    If '$IsObject(partido.TecnicoVisitante) Quit $$$ERROR($$$GeneralError, "El partido no conservo su tecnico visitante")

    Set clave = ""
    Set recorridos = 0
    For {
        Set evento = partido.ObtenerSiguienteEvento(.clave)
        Quit:clave=""
        If '$IsObject(evento) Quit $$$ERROR($$$GeneralError, "La relacion durable devolvio un valor que no es un objeto")
        If evento.Partido.%Id() '= partido.%Id() Quit $$$ERROR($$$GeneralError, "Un evento no conservo la referencia inversa al partido")
        Set recorridos = recorridos + 1
    }
    If recorridos '= 2 Quit $$$ERROR($$$GeneralError, "La navegacion durable no recorrio los dos eventos")

    Write "OK: persistencia durable despues del reinicio", !
    Write "PERSISTIDO: ", partido.Codigo, " | estado=", partido.ObtenerEstado(), " | eventos=", partido.CantidadEventos(), !
    Quit $$$OK
}

}
