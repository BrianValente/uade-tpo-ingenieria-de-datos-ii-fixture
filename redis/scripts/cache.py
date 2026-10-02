"""Hit, miss e invalidacion; los cambios de fuente son una simulacion."""

from modulo import nuevo_modulo, mostrar


if __name__ == '__main__':
    m = nuevo_modulo('cache')
    mostrar({'namespace': m.prefijo, 'miss': m.equipo('ARG'), 'hit': m.equipo('ARG')})
    invalidada = m.actualizar_equipo('ARG', 'Argentina - ficha de muestra actualizada')
    mostrar({'invalidada': invalidada, 'lectura_actualizada': m.equipo('ARG'),
             'ttl': m.r.ttl(m.clave_cache('ARG')), 'hits': m.hits, 'misses': m.misses})
