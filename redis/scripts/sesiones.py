"""Demostracion de sesiones sinteticas; no implementa login ni una API."""

from modulo import nuevo_modulo, mostrar


if __name__ == '__main__':
    m = nuevo_modulo('sesiones')
    m.crear_sesion('demo-compu', 'U001', 'compu')
    m.crear_sesion('demo-telefono', 'U001', 'telefono')
    mostrar({'namespace': m.prefijo, 'creada': m.consultar_sesion('demo-compu'),
             'request_autenticado': m.consultar_sesion('demo-compu', autenticada=True),
             'ttl': m.r.ttl(m.clave_sesion('demo-compu'))})
    m.finalizar_sesion('demo-compu')
    mostrar({'despues_del_cierre': m.consultar_sesion('demo-compu', autenticada=True),
             'telefono_sigue_vigente': m.consultar_sesion('demo-telefono') is not None})
