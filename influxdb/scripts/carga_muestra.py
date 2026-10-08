"""Carga un lote didactico y comprueba conteos y valores esperados."""

import hashlib
import json
import time
from datetime import datetime, timezone

from comun import DATABASE, LOCAL, MODULE, query, request, save_json


def main():
    folder = MODULE / "data" / "generated"
    manifest = json.loads((folder / "manifest.json").read_text())
    text = (folder / "muestra.lp").read_text()
    if hashlib.sha256(text.encode()).hexdigest() != manifest["sha256"]:
        raise RuntimeError("La muestra cambio respecto del manifiesto.")
    if len(text.splitlines()) != manifest["puntos"] or manifest["puntos"] != 12:
        raise RuntimeError("Este laboratorio acepta solo la muestra de doce puntos.")
    started = time.perf_counter()
    request("/api/v3/write_lp", text,
            f"?db={DATABASE}&precision=second&accept_partial=false", plain=True)
    write_seconds = time.perf_counter() - started
    params = {"partido": manifest["partido_id"],
              "inicio": datetime.fromtimestamp(manifest["inicio_s"], timezone.utc).isoformat(),
              "fin": datetime.fromtimestamp(manifest["fin_exclusivo_s"], timezone.utc).isoformat()}
    sql = """SELECT equipo_id, COUNT(*) AS puntos,
                    AVG(posesion_pct) AS posesion_promedio,
                    MAX(tiros_acumulados) AS tiros_final,
                    SUM(pases_intervalo) AS pases
             FROM estadisticas_equipo
             WHERE partido_id = $partido
               AND time >= CAST($inicio AS TIMESTAMP)
               AND time < CAST($fin AS TIMESTAMP)
             GROUP BY equipo_id ORDER BY equipo_id"""
    started = time.perf_counter()
    rows = query(sql, params)
    query_seconds = time.perf_counter() - started
    if len(rows) != 2:
        raise RuntimeError("Se esperaban dos equipos en la ventana.")
    for code, team_id in manifest["equipo_ids"].items():
        row = next(row for row in rows if row["equipo_id"] == team_id)
        for key, expected in manifest["esperado"][code].items():
            if abs(row[key] - expected) > 1e-8:
                raise RuntimeError(f"Resultado incorrecto para {code}: {key}.")
    report = {"fecha_utc": datetime.now(timezone.utc).isoformat(),
              "tipo": "demostracion con aserciones; no benchmark de carga masiva",
              "base": DATABASE, "puntos_enviados": 12, "puntos_verificados": 12,
              "lotes": 1, "concurrencia": 1, "reintentos_automaticos": 0,
              "escritura_http_s": write_seconds, "consulta_http_s": query_seconds,
              "manifest": manifest, "sql": sql, "parametros": params,
              "resultados": rows}
    save_json(LOCAL / "resultado_muestra.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
