"""Modulo local del Hito 7. La fuente de equipos es una simulacion explicita."""

import copy
import json
import os
import re
import threading
import uuid
from pathlib import Path

import redis
from redis.backoff import NoBackoff
from redis.retry import Retry

SESION_TTL = 1800
CACHE_TTL = 300
UUID_NAMESPACE = uuid.UUID('d650d6d8-e518-5f7d-8917-7ff4cc50bc94')
EQUIPOS = [('ARG', 'Argentina', 'CONMEBOL'), ('BRA', 'Brazil', 'CONMEBOL'),
           ('ESP', 'Spain', 'UEFA'), ('MAR', 'Morocco', 'CAF')]


def conectar(host=None, port=None):
    """No reintentar automaticamente escrituras cuyo resultado sea incierto."""
    return redis.Redis(
        host=host or os.environ.get('REDIS_HOST', '127.0.0.1'),
        port=port or int(os.environ.get('REDIS_PORT', '6379')),
        decode_responses=True, socket_connect_timeout=2, socket_timeout=2,
        retry=Retry(NoBackoff(), 0), retry_on_error=[],
    )


class FuenteSimulada:
    """Reemplaza a MongoDB solo en esta muestra; no consulta ni modifica MongoDB.

    El lock serializa lectura/carga e invalidacion dentro de un proceso.
    No constituye un mecanismo de coherencia entre procesos o motores.
    """

    def __init__(self):
        self.lock = threading.RLock()
        self.datos = {
            codigo: {'_id': str(uuid.uuid5(UUID_NAMESPACE, 'equipo:' + codigo)),
                     'codigo': codigo, 'nombre': nombre,
                     'confederacion': confederacion, 'version_muestra': 1}
            for codigo, nombre, confederacion in EQUIPOS
        }
        self.omitir_cache = set()


class Modulo:
    """Sesiones y cache de muestra bajo un namespace aislado por ejecucion."""

    def __init__(self, cliente, alcance, fuente=None, sesion_ttl=SESION_TTL,
                 cache_ttl=CACHE_TTL):
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', alcance):
            raise ValueError('Alcance invalido')
        if not isinstance(sesion_ttl, int) or sesion_ttl < 1:
            raise ValueError('TTL de sesion invalido')
        if not isinstance(cache_ttl, int) or cache_ttl < 1:
            raise ValueError('TTL de cache invalido')
        self.r = cliente
        self.prefijo = 'fixture2030:h7:' + alcance
        self.fuente = fuente or FuenteSimulada()
        self.sesion_ttl, self.cache_ttl = sesion_ttl, cache_ttl
        self.hits, self.misses = 0, 0
        carpeta = Path(__file__).parent
        self.crear = cliente.register_script((carpeta / 'crear_sesion.lua').read_text())
        self.actividad = cliente.register_script((carpeta / 'actividad_sesion.lua').read_text())
        self.contar = cliente.register_script((carpeta / 'consulta_equipo.lua').read_text())

    def clave_sesion(self, sesion_id):
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', sesion_id):
            raise ValueError('Identificador de sesion invalido')
        return self.prefijo + ':sesion:' + sesion_id

    def crear_sesion(self, sesion_id, usuario_id, dispositivo):
        # Los IDs de los scripts son sinteticos, no credenciales de acceso.
        return bool(self.crear(keys=[self.clave_sesion(sesion_id)],
                               args=[sesion_id, usuario_id, dispositivo, self.sesion_ttl]))

    def consultar_sesion(self, sesion_id, autenticada=False):
        # RedisError se propaga: no autorizar ni fingir una renovacion exitosa.
        valores = self.actividad(keys=[self.clave_sesion(sesion_id)],
                                 args=['renovar' if autenticada else 'leer', self.sesion_ttl])
        return dict(zip(valores[::2], valores[1::2])) if valores else None

    def finalizar_sesion(self, sesion_id):
        # Cierre o invalidacion explicita de ESTA sesion. No buscar otras claves.
        return self.r.delete(self.clave_sesion(sesion_id))

    def clave_cache(self, codigo):
        return self.prefijo + ':cache:equipo:' + self.fuente.datos[codigo]['_id']

    def equipo(self, codigo):
        # El mismo lock protege contra cargar la version anterior tras invalidar.
        # Todos los lectores/escritores de esta simulacion deben compartir fuente.
        with self.fuente.lock:
            dato = self.fuente.datos.get(codigo)
            if dato is None:
                return {'dato': None, 'origen': 'fuente_simulada', 'degradado': False}
            clave = self.clave_cache(codigo)
            degradado = codigo in self.fuente.omitir_cache
            if not degradado:
                try:
                    copia = self.r.get(clave)
                    if copia is not None:
                        self.hits += 1
                        return {'dato': json.loads(copia), 'origen': 'cache', 'degradado': False}
                    self.misses += 1
                except (redis.RedisError, ValueError):
                    degradado = True
            resultado = copy.deepcopy(dato)
            if not degradado:
                try:
                    self.r.set(clave, json.dumps(resultado), ex=self.cache_ttl)
                except redis.RedisError:
                    degradado = True
            return {'dato': resultado, 'origen': 'fuente_simulada', 'degradado': degradado}

    def actualizar_equipo(self, codigo, nombre):
        with self.fuente.lock:
            dato = self.fuente.datos[codigo]
            dato['nombre'] = nombre
            dato['version_muestra'] += 1
            try:
                self.r.delete(self.clave_cache(codigo))
                self.fuente.omitir_cache.discard(codigo)
                return True
            except redis.RedisError:
                # Fuente actualizada, invalidacion fallida: omitir la copia vieja.
                self.fuente.omitir_cache.add(codigo)
                return False

    def registrar_consulta(self, codigo):
        equipo_id = self.fuente.datos[codigo]['_id']
        # TIME del servidor evita depender del reloj de la notebook.
        for _ in range(2):
            segundos = self.r.time()[0]
            hora = segundos // 3600
            clave = self.prefijo + ':consultas:hora:' + str(hora)
            score = self.contar(keys=[clave], args=[equipo_id, (hora + 1) * 3600])
            if score is not None:
                return {'clave': clave, 'total_equipo': int(float(score))}
        raise RuntimeError('Cambio de ventana; repetir la operacion')

    def ranking(self, limite=4):
        hora = self.r.time()[0] // 3600
        clave = self.prefijo + ':consultas:hora:' + str(hora)
        return self.r.zrevrange(clave, 0, limite - 1, withscores=True)


def nuevo_modulo(tipo):
    return Modulo(conectar(), tipo + '-' + uuid.uuid4().hex)


def mostrar(dato):
    print(json.dumps(dato, ensure_ascii=False, indent=2))
