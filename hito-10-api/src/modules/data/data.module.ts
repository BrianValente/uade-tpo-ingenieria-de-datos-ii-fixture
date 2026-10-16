import {
  readDataEnvironment,
  type DataEnvironment,
} from '../../config/data-environment.js'
import { DataService } from './application/data.service.js'
import { CassandraCommentRepository } from './infrastructure/cassandra-comment.repository.js'
import { InfluxStatisticsRepository } from './infrastructure/influx-statistics.repository.js'
import { IrisObjectRepository } from './infrastructure/iris-object.repository.js'
import { MongoDocumentRepository } from './infrastructure/mongo-document.repository.js'
import { Neo4jGraphRepository } from './infrastructure/neo4j-graph.repository.js'

export type DataModule = { service: DataService; close(): Promise<void> }

export function createDataModule(
  config: DataEnvironment = readDataEnvironment(),
): DataModule {
  const documents = new MongoDocumentRepository(config)
  const graph = new Neo4jGraphRepository(config)
  const comments = new CassandraCommentRepository(config)
  return {
    service: new DataService(
      documents,
      graph,
      comments,
      new InfluxStatisticsRepository(config),
      new IrisObjectRepository(config),
    ),
    async close() {
      await Promise.all([documents.close(), graph.close(), comments.close()])
    },
  }
}
