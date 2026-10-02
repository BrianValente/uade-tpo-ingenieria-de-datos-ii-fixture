"""Carga sintetica reproducible: mismos datos, namespace nuevo por ejecucion."""

from modulo import EQUIPOS, nuevo_modulo, mostrar


def cargar(modulo):
    # Diez usuarios; cada uno tiene una sesion de computadora y otra de telefono.
    for numero in range(1, 11):
        usuario = 'U%03d' % numero
        for dispositivo in ('compu', 'telefono'):
            modulo.crear_sesion(usuario + '-' + dispositivo, usuario, dispositivo)
    for codigo, _, _ in EQUIPOS:
        modulo.equipo(codigo)
    # Distribucion deliberadamente desigual: 6, 2, 1, 1 consultas por equipo.
    for codigo in ['ARG'] * 6 + ['BRA'] * 2 + ['ESP', 'MAR']:
        modulo.registrar_consulta(codigo)
    return {'namespace': modulo.prefijo, 'usuarios_sinteticos': 10,
            'sesiones': 20, 'copias_cache': 4, 'ranking': modulo.ranking(),
            'claves': 25, 'fuente': 'simulada_en_memoria'}


if __name__ == '__main__':
    mostrar(cargar(nuevo_modulo('muestra')))
