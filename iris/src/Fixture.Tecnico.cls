Class Fixture.Tecnico Extends Fixture.Persona
{

Property Licencia As %String(MAXLEN = 40) [ Required ];

Property SeleccionCodigo As %String(MAXLEN = 3) [ Required ];

Trigger SoloLecturaSQL [ Event = INSERT/UPDATE/DELETE, Foreach = ROW, Time = BEFORE ]
{
    Set %ok = 0
    Set %msg = "La proyeccion SQL del modulo Fixture es de solo lectura"
}

}
