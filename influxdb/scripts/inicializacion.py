"""Crea autorizacion local y bases de laboratorio; no borra datos."""

import json
import os
import time
from urllib.error import URLError
from urllib.request import urlopen

from comun import DATABASE, HISTORY, HOST, LOCAL, TOKEN_FILE, cli


def main():
    print(cli("--version", authenticated=False).strip())
    for attempt in range(30):
        try:
            with urlopen(HOST + "/health", timeout=2) as response:
                if response.status == 200:
                    break
        except URLError:
            pass
        time.sleep(1)
    else:
        raise RuntimeError("El servidor no esta listo. Consultar docker compose ps y logs.")
    LOCAL.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not TOKEN_FILE.exists():
        # Reservar el archivo antes de solicitar el token. Nunca sobrescribirlo.
        fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            result = json.loads(cli("create", "token", "--admin", "--format", "json",
                                    authenticated=False))
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                fd = None
                handle.write(result["token"] + "\n")
        finally:
            if fd is not None:
                os.close(fd)
    if not TOKEN_FILE.read_text().strip():
        raise RuntimeError("El archivo de token esta vacio. Revisar el bootstrap local antes de continuar.")
    databases = cli("show", "databases", "--format", "json")
    print("Bases existentes:", databases.strip())
    names = {value for row in json.loads(databases) for value in row.values()
             if isinstance(value, str)}
    for name, retention in [(DATABASE, "7d"), (HISTORY, "90d")]:
        if name not in names:
            print(cli("create", "database", "--retention-period", retention, name).strip())
    print("Autorizacion guardada localmente. No copiar el archivo a GitHub o Notion.")


if __name__ == "__main__":
    main()
