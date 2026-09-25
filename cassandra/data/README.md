# Datos de Cassandra

La carpeta `generated/` recibe los CSV de la carga masiva. Los archivos no se versionan porque pueden ocupar cientos de megabytes.

Para generar el volumen objetivo sin cargarlo:

```bash
python3 cassandra/scripts/generar_carga.py --cantidad 1000016
```

El generador produce dos filas físicas por comentario: una para la consulta por partido y otra para el historial por usuario. También crea `metadata.json` con la distribución solicitada.
