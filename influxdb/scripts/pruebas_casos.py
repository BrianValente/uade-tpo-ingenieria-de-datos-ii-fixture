"""Prueba huecos y datos tardios en ventanas aisladas; retencion real y errores simulados."""

import json
from datetime import datetime, timezone
from unittest.mock import patch

from carga_lotes import write_batch
from comun import DATABASE, HISTORY, HTTPRequestError, MODULE, cli, query, request, save_json
from generacion_muestra import TEAM_IDS
from resumenes import build_summaries, store_summaries, utc_seconds
from validacion import require


def params(start, end):
    return {"inicio": datetime.fromtimestamp(start, timezone.utc).isoformat(),
            "fin": datetime.fromtimestamp(end, timezone.utc).isoformat()}


def write(database, lines):
    request("/api/v3/write_lp", "\n".join(lines) + "\n",
            f"?db={database}&precision=second&accept_partial=false", plain=True)


def main():
    stamp = datetime.now(timezone.utc)
    suffix = stamp.strftime("%Y%m%dT%H%M%S")
    raw, history = DATABASE, HISTORY
    policies = json.loads(cli("show", "retention", "--format", "json"))
    require(any(row["database_name"] == raw and row["retention_period"] == "7.0000d"
                for row in policies), "El detalle debe conservar siete dias.")
    first = query("SELECT MIN(time) AS first FROM estadisticas_equipo", database=raw)[0]["first"]
    require(first is not None, "Cargar primero la muestra didactica.")
    # Cada ejecucion usa un minuto anterior al primer punto: no reemplaza la muestra.
    start = int(utc_seconds(first) // 60) * 60 - 60
    require(start > int(stamp.timestamp()) - 6 * 86400, "Renovar la muestra antes de esta prueba.")
    lines = [f"estadisticas_equipo,partido_id=F2030-001,equipo_id={TEAM_IDS['ARG']} "
             f"posesion_pct={50 + index * 2:.1f},tiros_acumulados={shots}i,"
             f"pases_intervalo={passes}i {start + index * 10}"
             for index, (shots, passes) in enumerate(zip([0, 0, 1, 1, 1, 2], [2, 3, 4, 2, 3, 4]))]
    write(raw, lines[:5])
    before = store_summaries(raw, history, start, start + 60)
    require(before["escritos"] == 0 and len(before["incompletos"]) == 1,
            "No debe guardarse un minuto incompleto.")
    write(raw, lines[5:])
    after = store_summaries(raw, history, start, start + 60)
    repeated = store_summaries(raw, history, start, start + 60)
    require(after["escritos"] == 1 and not after["incompletos"], "No se guardo el minuto completo.")
    require(repeated["escritos"] == 0 and repeated["ya_existentes"] == 1,
            "La repeticion debe reutilizar el resumen existente.")
    stored = query("SELECT posesion_promedio, tiros_final, pases, muestras FROM estadisticas_minuto "
                   "WHERE time >= CAST($inicio AS TIMESTAMP) AND time < CAST($fin AS TIMESTAMP)",
                   params(start, start + 60), history)
    require(stored == [{"posesion_promedio": 55.0, "tiros_final": 2, "pases": 18, "muestras": 6}],
            "El dato tardio no produjo los agregados esperados.")
    # Cambiar el contenido ya resumido se prueba sin sobrescribir datos reales.
    fetched = query("SELECT time, partido_id, equipo_id, posesion_pct, tiros_acumulados, pases_intervalo "
                    "FROM estadisticas_equipo WHERE time >= CAST($inicio AS TIMESTAMP) "
                    "AND time < CAST($fin AS TIMESTAMP) ORDER BY time", params(start, start + 60), raw)
    modified = [dict(row) for row in fetched]
    modified[0]["posesion_pct"] = 49.0
    with patch("resumenes.query", side_effect=[modified, [{"table_name": "estadisticas_minuto"}],
               [{"time": datetime.fromtimestamp(start, timezone.utc).isoformat(),
                 "partido_id": "F2030-001", "equipo_id": TEAM_IDS["ARG"],
                 "source_hash": build_summaries(fetched)[0][0]["source_hash"]}]]):
        try:
            store_summaries(raw, history, start, start + 60)
        except RuntimeError as error:
            require("otra fuente" in str(error), "Fallo distinto al esperado.")
        else:
            raise RuntimeError("Se acepto una correccion conflictiva.")
    with patch("carga_lotes.request", side_effect=[HTTPRequestError(503, "simulado"), None]) as mocked, \
            patch("carga_lotes.time.sleep"):
        retry_result = write_batch([lines[0]], retries=2)
        require(mocked.call_count == 2 and retry_result["reintentos"] == 1,
                "No se reintento el error transitorio simulado.")
    with patch("carga_lotes.request", side_effect=HTTPRequestError(401, "simulado")) as mocked:
        try:
            write_batch([lines[0]], retries=2)
        except HTTPRequestError:
            require(mocked.call_count == 1, "No se debe reintentar un error de autorizacion.")
        else:
            raise RuntimeError("Se oculto el error de autorizacion.")
    # Consultar por separado un punto de ocho dias y otro actual evita un rango
    # historico extenso. Es un control del filtro de retencion, no una espera de siete dias.
    now = int(datetime.now(timezone.utc).timestamp())
    old = now - 8 * 86400
    write(raw, [f"prueba_retencion,partido_id=F2030-001 valor=1i,prueba_id=\"{suffix}\" {old}",
                f"prueba_retencion,partido_id=F2030-001 valor=2i,prueba_id=\"{suffix}\" {now}"])
    expiry_sql = "SELECT valor FROM prueba_retencion WHERE time >= CAST($inicio AS TIMESTAMP) "
    expiry_sql += "AND time < CAST($fin AS TIMESTAMP) AND prueba_id = $prueba ORDER BY time"
    old_params, recent_params = params(old - 1, old + 1), params(now - 1, now + 1)
    old_params["prueba"] = recent_params["prueba"] = suffix
    expired_rows = query(expiry_sql, old_params, raw)
    recent_rows = query(expiry_sql, recent_params, raw)
    require(expired_rows == [] and recent_rows == [{"valor": 2}],
            "El filtro de retencion no devolvio los resultados esperados.")
    report = {"fecha_utc": datetime.now(timezone.utc).isoformat(), "resultado": "PASS",
              "bases": [raw, history], "minuto_aislado_s": start, "incompleto": before,
              "dato_tardio": after, "repeticion": repeated, "resumen_observado": stored,
              "filtro_retencion_real": {"periodo_dias": 7, "timestamp_antiguo_s": old,
                                        "timestamp_reciente_s": now, "consulta_antigua": expired_rows,
                                        "consulta_reciente": recent_rows},
              "simulaciones": {"error_503": "un reintento", "error_401": "sin reintentos",
                               "correccion_conflictiva": "rechazada antes de escribir"},
              "limites": ["Prueba puntos ya fuera de retencion; no espera siete dias ni mide liberacion fisica de disco.",
                          "Los errores HTTP y la correccion son simulaciones con mocks.",
                          "Las bases de prueba quedan conservadas; no se ejecuta limpieza destructiva."]}
    save_json(MODULE / "docs/evidencia/casos.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
