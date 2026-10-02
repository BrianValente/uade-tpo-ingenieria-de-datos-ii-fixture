"""Clientes concurrentes: comparar total esperado con total observado."""

import time
from concurrent.futures import ThreadPoolExecutor

from modulo import nuevo_modulo, mostrar


def ejecutar(modulo, clientes=8, operaciones=100):
    segundos = modulo.r.time()[0]
    if segundos % 3600 > 3580:
        raise RuntimeError('Ejecutar la medicion despues del cambio de hora')
    def trabajo(_):
        return [modulo.registrar_consulta('ARG')['clave'] for _ in range(operaciones)]

    inicio = time.perf_counter()
    with ThreadPoolExecutor(max_workers=clientes) as pool:
        lotes = list(pool.map(trabajo, range(clientes)))
    duracion = time.perf_counter() - inicio
    # Los buckets vencen al terminar la hora. No medir cruzando ese limite.
    if modulo.r.time()[0] // 3600 != segundos // 3600:
        raise RuntimeError('Medicion cruzo el cambio de hora; repetir')
    claves = sorted({clave for lote in lotes for clave in lote})
    equipo_id = modulo.fuente.datos['ARG']['_id']
    observado = sum(int(modulo.r.zscore(clave, equipo_id) or 0) for clave in claves)
    esperado = clientes * operaciones
    if observado != esperado:
        raise AssertionError('Se esperaban %s incrementos y se observaron %s' % (esperado, observado))
    return {'clientes': clientes, 'operaciones_por_cliente': operaciones,
            'esperado': esperado, 'observado': observado, 'segundos': duracion,
            'operaciones_por_segundo': esperado / duracion, 'claves': claves,
            'nota': 'Incluye TIME y Lua por consulta; cliente Python, hilos y red local.'}


if __name__ == '__main__':
    m = nuevo_modulo('concurrencia')
    mostrar({'namespace': m.prefijo, 'prueba': ejecutar(m), 'ranking': m.ranking()})
