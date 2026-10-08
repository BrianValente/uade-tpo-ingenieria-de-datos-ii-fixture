"""Guarda solo minutos completos. No sobrescribe resumenes con contenido distinto."""

import argparse
import hashlib
import json
import math
from collections import defaultdict
from datetime import datetime, timezone

from comun import DATABASE, HISTORY, LOCAL, MODULE, TEST_DATABASE, TEST_HISTORY, cli, query, request, save_json
from validacion import require


def utc_seconds(text):
    value = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def build_summaries(rows):
    groups = defaultdict(list)
    for row in rows:
        instant = utc_seconds(row["time"])
        minute = int(instant // 60) * 60
        groups[(row["partido_id"], row["equipo_id"], minute)].append(row)
    summaries, incomplete = [], []
    for (match, team, minute), points in sorted(groups.items()):
        points.sort(key=lambda point: utc_seconds(point["time"]))
        times = [utc_seconds(point["time"]) for point in points]
        if times != [minute + index * 10 for index in range(6)]:
            incomplete.append({"partido_id": match, "equipo_id": team,
                               "minuto_s": minute, "muestras": len(points)})
            continue
        for point in points:
            require(isinstance(point["posesion_pct"], (int, float))
                    and math.isfinite(point["posesion_pct"]) and 0 <= point["posesion_pct"] <= 100,
                    "Posesion no valida.")
            for field in ("tiros_acumulados", "pases_intervalo"):
                require(isinstance(point[field], int) and point[field] >= 0, "Contador no valido.")
        source_hash = hashlib.sha256(json.dumps(points, sort_keys=True).encode()).hexdigest()
        summaries.append({"partido_id": match, "equipo_id": team, "minuto_s": minute,
                          "posesion_promedio": sum(point["posesion_pct"] for point in points) / 6,
                          "tiros_final": points[-1]["tiros_acumulados"],
                          "pases": sum(point["pases_intervalo"] for point in points),
                          "muestras": 6, "source_hash": source_hash})
    return summaries, incomplete


def store_summaries(raw_database, history_database, start, end):
    require(start % 60 == end % 60 == 0 and start < end, "Usar minutos completos en la ventana.")
    params = {"inicio": datetime.fromtimestamp(start, timezone.utc).isoformat(),
              "fin": datetime.fromtimestamp(end, timezone.utc).isoformat()}
    rows = query("SELECT time, partido_id, equipo_id, posesion_pct, tiros_acumulados, pases_intervalo "
                 "FROM estadisticas_equipo WHERE time >= CAST($inicio AS TIMESTAMP) "
                 "AND time < CAST($fin AS TIMESTAMP) ORDER BY partido_id, equipo_id, time",
                 params, raw_database)
    summaries, incomplete = build_summaries(rows)
    # Comprobar la existencia de la tabla antes de consultarla. Nunca ignorar un error SQL.
    tables = query("SELECT table_name FROM information_schema.tables "
                   "WHERE table_name = 'estadisticas_minuto'", database=history_database)
    previous = query("SELECT time, partido_id, equipo_id, source_hash FROM estadisticas_minuto "
                     "WHERE time >= CAST($inicio AS TIMESTAMP) AND time < CAST($fin AS TIMESTAMP)",
                     params, history_database) if tables else []
    existing = {(row["partido_id"], row["equipo_id"], utc_seconds(row["time"])): row["source_hash"]
                for row in previous}
    lines = []
    for summary in summaries:
        identity = (summary["partido_id"], summary["equipo_id"], summary["minuto_s"])
        if identity in existing:
            require(existing[identity] == summary["source_hash"],
                    "Un resumen existente tiene otra fuente. Core no garantiza sobrescrituras; "
                    "definir versionado antes de aceptar esta correccion.")
            continue
        lines.append(f"estadisticas_minuto,partido_id={summary['partido_id']},equipo_id={summary['equipo_id']} "
                     f"posesion_promedio={summary['posesion_promedio']:.12f},tiros_final={summary['tiros_final']}i,"
                     f"pases={summary['pases']}i,muestras=6i,source_hash=\"{summary['source_hash']}\" {summary['minuto_s']}")
    for index in range(0, len(lines), 1000):
        request("/api/v3/write_lp", "\n".join(lines[index:index + 1000]) + "\n",
                f"?db={history_database}&precision=second&accept_partial=false", plain=True)
    return {"completos": len(summaries), "escritos": len(lines),
            "ya_existentes": len(summaries) - len(lines), "incompletos": incomplete}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prueba", action="store_true", help="Usar el experimento de 32 partidos")
    parser.add_argument("--evidencia", action="store_true")
    args = parser.parse_args()
    folder = MODULE / ("data/generated/prueba" if args.prueba else "data/generated")
    manifest = json.loads((folder / "manifest.json").read_text())
    raw, history = (TEST_DATABASE, TEST_HISTORY) if args.prueba else (DATABASE, HISTORY)
    result = store_summaries(raw, history, manifest["inicio_s"], manifest["fin_exclusivo_s"])
    expected = 5760 if args.prueba else 2
    require(result["completos"] == expected and not result["incompletos"], "Faltan minutos completos.")
    params = {"inicio": datetime.fromtimestamp(manifest["inicio_s"], timezone.utc).isoformat(),
              "fin": datetime.fromtimestamp(manifest["fin_exclusivo_s"], timezone.utc).isoformat()}
    stored = query("SELECT partido_id, equipo_id, COUNT(*) AS minutos, SUM(pases) AS pases, "
                   "SUM(muestras) AS muestras, AVG(posesion_promedio) AS posesion_promedio "
                   "FROM estadisticas_minuto "
                   "WHERE time >= CAST($inicio AS TIMESTAMP) AND time < CAST($fin AS TIMESTAMP) "
                   "GROUP BY partido_id, equipo_id ORDER BY partido_id, equipo_id", params, history)
    require(sum(row["minutos"] for row in stored) == expected, "Conteo historico incorrecto.")
    require(sum(row["muestras"] for row in stored) == manifest["puntos"], "Cobertura historica incorrecta.")
    expected_series = manifest["esperado_por_serie"] if args.prueba else [
        {"partido_id": manifest["partido_id"], "equipo_id": team,
         "pases": manifest["esperado"][code]["pases"],
         "posesion_promedio": manifest["esperado"][code]["posesion_promedio"]}
        for code, team in manifest["equipo_ids"].items()]
    require(len(stored) == len(expected_series), "Cantidad de series historicas incorrecta.")
    for expected_row in expected_series:
        matches = [row for row in stored if row["partido_id"] == expected_row["partido_id"]
                   and row["equipo_id"] == expected_row["equipo_id"]]
        require(len(matches) == 1, "Serie historica ausente.")
        require(matches[0]["minutos"] == (90 if args.prueba else 1), "Minutos por serie incorrectos.")
        require(matches[0]["pases"] == expected_row["pases"], "La suma historica de pases no coincide.")
        require(abs(matches[0]["posesion_promedio"] - expected_row["posesion_promedio"]) < 1e-8,
                "El promedio historico no coincide con el detalle completo.")
    policies = json.loads(cli("show", "retention", "--format", "json"))
    retention = {row["database_name"]: row["retention_period"] for row in policies}
    require(retention.get(raw) == "7.0000d" and retention.get(history) == "90.0000d",
            "Retenciones de detalle e historico incorrectas.")
    report = {"fecha_utc": datetime.now(timezone.utc).isoformat(), "resultado": "PASS",
              "base_detalle": raw, "base_historica": history, "ventana": params,
              **result, "distribucion_historica": stored,
              "retenciones": {raw: retention[raw], history: retention[history]},
              "limites": ["Ejecucion manual; no hay planificador automatico.",
                          "No actualiza resumenes ya escritos con otra fuente; requiere versionado.",
                          "Un minuto totalmente ausente no aparece; la prueba valida el conteo esperado."]}
    save_json(LOCAL / ("resumenes_prueba.json" if args.prueba else "resumenes_muestra.json"), report)
    if args.evidencia:
        save_json(MODULE / "docs/evidencia" / ("resumenes_prueba.json" if args.prueba else "resumenes_muestra.json"), report)
    print(json.dumps({key: value for key, value in report.items() if key != "distribucion_historica"},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
