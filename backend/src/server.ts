import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import type { components } from '@iot-dashboard/api-contract'
import { authenticate } from './auth.js'
import { apiRouter } from './routes.js'

type ApiError = components['schemas']['ApiError']
type HealthResponse = components['schemas']['HealthResponse']

const app = express()
const port = Number(process.env.PORT ?? 5000)

app.disable('x-powered-by')
app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  const health: HealthResponse = {
    status: 'degraded',
    dependencies: {
      database: 'disconnected',
      mqtt: 'disconnected',
    },
  }

  // The route shape is ready; switch to 503 once Docker health checks depend on it.
  res.status(200).json(health)
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

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`)
})
