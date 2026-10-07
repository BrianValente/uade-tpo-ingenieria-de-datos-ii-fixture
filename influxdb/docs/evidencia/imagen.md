# Diferencia entre la imagen requerida y la observada

Fecha de observación: 7 de octubre de 2026. Contexto Docker: `desktop-linux`. Proyecto Compose: `fixture2030`.

La imagen se descargó mediante `docker compose up -d influxdb`, con `influxdb:latest` como imagen del servicio.

```text
Imagen: influxdb:latest
Digest: influxdb@sha256:cdd3dbdea45c2f43513abd06ee9644b6e05d2354a2b93ca829c9f07d716eaaac
Entrypoint: ["/entrypoint.sh"]
Comando predeterminado: ["influxd"]
```

El comando de Core del material de clase falló:

```text
/entrypoint.sh: line 501: exec: influxdb3: not found
```

Se detuvo solamente el servicio InfluxDB. Después se comprobó la versión en un contenedor temporal sin montar datos:

```bash
docker compose stop influxdb
docker run --rm --entrypoint influxd influxdb:latest version
```

Resultado:

```text
InfluxDB v2.9.1 (git: d4fa1941fd) build_date: 2026-05-11T20:48:40Z
```

Brian autorizó usar la imagen oficial `influxdb:3-core` como excepción documentada para estudiar el contenido de la Clase 9. No hay aprobación del docente registrada.

```text
Imagen: influxdb:3-core
Digest: influxdb@sha256:624d69bca6bf6fb174aca5a974e1d96e5c5486994e6ae35bc9b4fe02b9520076
Version: influxdb3 InfluxDB 3 Core, 3.12.0, revision 3ba97c65f1ee4e1f127a8266517d4d2083b7ea39
```

## Consulta al docente

El enunciado exige `influxdb:latest` y la Clase 9 utiliza `influxdb3` y SQL de Core. La imagen descargada trae 2.9.1 y no puede ejecutar ese comando. ¿Podemos usar `influxdb:3-core` y registrar su versión y digest para este hito?

Hasta resolver la consulta, el laboratorio tiene una excepción al requisito de imagen y no se presenta como entrega final conforme.
