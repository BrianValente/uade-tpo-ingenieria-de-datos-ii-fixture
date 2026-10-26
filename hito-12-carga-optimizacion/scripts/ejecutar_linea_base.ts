import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  formatLoadReportMarkdown,
  runLoadScenario,
} from './ejecutar_carga.js'
import { HITO12_ROOT } from './entorno_y_recursos.js'
import { prepareTestData } from './preparar_datos.js'

export async function runBaselineBenchmark() {
  console.log('='.repeat(80))
  console.log('Hito 12 — Ejecución de Línea Base Reproducible (RF4, RF5, RF6)')
  console.log('='.repeat(80))

  console.log('\n[1/2] Preparando y verificando datos de prueba en MongoDB, Neo4j y Redis...')
  const prep = await prepareTestData()
  console.log(
    `Datos listos: MongoDB (${prep.mongodb.equiposCount} equipos, ${prep.mongodb.jugadoresCount} jugadores), Neo4j (${prep.neo4j.totalEventosNodes} eventos), Redis (${prep.redis.virtualSessionsSeeded} sesiones virtuales).`,
  )

  console.log('\n[2/2] Ejecutando escenario de carga en modo LÍNEA BASE (baseline)...')
  const report = await runLoadScenario('baseline')
  const markdown = formatLoadReportMarkdown(report)

  const jsonPath = resolve(
    HITO12_ROOT,
    'docs/evidencia/resultados_linea_base.json',
  )
  const mdPath = resolve(HITO12_ROOT, 'docs/evidencia/resultados_linea_base.md')
  await mkdir(dirname(jsonPath), { recursive: true })
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8')
  await writeFile(mdPath, markdown, 'utf8')

  console.log(`\nEvidencia JSON guardada en: ${jsonPath}`)
  console.log(`Evidencia Markdown guardada en: ${mdPath}\n`)
  console.log(markdown)
  return report
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  runBaselineBenchmark().catch((err: unknown) => {
    console.error(
      'Error en ejecución de línea base:',
      err instanceof Error ? err.message : String(err),
    )
    process.exit(1)
  })
}
