import neo4j from 'neo4j-driver'
import { expect, it } from 'vitest'

import { readDataEnvironment } from '../../src/config/data-environment.js'

it('Neo4j interrumpe una consulta de lectura demorada por timeout de transacción', async () => {
  const config = readDataEnvironment()
  const host = config.NEO4J_HOST.includes(':')
    ? `[${config.NEO4J_HOST}]`
    : config.NEO4J_HOST
  const driver = neo4j.driver(
    `neo4j://${host}:${config.NEO4J_BOLT_PORT}`,
    neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
    {
      connectionTimeout: config.DEPENDENCY_TIMEOUT_MS,
      connectionAcquisitionTimeout: config.DEPENDENCY_TIMEOUT_MS,
      maxTransactionRetryTime: 0,
    },
  )
  try {
    // APOC ya forma parte del servicio del Hito 4. No modifica nodos ni relaciones.
    await expect(
      driver.executeQuery(
        'CALL apoc.util.sleep($millis) RETURN 1 AS done',
        { millis: neo4j.int(5000) },
        {
          routing: 'READ',
          transactionConfig: { timeout: 100 },
        },
      ),
    ).rejects.toMatchObject({
      code: expect.stringMatching(
        /TransactionTimedOut|TransactionTerminated|Terminated/,
      ),
    })
  } finally {
    await driver.close()
  }
})
