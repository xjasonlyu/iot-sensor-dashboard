import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { Request, RequestHandler, Response } from 'express'
import type {
  ActivityPage,
  ApiError,
  DashboardSummary,
  Interval,
  Metric,
  Reading,
  ReadingPage,
  Sensor,
  SensorCapability,
  SensorEvent,
  SensorEventPage,
  SensorList,
  SensorStatus,
  TimeRange,
  User,
} from '@iot-dashboard/api-contract'
import type { Prisma } from './generated/prisma/client.js'
import { prisma } from './prisma.js'
import { streamRealtimeEvents } from './realtime.js'

const timeRanges = new Set<TimeRange>(['1h', '6h', '24h', '7d', '30d', '1y'])
const rangeMilliseconds: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1_000,
  '6h': 6 * 60 * 60 * 1_000,
  '24h': 24 * 60 * 60 * 1_000,
  '7d': 7 * 24 * 60 * 60 * 1_000,
  '30d': 30 * 24 * 60 * 60 * 1_000,
  '1y': 365 * 24 * 60 * 60 * 1_000,
}
const intervalMilliseconds: Record<Exclude<Interval, 'raw'>, number> = {
  '1m': 60 * 1_000,
  '5m': 5 * 60 * 1_000,
  '15m': 15 * 60 * 1_000,
  '1h': 60 * 60 * 1_000,
  '1d': 24 * 60 * 60 * 1_000,
}

type ReadingRow = {
  id: string
  sensorId: string
  metric: string
  value: number
  unit: string
  recordedAt: Date
}

type ActivityRow = {
  networkId: number
  activity: number
  recordedAt: Date
}

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch(next)
  }
}

function sendNotFound(res: Response, resource: string): void {
  const error: ApiError = {
    code: 'NOT_FOUND',
    message: `${resource} was not found.`,
    requestId: randomUUID(),
  }
  res.status(404).json(error)
}

function parseLimit(value: unknown): number {
  const parsed = Number(value ?? 500)
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 1_000) : 500
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function dateFilter(req: Request): { gte?: Date; lt?: Date } | undefined {
  const from = parseDate(req.query.from)
  const to = parseDate(req.query.to)
  if (!from && !to) return undefined
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: to } : {}),
  }
}

function isMetric(value: string): value is Metric {
  return value === 'temperature' || value === 'humidity'
}

function isCapability(value: string): value is SensorCapability {
  return value === 'temperature' || value === 'humidity' || value === 'vibration'
}

function parseInterval(value: unknown): Interval {
  return value === '1m' ||
    value === '5m' ||
    value === '15m' ||
    value === '1h' ||
    value === '1d'
    ? value
    : 'raw'
}

function mapReading(row: ReadingRow): Reading {
  return {
    id: row.id,
    sensorId: row.sensorId,
    metric: isMetric(row.metric) ? row.metric : 'temperature',
    value: row.value,
    unit: row.unit,
    timestamp: row.recordedAt.toISOString(),
  }
}

function aggregateReadings(rows: ReadingRow[], interval: Exclude<Interval, 'raw'>): Reading[] {
  const duration = intervalMilliseconds[interval]
  const buckets = new Map<
    number,
    { count: number; sensorId: string; metric: Metric; sum: number; unit: string }
  >()

  for (const row of rows) {
    if (!isMetric(row.metric)) continue
    const bucketStart = Math.floor(row.recordedAt.getTime() / duration) * duration
    const bucket = buckets.get(bucketStart) ?? {
      count: 0,
      metric: row.metric,
      sensorId: row.sensorId,
      sum: 0,
      unit: row.unit,
    }
    bucket.count += 1
    bucket.sum += row.value
    buckets.set(bucketStart, bucket)
  }

  return [...buckets.entries()].map(([bucketStart, bucket]) => ({
    id: `bucket:${interval}:${bucket.sensorId}:${bucket.metric}:${bucketStart}`,
    metric: bucket.metric,
    sensorId: bucket.sensorId,
    timestamp: new Date(bucketStart).toISOString(),
    unit: bucket.unit,
    value: Math.round((bucket.sum / bucket.count) * 100) / 100,
  }))
}

function aggregateActivity(
  rows: ActivityRow[],
  interval: Exclude<Interval, 'raw'>,
): ActivityPage['data'] {
  const duration = intervalMilliseconds[interval]
  const buckets = new Map<number, { count: number; networkId: number; sum: number }>()

  for (const row of rows) {
    const bucketStart = Math.floor(row.recordedAt.getTime() / duration) * duration
    const bucket = buckets.get(bucketStart) ?? {
      count: 0,
      networkId: row.networkId,
      sum: 0,
    }
    bucket.count += 1
    bucket.sum += row.activity
    buckets.set(bucketStart, bucket)
  }

  return [...buckets.entries()].map(([bucketStart, bucket]) => ({
    activity: Math.round((bucket.sum / bucket.count) * 10_000) / 10_000,
    networkId: bucket.networkId,
    timestamp: new Date(bucketStart).toISOString(),
  }))
}

function mapEvent(row: {
  id: string
  sensorId: string
  type: string
  recordedAt: Date
}): SensorEvent {
  return {
    id: row.id,
    sensorId: row.sensorId,
    type: 'detected',
    timestamp: row.recordedAt.toISOString(),
  }
}

export const apiRouter = Router()

apiRouter.get('/me', (_req, res: Response<User>) => {
  res.json(res.locals.user as User)
})

apiRouter.get(
  '/dashboard/summary',
  asyncRoute(async (req, res: Response<DashboardSummary | ApiError>) => {
    const networkId = Number(req.query.networkId ?? 1)
    const network = await prisma.network.findUnique({ where: { id: networkId } })
    if (!network) {
      sendNotFound(res, 'Network')
      return
    }

    const requestedRange = String(req.query.range ?? '24h')
    const range: TimeRange = timeRanges.has(requestedRange as TimeRange)
      ? (requestedRange as TimeRange)
      : '24h'
    const from = new Date(Date.now() - rangeMilliseconds[range])
    const readingWhere: Prisma.SensorReadingWhereInput = {
      sensor: { networkId },
      recordedAt: { gte: from },
      metric: { in: ['temperature', 'humidity'] },
    }

    const aggregates = await prisma.sensorReading.groupBy({
      by: ['metric', 'unit'],
      where: readingWhere,
      _avg: { value: true },
      _min: { value: true },
      _max: { value: true },
    })
    const metrics = await Promise.all(
      aggregates.filter((item) => isMetric(item.metric)).map(async (item) => {
        const latest = await prisma.sensorReading.findFirst({
          where: { ...readingWhere, metric: item.metric },
          orderBy: { recordedAt: 'desc' },
        })
        return {
          metric: item.metric as Metric,
          current: latest?.value ?? 0,
          unit: item.unit,
          average: item._avg.value ?? 0,
          minimum: item._min.value ?? 0,
          maximum: item._max.value ?? 0,
          updatedAt: (latest?.recordedAt ?? new Date()).toISOString(),
        }
      }),
    )

    const eventWhere: Prisma.SensorEventWhereInput = {
      sensor: { networkId },
      type: 'detected',
      recordedAt: { gte: from },
    }
    const [eventCount, latestEvent, activityAggregate, latestActivity] =
      await Promise.all([
        prisma.sensorEvent.count({ where: eventWhere }),
        prisma.sensorEvent.findFirst({
          where: eventWhere,
          orderBy: { recordedAt: 'desc' },
        }),
        prisma.activityBucket.aggregate({
          where: { networkId, recordedAt: { gte: from } },
          _avg: { activity: true },
          _max: { activity: true },
        }),
        prisma.activityBucket.findFirst({
          where: { networkId, recordedAt: { gte: from } },
          orderBy: { recordedAt: 'desc' },
        }),
      ])

    res.json({
      networkId,
      range,
      metrics,
      door: {
        lastDetectedAt: latestEvent?.recordedAt.toISOString() ?? null,
        eventCount,
      },
      activity: {
        current: latestActivity?.activity ?? 0,
        average: activityAggregate._avg.activity ?? 0,
        peak: activityAggregate._max.activity ?? 0,
      },
    })
  }),
)

apiRouter.get(
  '/networks',
  asyncRoute(async (_req, res) => {
    const data = await prisma.network.findMany({ orderBy: { id: 'asc' } })
    res.json({ data })
  }),
)

apiRouter.get(
  '/networks/:networkId/activity',
  asyncRoute(async (req, res: Response<ActivityPage | ApiError>) => {
    const networkId = Number(req.params.networkId)
    const network = await prisma.network.findUnique({ where: { id: networkId } })
    if (!network) {
      sendNotFound(res, 'Network')
      return
    }

    const limit = parseLimit(req.query.limit)
    const cursor = parseDate(req.query.cursor)
    const interval = parseInterval(req.query.interval)
    const requestedRange = dateFilter(req)
    const recordedAt =
      requestedRange || cursor
        ? { ...requestedRange, ...(cursor ? { gt: cursor } : {}) }
        : undefined
    const rows = await prisma.activityBucket.findMany({
      where: { networkId, ...(recordedAt ? { recordedAt } : {}) },
      orderBy: { recordedAt: 'asc' },
      ...(interval === 'raw' ? { take: limit + 1 } : {}),
    })
    if (interval !== 'raw') {
      res.json({
        data: aggregateActivity(rows, interval).slice(0, limit),
        nextCursor: null,
      })
      return
    }
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    res.json({
      data: page.map((row) => ({
        networkId: row.networkId,
        activity: row.activity,
        timestamp: row.recordedAt.toISOString(),
      })),
      nextCursor: hasMore ? page.at(-1)?.recordedAt.toISOString() ?? null : null,
    })
  }),
)

apiRouter.get(
  '/sensors',
  asyncRoute(async (req, res: Response<SensorList | ApiError>) => {
    const networkId = Number(req.query.networkId)
    const network = await prisma.network.findUnique({ where: { id: networkId } })
    if (!network) {
      sendNotFound(res, 'Network')
      return
    }

    const rows = await prisma.sensor.findMany({
      where: { networkId },
      orderBy: { id: 'asc' },
      include: {
        readings: {
          orderBy: { recordedAt: 'desc' },
          take: 20,
        },
      },
    })
    const data: Sensor[] = rows.map((row) => {
      const seenMetrics = new Set<string>()
      const latestReadings = row.readings
        .filter((reading) => {
          if (seenMetrics.has(reading.metric)) return false
          seenMetrics.add(reading.metric)
          return true
        })
        .map(mapReading)
      const status: SensorStatus = !row.lastSeenAt
        ? 'unknown'
        : Date.now() - row.lastSeenAt.getTime() < 5 * 60 * 1_000
          ? 'online'
          : 'offline'

      return {
        id: row.id,
        networkId: row.networkId,
        location: row.location,
        capabilities: row.capabilities.filter(isCapability),
        status,
        lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        latestReadings,
      }
    })
    res.json({ data })
  }),
)

apiRouter.get(
  '/sensors/:sensorId/readings',
  asyncRoute(async (req, res: Response<ReadingPage | ApiError>) => {
    const sensorId = String(req.params.sensorId)
    const sensor = await prisma.sensor.findUnique({ where: { id: sensorId } })
    if (!sensor) {
      sendNotFound(res, 'Sensor')
      return
    }

    const limit = parseLimit(req.query.limit)
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined
    const interval = parseInterval(req.query.interval)
    const recordedAt = dateFilter(req)
    const rows = await prisma.sensorReading.findMany({
      where: {
        sensorId,
        metric: String(req.query.metric),
        ...(recordedAt ? { recordedAt } : {}),
      },
      orderBy: { recordedAt: 'asc' },
      ...(interval === 'raw' ? { take: limit + 1 } : {}),
      ...(interval === 'raw' && cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (interval !== 'raw') {
      res.json({
        data: aggregateReadings(rows, interval).slice(0, limit),
        nextCursor: null,
      })
      return
    }
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    res.json({
      data: page.map(mapReading),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    })
  }),
)

apiRouter.get(
  '/sensors/:sensorId/events',
  asyncRoute(async (req, res: Response<SensorEventPage | ApiError>) => {
    const sensorId = String(req.params.sensorId)
    const sensor = await prisma.sensor.findUnique({ where: { id: sensorId } })
    if (!sensor) {
      sendNotFound(res, 'Sensor')
      return
    }

    const limit = parseLimit(req.query.limit)
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined
    const recordedAt = dateFilter(req)
    const rows = await prisma.sensorEvent.findMany({
      where: {
        sensorId,
        ...(typeof req.query.type === 'string' ? { type: req.query.type } : {}),
        ...(recordedAt ? { recordedAt } : {}),
      },
      orderBy: { recordedAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    res.json({
      data: page.map(mapEvent),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    })
  }),
)

apiRouter.get('/realtime/events', streamRealtimeEvents)
