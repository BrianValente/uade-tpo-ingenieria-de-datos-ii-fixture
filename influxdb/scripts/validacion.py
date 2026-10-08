"""Verifica resultados, tipos, ventana y retencion. Registra evidencia sin secretos."""

import argparse
import json
import platform
import subprocess
from datetime import datetime, timezone

from comun import DATABASE, HISTORY, LOCAL, MODULE, ROOT, cli, query, save_json
from consultas_temporales import run_queries


def command(*args):
    return subprocess.run(args, cwd=ROOT, check=True, text=True,
                          capture_output=True, timeout=60).stdout.strip()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidencia", action="store_true", help="Guardar el reporte en docs/evidencia")
    args = parser.parse_args()
    manifest, results = run_queries()
    require(len(results["ventana"]["filas"]) == 6, "La ventana debe tener seis puntos de Argentina.")
    points = results["ventana"]["filas"]
    # La API JSON de Core devuelve estas marcas sin sufijo de zona; son UTC.
    times = [datetime.fromisoformat(row["time"].replace("Z", "+00:00"))
             .replace(tzinfo=timezone.utc).timestamp() for row in points]
    require(times == [manifest["inicio_s"] + 10 * index for index in range(6)],
            "Los puntos no respetan la ventana y separacion de diez segundos.")
    require([row["tiros_acumulados"] for row in points] == [0, 0, 1, 1, 1, 2],
            "El contador no coincide con el caso didactico.")
    for name in ("comparacion", "agregacion_minuto"):
        rows = results[name]["filas"]
        require(len(rows) == 2, "La comparacion debe devolver dos equipos.")
        for code, team_id in manifest["equipo_ids"].items():
            matches = [row for row in rows if row["equipo_id"] == team_id]
            require(len(matches) == 1, "Equipo ausente o repetido en la agregacion.")
            row = matches[0]
            expected = manifest["esperado"][code]
            for key in ("posesion_promedio", "tiros_final", "pases"):
                require(abs(row[key] - expected[key]) < 1e-8, f"Agregado incorrecto: {code}, {key}.")
            require(row["muestras"] == 6, "Se esperaban seis muestras por equipo.")
    params = dict(results["ventana"]["parametros"])
    params["inicio"] = params["fin"]
    params["fin"] = datetime.fromtimestamp(manifest["fin_exclusivo_s"] + 60, timezone.utc).isoformat()
    require(query(results["ventana"]["sql"], params) == [], "La ventana posterior debe estar vacia.")
    schema = query("SELECT column_name, data_type FROM information_schema.columns "
                   "WHERE table_name = 'estadisticas_equipo' ORDER BY column_name")
    require({row["column_name"]: row["data_type"] for row in schema} == {
        "equipo_id": "Dictionary(Int32, Utf8)", "partido_id": "Dictionary(Int32, Utf8)",
        "pases_intervalo": "Int64", "posesion_pct": "Float64", "time": "Timestamp(ns)",
        "tiros_acumulados": "Int64"}, "Los tipos de la tabla no coinciden con el modelo.")
    retention = json.loads(cli("show", "retention", "--format", "json"))
    policies = {row["database_name"]: row["retention_period"] for row in retention}
    require(policies.get(DATABASE) == "7.0000d", "La retencion del detalle no es siete dias.")
    require(policies.get(HISTORY) == "90.0000d", "La retencion del resumen no es noventa dias.")
    load = json.loads((LOCAL / "resultado_muestra.json").read_text())
    require(load["manifest"]["sha256"] == manifest["sha256"], "El reporte de carga es de otra muestra.")
    report = {"fecha_utc": datetime.now(timezone.utc).isoformat(), "resultado": "PASS",
              "alcance": "laboratorio de doce puntos; Hito 8 pendiente de completar",
              "version": cli("--version", authenticated=False).strip(),
              "image_digest": json.loads(command("docker", "image", "inspect", "influxdb:3-core",
                                                 "--format", "{{json .RepoDigests}}")),
              "entorno": {"sistema": platform.platform(), "python": platform.python_version(),
                          "docker": json.loads(command("docker", "info", "--format",
                                                      '{"cpu":{{.NCPU}},"memoria_bytes":{{.MemTotal}},"version":"{{.ServerVersion}}","arquitectura":"{{.Architecture}}"}'))},
              "muestra": manifest, "carga_observada": load, "esquema_observado": schema,
              "retenciones_observadas": retention, "consultas": results,
              "ventana_sin_datos": [],
              "limitaciones": ["No mide capacidad de carga masiva ni SLA.",
                               "Este reporte valida el detalle; los resumenes y casos tienen reportes separados.",
                               "No mide el borrado fisico de puntos vencidos."]}
    save_json(LOCAL / "validacion.json", report)
    if args.evidencia:
        save_json(MODULE / "docs/evidencia/laboratorio.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
