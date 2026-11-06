# Capturas reales de dashboard y presentación

## Dashboard

[grafana-real-dashboard.png](grafana-real-dashboard.png) muestra los nueve paneles del Grafana local con sus series y tres targets UP. Se capturó con Chromium sobre la instancia real, no es un diseño ilustrativo. El servidor instrumentado ejecuta el código `cd653d6`; el [resumen de consultas](resumen_dashboard_observado.md) conserva la verificación por datasource de las dieciséis expresiones. La captura posterior y la consulta guardada son observaciones en momentos distintos, no una misma muestra de latencia.

## Presentación antes/después

Estas imágenes verifican el contenido y la navegación de la diapositiva8, no son nuevas mediciones de rendimiento. Las cifras anteriores pertenecen a la versión previa y **no** deben usarse como resultados actuales; la fuente vigente son los JSON H12 y la presentación posterior.

| Viewport configurado | Antes (`5a7cc55`) | Después (contenido actual) |
| :--- | :--- | :--- |
| Escritorio1600×1000 | [Antes](presentation-before-desktop.png) | [Después](presentation-after-desktop.png) |
| Móvil430×932 | [Antes](presentation-before-mobile.png) | [Después](presentation-after-mobile.png) |

El [recibo de captura](presentation-visual-receipt.json) registra SHA256 del HTML, dimensiones configuradas y efectivas, título y contador `8 / 10`. La navegación se ejercitó con el botón real de siguiente. El diseño de defensa está orientado a escritorio; las capturas móviles son de viewport con scroll, no de página completa ni certificación de responsividad. Las dimensiones CSS efectivas difieren por el overflow/zoom del diseño, ya presente en la versión anterior.
