"""Carga y mide la prueba de 34.560 puntos; verifica su distribucion y agregados."""

import argparse
import hashlib
import json
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.error import URLError

from comun import HTTPRequestError, LOCAL, MODULE, TEST_DATABASE, cli, query, request, save_json
from validacion import command, require


def write_batch(lines, retries=2):
    started = time.perf_counter()
    for attempt in range(retries + 1):
        try:
            request("/api/v3/write_lp", "\n".join(lines) + "\n",
                    f"?db={TEST_DATABASE}&precision=second&accept_partial=false", plain=True)
            return {"puntos": len(lines), "reintentos": attempt,
                    "duracion_s": time.perf_counter() - started}
        except HTTPRequestError as error:
            if error.status not in (429, 500, 502, 503, 504) or attempt == retries:
                raise
        except (URLError, TimeoutError, ConnectionError):
            if attempt == retries:
                raise
        time.sleep(2 ** attempt)
    raise RuntimeError("No se pudo completar el lote.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lote", type=int, default=1000)
    parser.add_argument("--concurrencia", type=int, choices=(1, 2), default=1)
    parser.add_argument("--reintentos", type=int, choices=(0, 1, 2), default=2)
    parser.add_argument("--evidencia", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.lote <= 5000:
        parser.error("El lote debe contener entre 1 y 5000 puntos.")
    folder = MODULE / "data/generated/prueba"
    manifest = json.loads((folder / "manifest.json").read_text())
    text = (folder / "puntos.lp").read_text()
    require(hashlib.sha256(text.encode()).hexdigest() == manifest["sha256"], "Archivo alterado.")
    lines = text.splitlines()
    require(len(lines) == manifest["puntos"] == 34560, "Esta prueba solo acepta 34.560 puntos.")
    batches = [lines[index:index + args.lote] for index in range(0, len(lines), args.lote)]
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=args.concurrencia) as pool:
        writes = list(pool.map(lambda batch: write_batch(batch, args.reintentos), batches))
    elapsed = time.perf_counter() - started
    params = {"inicio": datetime.fromtimestamp(manifest["inicio_s"], timezone.utc).isoformat(),
              "fin": datetime.fromtimestamp(manifest["fin_exclusivo_s"], timezone.utc).isoformat()}
    sql = """SELECT partido_id, equipo_id, COUNT(*) AS puntos,
                    AVG(posesion_pct) AS posesion_promedio,
                    MAX(tiros_acumulados) AS tiros_final, SUM(pases_intervalo) AS pases
             FROM estadisticas_equipo
             WHERE time >= CAST($inicio AS TIMESTAMP) AND time < CAST($fin AS TIMESTAMP)
             GROUP BY partido_id, equipo_id ORDER BY partido_id, equipo_id"""
    durations = []
    rows = []
    for _ in range(5):
        started = time.perf_counter()
        rows = query(sql, params, TEST_DATABASE)
        durations.append(time.perf_counter() - started)
    require(len(rows) == 64 and sum(row["puntos"] for row in rows) == 34560,
            "Cantidad o distribucion incorrecta.")
    actual = {(row["partido_id"], row["equipo_id"]): row for row in rows}
    for expected in manifest["esperado_por_serie"]:
        row = actual[(expected["partido_id"], expected["equipo_id"])]
        for key in ("puntos", "posesion_promedio", "tiros_final", "pases"):
            require(abs(row[key] - expected[key]) < 1e-8, f"Resultado incorrecto: {key}.")
    stamp = datetime.now(timezone.utc)
    report = {"fecha_utc": stamp.isoformat(), "resultado": "PASS",
              "base": TEST_DATABASE, "version": cli("--version", authenticated=False).strip(),
              "docker": json.loads(command("docker", "info", "--format",
                  '{"cpu":{{.NCPU}},"memoria_bytes":{{.MemTotal}},"version":"{{.ServerVersion}}","arquitectura":"{{.Architecture}}"}')),
              "manifest_sha256": manifest["sha256"], "inicio_s": manifest["inicio_s"],
              "fin_exclusivo_s": manifest["fin_exclusivo_s"],
              "puntos_enviados": 34560, "puntos_verificados": 34560, "series": 64,
              "lote": args.lote, "concurrencia": args.concurrencia, "lotes": len(writes),
              "reintentos_observados": sum(row["reintentos"] for row in writes),
              "reintentos_maximos_por_lote": args.reintentos, "carga_total_s": elapsed,
              "puntos_enviados_por_segundo": 34560 / elapsed,
              "consulta_http_s": durations, "consulta_mediana_s": statistics.median(durations),
              "sql": sql, "parametros": params, "distribucion": rows,
              "metodo": "perf_counter; carga HTTP con lotes en memoria y respuestas completas; cinco consultas consecutivas",
              "limites": ["Prueba sintetica local, no 10M+ ni SLA.",
                          "El archivo pequeno se carga en memoria; no es un cargador masivo de 10M.",
                          "Una recarga usa las mismas identidades y puede tener cache caliente.",
                          "No prueba correcciones conflictivas sobre puntos ya escritos."]}
    save_json(LOCAL / "carga_prueba.json", report)
    if args.evidencia:
        save_json(MODULE / "docs/evidencia" / f"carga-{stamp.strftime('%Y%m%dT%H%M%SZ')}.json", report)
    print(json.dumps({key: value for key, value in report.items() if key != "distribucion"},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
