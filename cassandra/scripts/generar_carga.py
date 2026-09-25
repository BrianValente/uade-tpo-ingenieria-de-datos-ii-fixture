#!/usr/bin/env python3
import argparse
import collections
import csv
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


NAMESPACE = uuid.UUID("6e882f2e-5c41-58e4-bc84-61bb5fdc8e88")


def argumentos():
    parser = argparse.ArgumentParser(description="Genera comentarios sinteticos reproducibles")
    parser.add_argument("--cantidad", type=int, default=1_000_016)
    parser.add_argument("--partidos", type=int, default=32)
    parser.add_argument("--usuarios", type=int, default=100_000)
    parser.add_argument("--duracion-segundos", type=int, default=5_400)
    parser.add_argument("--partido-id", help="Usa un unico partido con este identificador")
    parser.add_argument("--salida", type=Path, default=Path("cassandra/data/generated"))
    return parser.parse_args()


def main():
    args = argumentos()
    if min(args.cantidad, args.partidos, args.usuarios, args.duracion_segundos) < 1:
        raise SystemExit("Todos los parametros numericos deben ser mayores que cero")

    args.salida.mkdir(parents=True, exist_ok=True)
    archivo_partido = args.salida / "comentarios_por_partido.csv"
    archivo_usuario = args.salida / "comentarios_por_usuario.csv"
    inicio = datetime(2030, 6, 13, 20, 0, tzinfo=timezone.utc)
    filas_por_particion = collections.Counter()
    filas_por_partido = collections.Counter()
    filas_por_grupo = collections.Counter()
    filas_por_estado = collections.Counter()

    columnas_partido = [
        "partido_id", "bucket_minuto", "grupo", "creado_en", "comentario_id",
        "usuario_id", "usuario_nombre", "contenido", "estado", "likes", "respuestas",
    ]
    columnas_usuario = [
        "usuario_id", "bucket_mes", "creado_en", "comentario_id", "partido_id",
        "usuario_nombre", "contenido", "estado", "likes", "respuestas",
    ]

    with archivo_partido.open("w", newline="", encoding="utf-8") as salida_partido, \
            archivo_usuario.open("w", newline="", encoding="utf-8") as salida_usuario:
        por_partido = csv.DictWriter(salida_partido, fieldnames=columnas_partido)
        por_usuario = csv.DictWriter(salida_usuario, fieldnames=columnas_usuario)
        por_partido.writeheader()
        por_usuario.writeheader()

        for indice in range(args.cantidad):
            partido_id = args.partido_id or f"F2030-{indice % args.partidos + 1:03d}"
            usuario_numero = indice % args.usuarios + 1
            usuario_id = uuid.uuid5(NAMESPACE, f"usuario:{usuario_numero}")
            comentario_id = uuid.uuid5(NAMESPACE, f"comentario:{indice}")
            creado_en = inicio + timedelta(seconds=(indice // args.partidos) % args.duracion_segundos)
            bucket_minuto = creado_en.replace(second=0, microsecond=0)
            grupo = comentario_id.int % 16
            estado = "pendiente" if indice % 50 == 0 else "visible"
            filas_por_particion[(partido_id, bucket_minuto.isoformat(), grupo)] += 1
            filas_por_partido[partido_id] += 1
            filas_por_grupo[grupo] += 1
            filas_por_estado[estado] += 1
            comun = {
                "creado_en": creado_en.isoformat(),
                "comentario_id": str(comentario_id),
                "usuario_id": str(usuario_id),
                "usuario_nombre": f"usuario_{usuario_numero:06d}",
                "contenido": f"Comentario sintetico {indice:07d}",
                "estado": estado,
                "likes": indice % 21,
                "respuestas": indice % 4,
            }
            por_partido.writerow({
                "partido_id": partido_id,
                "bucket_minuto": bucket_minuto.isoformat(),
                "grupo": grupo,
                **comun,
            })
            por_usuario.writerow({
                **comun,
                "bucket_mes": creado_en.date().replace(day=1).isoformat(),
                "partido_id": partido_id,
            })

    metadata = {
        "cantidad_comentarios": args.cantidad,
        "cantidad_filas": args.cantidad * 2,
        "partidos": args.partidos,
        "partido_id_fijo": args.partido_id,
        "usuarios": args.usuarios,
        "grupos_por_minuto": 16,
        "duracion_segundos": args.duracion_segundos,
        "inicio_utc": inicio.isoformat(),
        "particiones_principales": len(filas_por_particion),
        "filas_por_particion_min": min(filas_por_particion.values()),
        "filas_por_particion_max": max(filas_por_particion.values()),
        "filas_por_particion_promedio": round(
            args.cantidad / len(filas_por_particion), 2
        ),
        "filas_por_partido_min": min(filas_por_partido.values()),
        "filas_por_partido_max": max(filas_por_partido.values()),
        "filas_por_grupo_min": min(filas_por_grupo.values()),
        "filas_por_grupo_max": max(filas_por_grupo.values()),
        "filas_por_estado": dict(filas_por_estado),
        "archivos": [str(archivo_partido), str(archivo_usuario)],
    }
    (args.salida / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
