"""Genera la prueba acordada: 32 partidos existentes, 90 minutos, cada diez segundos."""

import argparse
import csv
import hashlib
import uuid
from datetime import datetime, timezone

from comun import MODULE, ROOT, save_json
from generacion_muestra import NAMESPACE


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inicio", type=int, help="Unix timestamp UTC alineado al minuto")
    args = parser.parse_args()
    source = ROOT / "neo4j/import/partidos.csv"
    with source.open(newline="", encoding="utf-8") as handle:
        matches = list(csv.DictReader(handle))
    ids = {row["id"] for row in matches}
    if len(matches) != 32 or len(ids) != 32:
        parser.error("La prueba acordada necesita 32 partidos distintos en el CSV.")
    start = args.inicio if args.inicio is not None else int(datetime.now(timezone.utc).timestamp()) // 60 * 60 - 10800
    if start % 60:
        parser.error("El inicio debe ser multiplo de sesenta segundos.")
    now = int(datetime.now(timezone.utc).timestamp())
    if start < now - 6 * 86400 or start + 5400 > now:
        parser.error("Usar una ventana ya terminada y de menos de seis dias.")
    folder = MODULE / "data/generated/prueba"
    folder.mkdir(parents=True, exist_ok=True)
    output = folder / "puntos.lp"
    if output.exists() or (folder / "manifest.json").exists():
        parser.error("La prueba ya existe. Reutilizarla o respaldar sus archivos antes de generar otra.")
    expected = []
    digest = hashlib.sha256()
    with output.open("x", encoding="utf-8") as handle:
        for match_index, match in enumerate(matches):
            for side, code in enumerate((match["localCodigo"], match["visitanteCodigo"])):
                if not code.isalnum() or not match["id"].replace("-", "").isalnum():
                    raise ValueError("Identificador de origen no valido para esta prueba.")
                team = str(uuid.uuid5(NAMESPACE, "equipo:" + code))
                shots = passes_total = possession_total = 0
                for index in range(540):
                    local_possession = 40 + (index + match_index) % 21
                    possession = float(local_possession if side == 0 else 100 - local_possession)
                    if index and index % (37 if side == 0 else 53) == 0:
                        shots += 1
                    passes = 2 + (index + match_index + side) % 5
                    passes_total += passes
                    possession_total += possession
                    line = (f"estadisticas_equipo,partido_id={match['id']},equipo_id={team} "
                            f"posesion_pct={possession:.1f},tiros_acumulados={shots}i,"
                            f"pases_intervalo={passes}i {start + index * 10}\n")
                    handle.write(line)
                    digest.update(line.encode())
                expected.append({"partido_id": match["id"], "equipo_id": team, "codigo": code,
                                 "puntos": 540, "posesion_promedio": possession_total / 540,
                                 "tiros_final": shots, "pases": passes_total})
    save_json(folder / "manifest.json", {
        "origen": "prueba sintetica con identificadores del CSV de Neo4j",
        "csv_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "sha256": digest.hexdigest(), "partidos": 32, "series": 64,
        "puntos": 34560, "minutos_por_partido": 90, "intervalo_s": 10,
        "inicio_s": start, "fin_exclusivo_s": start + 5400,
        "precision": "second", "esperado_por_serie": expected})
    print("Generados 34.560 puntos: 32 partidos, 64 series, 540 puntos por serie.")


if __name__ == "__main__":
    main()
