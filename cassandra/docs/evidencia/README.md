# Evidencia técnica

Esta carpeta contiene las salidas reales de la ejecución local del 12 de septiembre de 2026 UTC.

## Archivos

- `funcional-20260912T001310Z.txt`: estado `UN`, CRUD, consultas, versión, esquema y conteos de la muestra.
- `carga-20260912T001314Z.txt`: ambiente, versión, volumen, salida completa de ambos `COPY`, filas omitidas, duración y tasas.
- `focal-20260925T194707Z.txt`: carga de un millón de comentarios concentrados en un partido y 100 segundos.
- `metadata-focal-20260925T194707Z.json`: distribución reproducible de la prueba focalizada.
- `carga-20260925T194812Z.txt`: repetición de la carga general con metadata automática.
- `metadata-carga-20260925T194812Z.json`: parámetros y distribución de la carga general repetida.

La prueba importó 1.000.016 filas en cada tabla y omitió 0. La documentación de rendimiento interpreta estos resultados y declara las limitaciones del nodo único.
