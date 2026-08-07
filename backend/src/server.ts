import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import type { ApiError, HealthResponse } from '@iot-dashboard/api-contract'
import { authenticate } from './auth.js'
import { closeDatabase, initializeDatabase, isDatabaseConnected } from './database.js'
import { isMqttConnected, startMqtt, stopMqtt } from './mqtt.js'
import { apiRouter } from './routes.js'

const app = express()
const port = 9000

app.disable('x-powered-by')
app.use(cors())
app.use(express.json())

app.get('/health', async (_req, res) => {
  const databaseConnected = await isDatabaseConnected()
  const mqttConnected = isMqttConnected()
  const ready = databaseConnected && mqttConnected
  const health: HealthResponse = {
    status: ready ? 'ok' : 'degraded',
    dependencies: {
      database: databaseConnected ? 'connected' : 'disconnected',
      mqtt: mqttConnected ? 'connected' : 'disconnected',
    },
  }

  res.status(ready ? 200 : 503).json(health)
})

app.use('/api/v1', authenticate, apiRouter)

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error)
  const response: ApiError = {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.',
    requestId: randomUUID(),
  }
  res.status(500).json(response)
}

app.use(errorHandler)

await initializeDatabase()
startMqtt()

const server = app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`)
})

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down`)
  server.close()
  await Promise.all([stopMqtt(), closeDatabase()])
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
