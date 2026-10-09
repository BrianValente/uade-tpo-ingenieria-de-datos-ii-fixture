Class Fixture.Persona Extends %Persistent [ Abstract ]
{

Property Codigo As %String(MAXLEN = 50) [ Required ];

Property Nombre As %String(MAXLEN = 120) [ Required ];

Property Nacionalidad As %String(MAXLEN = 80) [ Required ];

Index CodigoUnico On Codigo [ Unique ];

}
