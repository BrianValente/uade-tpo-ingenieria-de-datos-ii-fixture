import { startMonitoredServer } from '../../../hito-13-monitoreo/scripts/servidor_monitoreo.js'

const server = await startMonitoredServer({
  host: '127.0.0.1',
  port: Number(process.env.H13_TEST_PORT),
})
const health = await fetch(`${server.baseUrl}/health`)
if (health.status !== 200) throw new Error('El servidor no inició')
if (process.argv.includes('degraded')) {
  const components = await server.probeComponents()
  if (components.find((component) => component.component === 'redis')?.up !== 0)
    throw new Error('Se esperaba Redis no disponible')
}
const probes = Array.from({ length: 12 }, () => server.probeComponents())
server.setSimulatedOutage('neo4j', false)
await Promise.all([server.close(), server.close(), ...probes])
await server.probeComponents()
console.log('H13_CLOSED_NATURALLY')
