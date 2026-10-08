"""Ejecuta las tres consultas SQL del laboratorio con la ventana del manifiesto."""

import json
from datetime import datetime, timezone

from comun import LOCAL, MODULE, query, save_json


def run_queries():
    manifest = json.loads((MODULE / "data/generated/manifest.json").read_text())
    params = {"partido": manifest["partido_id"],
              "inicio": datetime.fromtimestamp(manifest["inicio_s"], timezone.utc).isoformat(),
              "fin": datetime.fromtimestamp(manifest["fin_exclusivo_s"], timezone.utc).isoformat()}
    results = {}
    for name in ("ventana", "comparacion", "agregacion_minuto"):
        sql = (MODULE / "queries" / (name + ".sql")).read_text()
        values = dict(params)
        if name == "ventana":
            values["equipo"] = manifest["equipo_ids"]["ARG"]
        results[name] = {"sql": sql, "parametros": values, "filas": query(sql, values)}
    save_json(LOCAL / "consultas.json", results)
    return manifest, results


if __name__ == "__main__":
    _, results = run_queries()
    print(json.dumps(results, ensure_ascii=False, indent=2))
