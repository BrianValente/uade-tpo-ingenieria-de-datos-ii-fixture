"""Genera doce puntos didacticos. No es un generador de carga masiva."""

import argparse
import hashlib
import uuid
from datetime import datetime, timezone

from comun import MODULE, save_json


NAMESPACE = uuid.UUID("d650d6d8-e518-5f7d-8917-7ff4cc50bc94")
TEAM_IDS = {code: str(uuid.uuid5(NAMESPACE, "equipo:" + code)) for code in ("ARG", "BRA")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inicio", type=int, help="Inicio UTC como Unix timestamp en segundos")
    args = parser.parse_args()
    # Un minuto completo ya transcurrido, dentro de la retencion de siete dias.
    start = args.inicio if args.inicio is not None else int(datetime.now(timezone.utc).timestamp()) // 60 * 60 - 120
    if start % 60:
        parser.error("El inicio debe estar alineado al minuto (multiplo de 60).")
    folder = MODULE / "data" / "generated"
    folder.mkdir(parents=True, exist_ok=True)
    output = folder / "muestra.lp"
    if output.exists() or (folder / "manifest.json").exists():
        parser.error("La muestra ya existe. Reutilizarla o mover ambos archivos antes de generar otra.")
    possessions = [50.0, 52.0, 54.0, 56.0, 58.0, 60.0]
    shots = {"ARG": [0, 0, 1, 1, 1, 2], "BRA": [0, 1, 1, 1, 1, 1]}
    passes = {"ARG": [2, 3, 4, 2, 3, 4], "BRA": [1, 2, 3, 1, 2, 3]}
    lines = []
    for index, possession in enumerate(possessions):
        for code in ("ARG", "BRA"):
            value = possession if code == "ARG" else 100 - possession
            lines.append(
                f"estadisticas_equipo,partido_id=F2030-001,equipo_id={TEAM_IDS[code]} "
                f"posesion_pct={value:.1f},tiros_acumulados={shots[code][index]}i,"
                f"pases_intervalo={passes[code][index]}i {start + index * 10}")
    text = "\n".join(lines) + "\n"
    output.write_text(text, encoding="utf-8")
    manifest = {"origen": "muestra sintetica didactica", "partido_id": "F2030-001",
                "equipo_ids": TEAM_IDS, "inicio_s": start, "fin_exclusivo_s": start + 60,
                "precision": "second", "intervalo_s": 10, "puntos": 12,
                "sha256": hashlib.sha256(text.encode()).hexdigest(),
                "esperado": {"ARG": {"puntos": 6, "posesion_promedio": 55.0, "tiros_final": 2, "pases": 18},
                             "BRA": {"puntos": 6, "posesion_promedio": 45.0, "tiros_final": 1, "pases": 12}}}
    save_json(folder / "manifest.json", manifest)
    print("Muestra generada: 12 puntos, 2 equipos, 6 observaciones por equipo.")


if __name__ == "__main__":
    main()
