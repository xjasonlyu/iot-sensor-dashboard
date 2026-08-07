import { Router } from 'express'
import type { Response } from 'express'
import { randomUUID } from 'node:crypto'
import type { components } from '@iot-dashboard/api-contract'
import { developmentUser } from './auth.js'
import {
  activity,
  createDashboardSummary,
  networks,
  readings,
  sensorEvents,
  sensors,
} from './stub-data.js'
import { streamRealtimeEvents } from './realtime.js'

type ActivityPage = components['schemas']['ActivityPage']
type ApiError = components['schemas']['ApiError']
type ReadingPage = components['schemas']['ReadingPage']
type SensorEventPage = components['schemas']['SensorEventPage']
type SensorList = components['schemas']['SensorList']
type TimeRange = components['schemas']['TimeRange']

const timeRanges = new Set<TimeRange>(['1h', '6h', '24h', '7d', '30d'])

function sendNotFound(res: Response, resource: string): void {
  const error: ApiError = {
    code: 'NOT_FOUND',
    message: `${resource} was not found.`,
    requestId: randomUUID(),
  }
  res.status(404).json(error)
}

export const apiRouter = Router()

apiRouter.get('/me', (_req, res) => {
  res.json(developmentUser)
})

apiRouter.get('/dashboard/summary', (req, res) => {
  const requestedRange = String(req.query.range ?? '24h')
  const range: TimeRange = timeRanges.has(requestedRange as TimeRange)
    ? (requestedRange as TimeRange)
    : '24h'

  res.json(createDashboardSummary(range))
})

apiRouter.get('/networks', (_req, res) => {
  res.json({ data: networks })
})

apiRouter.get('/networks/:networkId/activity', (req, res: Response<ActivityPage | ApiError>) => {
  const networkId = Number(req.params.networkId)
  if (!networks.some((network) => network.id === networkId)) {
    sendNotFound(res, 'Network')
    return
  }

  res.json({
    data: activity.filter((point) => point.networkId === networkId),
    nextCursor: null,
  })
})

apiRouter.get('/sensors', (req, res: Response<SensorList>) => {
  const networkId = Number(req.query.networkId)
  res.json({
    data: sensors.filter((sensor) => sensor.networkId === networkId),
  })
})

apiRouter.get('/sensors/:sensorId/readings', (req, res: Response<ReadingPage | ApiError>) => {
  const sensor = sensors.find((candidate) => candidate.id === req.params.sensorId)
  if (!sensor) {
    sendNotFound(res, 'Sensor')
    return
  }

  const metric = String(req.query.metric)
  res.json({
    data: readings.filter(
      (reading) => reading.sensorId === sensor.id && reading.metric === metric,
    ),
    nextCursor: null,
  })
})

apiRouter.get('/sensors/:sensorId/events', (req, res: Response<SensorEventPage | ApiError>) => {
  const sensor = sensors.find((candidate) => candidate.id === req.params.sensorId)
  if (!sensor) {
    sendNotFound(res, 'Sensor')
    return
  }

  res.json({
    data: sensorEvents.filter((event) => event.sensorId === sensor.id),
    nextCursor: null,
  })
})

apiRouter.get('/realtime/events', streamRealtimeEvents)
