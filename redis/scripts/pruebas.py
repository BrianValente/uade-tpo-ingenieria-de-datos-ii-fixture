"""Pruebas reales sobre Redis; namespace nuevo y sin limpieza global.

El fallo de invalidacion se simula de forma explicita. La falta de conexion y
la presion de memoria se prueban realmente. El contenedor OOM esta aislado.
"""

import argparse
import json
import os
import platform
import socket
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import redis

from carga_muestra import cargar
from concurrencia import ejecutar
from modulo import Modulo, conectar


def verificar(condicion, mensaje):
    if not condicion:
        raise AssertionError(mensaje)


def debe_fallar(operacion):
    try:
        operacion()
    except redis.RedisError:
        return
    raise AssertionError('Se esperaba RedisError y no autorizacion')


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


def prueba_memoria(alcance):
    """2 MiB de maxmemory solo en un contenedor nuevo, sin volumen de datos."""
    nombre = 'fixture2030-h7-memoria-' + uuid.uuid4().hex[:10]
    creado = False
    try:
        docker('run', '-d', '--name', nombre, '--memory', '64m',
               '--label', 'com.docker.compose.project=fixture2030-h7-pruebas',
               '-p', '127.0.0.1::6379', 'redis:latest', 'redis-server',
               '--maxmemory', '2mb', '--maxmemory-policy', 'noeviction',
               '--appendonly', 'no', '--save', '')
        creado = True
        puerto = int(docker('port', nombre, '6379/tcp').split(':')[-1])
        r = conectar(port=puerto)
        for _ in range(30):
            try:
                if r.ping():
                    break
            except redis.RedisError:
                time.sleep(0.1)
        else:
            raise AssertionError('El servidor de memoria no inicio')
        m = Modulo(r, alcance)
        m.crear_sesion('previa', 'U001', 'compu')
        escrituras = 0
        # Bloques pequenos reducen el efecto transitorio del buffer del cliente.
        for i in range(4096):
            try:
                r.set(m.prefijo + ':relleno:' + str(i), 'x' * 1024, ex=60)
                escrituras += 1
            except redis.exceptions.OutOfMemoryError:
                break
        else:
            raise AssertionError('No se alcanzo el limite esperado')
        # Un OOM aislado no garantiza presion sostenida: buffers pueden liberarse.
        # Reducir SOLO este limite aislado fija memoria existente por encima del
        # umbral para comprobar los errores de sesion y el fallback de cache.
        r.config_set('maxmemory', 1048576)
        verificar(r.info('memory')['used_memory'] > 1048576, 'No hay presion sostenida')
        verificar(r.exists(m.clave_sesion('previa')) == 1, 'La sesion fue expulsada')
        debe_fallar(lambda: m.crear_sesion('rechazada', 'U002', 'telefono'))
        verificar(r.exists(m.clave_sesion('rechazada')) == 0, 'Creacion parcial ante OOM')
        debe_fallar(lambda: m.consultar_sesion('previa', autenticada=True))
        copia = m.equipo('ARG')
        verificar(copia['origen'] == 'fuente_simulada' and copia['degradado'],
                  'La cache no recupero la fuente ante OOM')
        verificar(r.exists(m.clave_cache('ARG')) == 0, 'Se esperaba fallo de carga en cache')
        verificar(r.info('stats')['evicted_keys'] == 0, 'Hubo eviction con noeviction')
        return {'tipo': 'real_contenedor_aislado', 'maxmemory_carga_bytes': 2097152,
                'maxmemory_presion_sostenida_bytes': 1048576,
                'escrituras_relleno': escrituras, 'error_oom': True,
                'sesion_previa_conservada': True, 'creacion_y_renovacion_rechazadas': True,
                'cache_responde_fuente': True, 'evicted_keys': 0}
    finally:
        if creado:
            # Borrado autorizado solo de este contenedor nuevo, sin volumen.
            docker('rm', '-f', nombre)


def ejecutar_pruebas(incluir_memoria=False):
    r = conectar()
    alcance = 'pruebas-' + uuid.uuid4().hex
    salida = {'fecha_utc': datetime.now(timezone.utc).isoformat(),
              'namespace': 'fixture2030:h7:' + alcance, 'pruebas': []}

    def registrar(nombre, resultado):
        salida['pruebas'].append({'nombre': nombre, 'estado': 'OK', 'resultado': resultado})

    verificar(r.ping(), 'Redis no responde')
    salida['entorno'] = {
        'redis_version': r.info('server')['redis_version'],
        'redis_mode': r.info('server')['redis_mode'],
        'python': sys.version.split()[0], 'redis_py': redis.__version__,
        'host': platform.platform(), 'host_cpus_logicas': os.cpu_count(),
        'docker_context': docker('context', 'show'),
        'docker_recursos': docker('info', '--format', '{{.NCPU}} CPUs; {{.MemTotal}} bytes RAM'),
        'imagen_digest': json.loads(docker('image', 'inspect', 'redis:latest',
                                          '--format', '{{json .RepoDigests}}')),
        'config': r.config_get('maxmemory', 'maxmemory-policy', 'appendonly', 'appendfsync', 'save'),
    }
    if platform.system() == 'Darwin':
        salida['entorno']['host_ram_bytes'] = int(subprocess.check_output(
            ['sysctl', '-n', 'hw.memsize'], text=True))
    verificar(salida['entorno']['config']['maxmemory'] == '268435456', 'Limite distinto de 256 MiB')
    verificar(salida['entorno']['config']['maxmemory-policy'] == 'noeviction', 'Politica incorrecta')
    registrar('disponibilidad_y_configuracion', salida['entorno']['config'])

    # Carga real: cuatro fichas simuladas y veinte sesiones reales en Redis.
    m = Modulo(r, alcance + '-carga')
    carga = cargar(m)
    keys = list(r.scan_iter(match=m.prefijo + ':*', count=100))
    verificar(len(keys) == 25, 'Cantidad incorrecta de claves de muestra')
    verificar(all(r.ttl(k) > 0 for k in keys), 'Dato temporal sin TTL')
    carga['ttl_sesion_segundos'] = r.ttl(m.clave_sesion('U001-compu'))
    carga['ttl_cache_segundos'] = r.ttl(m.clave_cache('ARG'))
    carga['ttl_ranking_segundos'] = r.ttl(m.prefijo + ':consultas:hora:' + str(r.time()[0] // 3600))
    registrar('carga_reproducible', carga)

    # Conservar las otras sesiones del usuario al cerrar una.
    s = Modulo(r, alcance + '-sesiones', sesion_ttl=4)
    verificar(s.crear_sesion('compu', 'U001', 'compu'), 'No se creo la sesion')
    s.crear_sesion('telefono', 'U001', 'telefono')
    verificar(not s.crear_sesion('compu', 'U002', 'otro'), 'Se sobrescribio una sesion')
    inicio = s.consultar_sesion('compu')
    time.sleep(1.1)
    ttl_antes_publica = r.pttl(s.clave_sesion('compu'))
    publica = s.consultar_sesion('compu')
    ttl_despues_publica = r.pttl(s.clave_sesion('compu'))
    if inicio is None or publica is None:
        raise AssertionError('Sesion ausente antes de renovar')
    verificar(publica['ultima_actividad'] == inicio['ultima_actividad'], 'Lectura renovo actividad')
    verificar(ttl_despues_publica <= ttl_antes_publica, 'Lectura renovo TTL')
    renovada = s.consultar_sesion('compu', autenticada=True)
    ttl_renovado = r.pttl(s.clave_sesion('compu'))
    if renovada is None:
        raise AssertionError('Sesion ausente durante renovacion')
    verificar(float(renovada['ultima_actividad']) > float(inicio['ultima_actividad']), 'Actividad no actualizada')
    verificar(ttl_renovado > ttl_despues_publica and ttl_renovado <= 4000, 'TTL no renovado')
    s.finalizar_sesion('compu')
    verificar(s.consultar_sesion('compu', autenticada=True) is None, 'Se recreo una sesion cerrada')
    verificar(s.consultar_sesion('telefono') is not None, 'El cierre afecto otro dispositivo')
    r.hset(s.clave_sesion('telefono'), 'estado_acceso', 'bloqueado')
    verificar(s.consultar_sesion('telefono', autenticada=True) is None, 'Estado bloqueado autorizado')
    registrar('sesiones_creacion_lectura_renovacion_y_cierre', {
        'ttl_prueba_segundos': 4, 'pttl_antes_lectura': ttl_antes_publica,
        'pttl_despues_lectura': ttl_despues_publica, 'pttl_renovado': ttl_renovado,
        'multiples_dispositivos': True, 'cierre_no_recrea': True, 'estado_bloqueado_rechazado': True})

    # Expiracion acelerada: no esperar 30 minutos en el laboratorio.
    corta = Modulo(r, alcance + '-expiracion', sesion_ttl=2)
    corta.crear_sesion('vencida', 'U001', 'compu')
    time.sleep(2.1)
    verificar(corta.consultar_sesion('vencida', autenticada=True) is None, 'Sesion vencida autorizada')
    verificar(r.ttl(corta.clave_sesion('vencida')) == -2, 'La actividad recreo la sesion vencida')
    registrar('expiracion_nativa', {'ttl_prueba_segundos': 2, 'ttl_final': -2})

    # Serializacion real en Redis: cierre compite con renovaciones.
    carrera = Modulo(r, alcance + '-carrera')
    for numero in range(20):
        sid = 'carrera-' + str(numero)
        carrera.crear_sesion(sid, 'U001', 'compu')
        barrera = threading.Barrier(3)

        def renovar():
            barrera.wait()
            for _ in range(10):
                carrera.consultar_sesion(sid, autenticada=True)

        def cerrar():
            barrera.wait()
            carrera.finalizar_sesion(sid)

        with ThreadPoolExecutor(max_workers=3) as pool:
            tareas = [pool.submit(renovar), pool.submit(renovar), pool.submit(cerrar)]
            for tarea in tareas:
                tarea.result()
        verificar(r.exists(carrera.clave_sesion(sid)) == 0, 'La carrera recreo una sesion')
    registrar('cierre_concurrente', {'repeticiones': 20, 'renovaciones_por_cierre': 20,
                                  'sesiones_recreadas': 0})

    c = Modulo(r, alcance + '-cache', cache_ttl=2)
    miss = c.equipo('ARG')
    time.sleep(0.1)
    cache_ttl_antes = r.pttl(c.clave_cache('ARG'))
    hit = c.equipo('ARG')
    verificar(r.pttl(c.clave_cache('ARG')) <= cache_ttl_antes, 'Cache hit renovo el TTL')
    verificar(miss['origen'] == 'fuente_simulada' and hit['origen'] == 'cache', 'Flujo miss/hit incorrecto')
    verificar(c.actualizar_equipo('ARG', 'Argentina actualizada'), 'Invalidacion no confirmada')
    verificar(r.exists(c.clave_cache('ARG')) == 0, 'La copia anterior sigue presente')
    nueva = c.equipo('ARG')
    verificar(nueva['dato']['version_muestra'] == 2, 'Se sirvio la version anterior')
    time.sleep(2.1)
    verificar(r.ttl(c.clave_cache('ARG')) == -2, 'Cache no vencio')
    verificar(c.equipo('ARG')['origen'] == 'fuente_simulada', 'No recupero fuente despues de vencer')
    verificar(c.equipo('XXX')['dato'] is None, 'Invento un equipo inexistente')
    registrar('cache_hit_miss_invalidacion_y_expiracion', {
        'ttl_prueba_segundos': 2, 'version_tras_actualizar': 2,
        'hits_modulo': c.hits, 'misses_modulo': c.misses})

    # Lecturas y actualizacion comparten el lock de la fuente simulada.
    cc = Modulo(r, alcance + '-cache-concurrente')
    with ThreadPoolExecutor(max_workers=5) as pool:
        lecturas = [pool.submit(cc.equipo, 'ARG') for _ in range(20)]
        escritura = pool.submit(cc.actualizar_equipo, 'ARG', 'Argentina actualizada')
        for tarea in lecturas:
            tarea.result()
        escritura.result()
    verificar(cc.equipo('ARG')['dato']['version_muestra'] == 2, 'Carga vieja despues de invalidar')
    registrar('cache_concurrente_local', {'version_final': 2, 'alcance': 'un_proceso_fuente_compartida'})

    # Falla de invalidacion SIMULADA, sin detener el Redis principal.
    class FallaDelete:
        def __getattr__(self, nombre):
            return getattr(r, nombre)

        def delete(self, *args):
            raise redis.ConnectionError('Fallo de invalidacion simulado')

    cf = Modulo(FallaDelete(), alcance + '-invalidacion-fallida')
    cf.equipo('ARG')
    verificar(not cf.actualizar_equipo('ARG', 'Argentina nueva'), 'No informo la invalidacion fallida')
    recuperada = cf.equipo('ARG')
    verificar(recuperada['degradado'] and recuperada['dato']['version_muestra'] == 2,
              'Sirvio la copia vieja despues del fallo')
    registrar('invalidacion_fallida', {'tipo': 'fallo_simulado', 'version_respuesta': 2,
                                    'cache_omitida': True})

    # Puerto realmente inaccesible: socket reservado, sin servidor escuchando.
    with socket.socket() as reserva:
        reserva.bind(('127.0.0.1', 0))
        caido = Modulo(conectar(port=reserva.getsockname()[1]), alcance + '-sin-servidor')
        debe_fallar(lambda: caido.crear_sesion('sin-conexion', 'U001', 'compu'))
        debe_fallar(lambda: caido.consultar_sesion('sin-conexion', autenticada=True))
        fallback = caido.equipo('ARG')
        verificar(fallback['degradado'] and fallback['origen'] == 'fuente_simulada', 'Sin fallback')
    registrar('redis_no_disponible', {'tipo': 'conexion_real_rechazada',
                                    'sesion_no_autorizada': True, 'cache_responde_fuente': True})

    ranking = Modulo(r, alcance + '-ventana')
    clave = ranking.prefijo + ':consultas:prueba-corta'
    fin = r.time()[0] + 3
    ranking.contar(keys=[clave], args=['ARG', fin])
    vencimiento = r.expiretime(clave)
    ranking.contar(keys=[clave], args=['BRA', fin])
    verificar(r.expiretime(clave) == vencimiento == fin, 'La consulta extendio la ventana')
    verificar(len(r.zrevrange(clave, 0, 3)) == 2, 'Ranking incorrecto')
    time.sleep(3.1)
    verificar(r.ttl(clave) == -2, 'Ventana no vencio')
    registrar('ranking_ventana_fija', {'ventana_acelerada_segundos': 3, 'ttl_final': -2})

    stats_antes = r.info('stats')
    memoria_antes = r.info('memory')['used_memory']
    concurrencia = Modulo(r, alcance + '-contador')
    medicion = ejecutar(concurrencia)
    stats_despues = r.info('stats')
    medicion['memoria_antes_bytes'] = memoria_antes
    medicion['memoria_despues_bytes'] = r.info('memory')['used_memory']
    medicion['deltas_stats_instancia'] = {
        campo: stats_despues[campo] - stats_antes[campo]
        for campo in ('keyspace_hits', 'keyspace_misses', 'expired_keys', 'evicted_keys')}
    registrar('contador_concurrente_y_medicion', medicion)

    if incluir_memoria:
        registrar('presion_memoria_noeviction', prueba_memoria(alcance + '-oom'))
    salida['estado'] = 'OK'
    salida['limites'] = [
        'Nodo local; no prueba millones de usuarios, disponibilidad regional ni failover.',
        'TTL acelerados solo para pruebas; las sesiones normales usan 1800 s y la cache 300 s.',
        'Fuente simulada; coherencia de cache limitada a un proceso con fuente compartida.',
        'Deltas INFO de toda la instancia, no tasa de hit del modulo.',
        'La medicion incluye red, Python, TIME y Lua; no es redis-benchmark.',
        'No se prueba durabilidad ante caida abrupta ni perdida de respuestas de escritura.',
    ]
    return salida


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--memoria', action='store_true', help='Crear y retirar un contenedor OOM aislado')
    parser.add_argument('--salida', type=Path, help='Guardar evidencia JSON en una carpeta existente')
    args = parser.parse_args()
    if args.salida and not args.salida.parent.is_dir():
        parser.error('La carpeta de evidencia debe existir')
    resultado = ejecutar_pruebas(args.memoria)
    texto = json.dumps(resultado, ensure_ascii=False, indent=2)
    if args.salida:
        if args.salida.exists():
            parser.error('Elegir otra salida; no sobrescribir evidencia previa')
        args.salida.write_text(texto + '\n', encoding='utf-8')
    print(texto)
