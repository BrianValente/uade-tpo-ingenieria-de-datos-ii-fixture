Class Fixture.Persona Extends %Persistent [ Abstract ]
{

Property Codigo As %String(MAXLEN = 50) [ Required ];

Property Nombre As %String(MAXLEN = 120) [ Required ];

Property Nacionalidad As %String(MAXLEN = 80) [ Required ];

Index CodigoUnico On Codigo [ Unique ];

Trigger SoloLecturaSQL [ Event = INSERT/UPDATE/DELETE, Foreach = ROW, Time = BEFORE ]
{
    Set %ok = 0
    Set %msg = "La proyeccion SQL del modulo Fixture es de solo lectura"
}

}
