# Comprobación de saltos de línea y configuración inicial

Se atendió la revisión de la PR sobre Windows y clones nuevos. Las comprobaciones
se ejecutaron el 16 de octubre de 2026 con Node.js 24.22.0 y pnpm 10.34.7, en
macOS. **No se ejecutó una sesión nativa de Windows.**

## Checkout con autocrlf

Se exportó el índice de Git a una carpeta temporal independiente con:

```bash
git -c core.autocrlf=true checkout-index --all --prefix='<carpeta-temporal>/'
```

La exportación incluyó `.gitattributes`, las fuentes y el contrato actualizado,
sin copiar los `.env` locales. `git ls-files --eol` sobre esa copia informó
`i/lf`, `w/lf` y `attr/text=auto eol=lf` para los archivos de la API y su workflow.
En la copia se ejecutaron:

```bash
pnpm install --offline --frozen-lockfile
pnpm format
pnpm openapi:check
```

La instalación usó la caché local, sin descargas. Formato y contrato terminaron
correctamente. Las reglas de LF están limitadas a `hito-10-api/**` y al workflow
de la API; no fuerzan una conversión de los datasets de otros hitos.

## CRLF y contenido real del contrato

Sobre la copia temporal se preparó mediante una prueba Node un YAML con **todos**
sus saltos convertidos a CRLF. `export-openapi.ts --check` terminó correctamente.
Después se cambió también `openapi: 3.0.3` a `openapi: 3.0.2`: el comando terminó
con código uno y el mensaje de contrato desactualizado. Se restauró la copia.

Esto comprueba que se tolera LF/CRLF sin aceptar un contenido distinto. No se
normalizan espacios, rutas, versiones ni esquemas para ocultar diferencias.

## Clon sin configuración local

La copia temporal no tenía `.env` raíz ni `.env` de la API. Se ejecutó el setup y
se observó código uno, un mensaje que indica preparar primero el `.env` de Compose,
y ausencia del `.env` de la API después del intento.

Después se creó un `.env` raíz **sintético de prueba**, sin conectar a ninguna
base. El setup copió sus valores, generó dos contraseñas distintas de seed de
43 caracteres y creó el archivo local con permisos `0600` en macOS. La segunda
ejecución conservó exactamente ese archivo. No se copiaron secretos reales del
entorno de trabajo a esta prueba.

La comprobación temporal produjo tres resultados aprobados: CRLF y cambio real
de contrato; rechazo explicativo sin raíz; creación y conservación con raíz
preparada. Estas comprobaciones son adicionales a la suite unitaria versionada.

## Procedimiento para otro equipo

En un clon nuevo se prepara primero el `.env` raíz según el README general.
No se usa `.env.example` como si contuviera credenciales válidas de una instalación
existente. Después se ejecuta `pnpm env:local` desde `hito-10-api/`.

Un clon anterior que mantenga CRLF puede normalizar sus archivos de API con
`pnpm format:write` y volver a ejecutar `pnpm format` y `pnpm openapi:check`.
La comprobación de Windows nativo y su SDK IRIS queda a cargo de una máquina de
ese sistema; no se presenta la simulación de checkout como esa ejecución.
