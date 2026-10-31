# Resultados Sin Secretos — Hito 13 (RNF6)

Este directorio almacena salidas reales y sanitizadas de las consultas PromQL ejecutadas contra el servidor **Prometheus (`http://127.0.0.1:9090/api/v1/query`)** durante la verificación controlada del **Hito 13**.

## Archivos generados automáticamente

- [`consultas_promql_observadas.json`](consultas_promql_observadas.json): respuesta estructurada de las 8 consultas PromQL del catálogo (`Q1` a `Q8`), con metadatos de commit Git (`gitCommit`, `gitBranch`, `gitTreeState`), cantidad de series devueltas y vectores observados.
- [`consultas_promql_observadas.md`](consultas_promql_observadas.md): tabla resumen y desglose técnico de cada expresión PromQL, unidad, ventana temporal y muestras reales.

## Garantía de sanitización (RNF6)

Ninguno de los artefactos de este directorio incluye contraseñas, tokens de sesión (`Bearer`), cadenas de conexión con credenciales ni variables privadas de `.env`. Las etiquetas exportadas a Prometheus contienen únicamente identificadores funcionales (`job`, `instance`, `component`, `model`, `role`, `engine`, `operation`, `route`, `method`, `status_code`, `status_class`).
