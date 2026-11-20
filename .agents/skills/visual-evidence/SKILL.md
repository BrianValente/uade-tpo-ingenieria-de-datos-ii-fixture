---
name: visual-evidence
description: Verify UI changes with source-bound real captures.
version: 0.1.0
author: BrianValente, Hermes Agent
license: UNLICENSED
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [screenshots, verification]
    related_skills: []
---

# Evidencia visual

## Cuándo usar

Al cambiar la presentación HTML, dashboards u otra interfaz visible.

## Procedimiento

1. Capturar la revisión anterior y la candidata en un navegador real, con el mismo escenario y viewport, tanto escritorio como móvil. Registrar la revisión original y el SHA-256 del HTML/asset realmente servido mediante `terminal`; no reutilizar un SHA mostrado por una aplicación modificada.
2. Inspeccionar las imágenes con `vision_analyze` antes de publicarlas: no deben exponer sesiones, contraseñas, tokens ni configuración privada. Registrar recortes y límites visibles sin afirmar responsividad a partir de una captura parcial.
3. Para la evidencia académica H13, guardar las capturas y su recibo en `hito-13-monitoreo/evidencia/dashboards/`; identificar las imágenes anteriores como comparación visual, no como mediciones actuales. Conservar los resultados experimentales originales y regenerar las vistas con sus productores.
4. Tras commitear, comparar los hashes del recibo con los blobs Git exactos. En el PR enlazar archivos inmutables sin credenciales y verificar sus bytes mediante la GitHub App autorizada.

## Límites

Una imagen no prueba conectividad, recuperación de un motor, rendimiento ni aprobación independiente. Esas afirmaciones requieren sus propias ejecuciones reales y límites de entorno.

## Verificación

El PR contiene capturas reales comparables y accesibles, el recibo corresponde a los assets publicados y las afirmaciones distinguen observación visual de pruebas funcionales.
