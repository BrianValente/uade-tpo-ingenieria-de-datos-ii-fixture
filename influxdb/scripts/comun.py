"""Acceso local al laboratorio. No imprime ni versiona el token."""

import json
import subprocess
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "influxdb"
LOCAL = MODULE / ".local"
TOKEN_FILE = LOCAL / "admin-token"
HOST = "http://127.0.0.1:8181"
DATABASE = "fixture2030_h8_lab_detalle"
HISTORY = "fixture2030_h8_lab_resumen"
TEST_DATABASE = "fixture2030_h8_prueba_detalle"
TEST_HISTORY = "fixture2030_h8_prueba_resumen"


class HTTPRequestError(RuntimeError):
    def __init__(self, status, path):
        self.status = status
        super().__init__(f"HTTP {status} en {path}; el lote no se da por valido.")


def token():
    return TOKEN_FILE.read_text(encoding="utf-8").strip()


def cli(*args, authenticated=True):
    command = ["docker", "compose", "exec", "-T", "influxdb"]
    secret = None
    if authenticated:
        # El token viaja por stdin; no queda en los argumentos del proceso.
        command += ["sh", "-c",
                    'IFS= read -r INFLUXDB3_AUTH_TOKEN; '
                    'export INFLUXDB3_AUTH_TOKEN; exec influxdb3 "$@"', "sh"]
        secret = token() + "\n"
    else:
        command += ["influxdb3"]
    result = subprocess.run(command + list(args), cwd=ROOT, input=secret,
                            text=True, capture_output=True, timeout=60)
    if result.returncode:
        detail = result.stderr.strip()
        if secret:
            detail = detail.replace(secret.strip(), "[token oculto]")
        raise RuntimeError("El CLI fallo: " + detail[:1000])
    return result.stdout


def request(path, payload, query_string="", plain=False):
    body = payload.encode() if plain else json.dumps(payload).encode()
    req = Request(HOST + path + query_string, data=body, method="POST",
                  headers={"Authorization": "Bearer " + token(),
                           "Content-Type": "text/plain" if plain else "application/json"})
    try:
        with urlopen(req, timeout=60) as response:
            content = response.read().decode()
            return json.loads(content) if content else None
    except HTTPError as error:
        # No reproducir respuestas que puedan incluir datos de autorizacion.
        raise HTTPRequestError(error.code, path) from None


def query(sql, params=None, database=DATABASE):
    rows = request("/api/v3/query_sql", {
        "db": database, "q": sql, "format": "json", "params": params or {}})
    if not isinstance(rows, list):
        raise RuntimeError("La consulta no devolvio una lista de filas.")
    return rows


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
