import type { Page } from '@playwright/test'

const climateSensorId = 'SENSOR_CLIMATE'
const doorSensorId = 'SENSOR_DOOR'

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function reading(metric: 'humidity' | 'temperature', value: number, minutesAgo: number) {
  return {
    id: `${metric}-${minutesAgo}`,
    metric,
    sensorId: climateSensorId,
    timestamp: isoMinutesAgo(minutesAgo),
    unit: metric === 'temperature' ? 'C' : '%',
    value,
  }
}

function summary(range: string) {
  return {
    activity: { average: 0.12, current: 0.18, peak: 0.64 },
    door: { eventCount: 3, lastDetectedAt: isoMinutesAgo(2) },
    metrics: [
      {
        average: 22.8,
        current: 23.4,
        maximum: 24.1,
        metric: 'temperature',
        minimum: 21.9,
        unit: 'C',
        updatedAt: isoMinutesAgo(1),
      },
      {
        average: 48,
        current: 47,
        maximum: 56,
        metric: 'humidity',
        minimum: 42,
        unit: '%',
        updatedAt: isoMinutesAgo(1),
      },
    ],
    networkId: 1,
    range,
  }
}

const sensors = {
  data: [
    {
      capabilities: ['temperature', 'humidity'],
      id: climateSensorId,
      lastSeenAt: isoMinutesAgo(1),
      latestReadings: [reading('temperature', 23.4, 1), reading('humidity', 47, 1)],
      location: 'Bathroom',
      networkId: 1,
      status: 'online',
    },
    {
      capabilities: ['vibration'],
      id: doorSensorId,
      lastSeenAt: isoMinutesAgo(2),
      location: 'Front door',
      networkId: 1,
      status: 'online',
    },
  ],
}

const history = {
  activity: {
    data: [
      { activity: 0.08, networkId: 1, timestamp: isoMinutesAgo(180) },
      { activity: 0.21, networkId: 1, timestamp: isoMinutesAgo(90) },
      { activity: 0.18, networkId: 1, timestamp: isoMinutesAgo(15) },
    ],
    nextCursor: null,
  },
  events: {
    data: [
      { id: 'door-1', sensorId: doorSensorId, timestamp: isoMinutesAgo(2), type: 'detected' },
      { id: 'door-2', sensorId: doorSensorId, timestamp: isoMinutesAgo(47), type: 'detected' },
    ],
    nextCursor: null,
  },
  humidity: {
    data: [reading('humidity', 45, 180), reading('humidity', 50, 90), reading('humidity', 47, 15)],
    nextCursor: null,
  },
  temperature: {
    data: [
      reading('temperature', 21.9, 180),
      reading('temperature', 22.7, 90),
      reading('temperature', 23.4, 15),
    ],
    nextCursor: null,
  },
}

export interface DashboardApiMockOptions {
  realtimeDelayMs?: number
  realtimeEvents?: unknown[]
  summaryFailures?: number
}

export async function installDashboardApiMocks(
  page: Page,
  options: DashboardApiMockOptions = {},
) {
  const authorizationHeaders: string[] = []
  const requestedIntervals: string[] = []
  const requestedRanges: string[] = []
  let remainingSummaryFailures = options.summaryFailures ?? 0
  let realtimeResponseSent = false

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    authorizationHeaders.push(request.headers().authorization ?? '')

    if (url.pathname === '/api/v1/sensors') {
      await route.fulfill({ json: sensors })
      return
    }

    if (url.pathname === '/api/v1/dashboard/summary') {
      const range = url.searchParams.get('range') ?? '24h'
      requestedRanges.push(range)
      if (remainingSummaryFailures > 0) {
        remainingSummaryFailures -= 1
        await route.fulfill({
          json: { message: 'Sensor data is temporarily unavailable.' },
          status: 503,
        })
        return
      }
      await route.fulfill({ json: summary(range) })
      return
    }

    if (url.pathname === `/api/v1/sensors/${climateSensorId}/readings`) {
      const metric = url.searchParams.get('metric')
      requestedIntervals.push(url.searchParams.get('interval') ?? 'raw')
      await route.fulfill({
        json: metric === 'temperature' ? history.temperature : history.humidity,
      })
      return
    }

    if (url.pathname === `/api/v1/sensors/${doorSensorId}/events`) {
      await route.fulfill({ json: history.events })
      return
    }

    if (url.pathname === '/api/v1/networks/1/activity') {
      requestedIntervals.push(url.searchParams.get('interval') ?? 'raw')
      await route.fulfill({ json: history.activity })
      return
    }

    if (url.pathname === '/api/v1/realtime/events') {
      if (options.realtimeDelayMs && !realtimeResponseSent) {
        await new Promise((resolve) => setTimeout(resolve, options.realtimeDelayMs))
      }
      realtimeResponseSent = true
      const events = options.realtimeEvents ?? [
        {
          data: {},
          id: 'heartbeat-1',
          occurredAt: new Date().toISOString(),
          type: 'heartbeat',
        },
      ]
      const body = [
        'retry: 30000\n\n',
        ...events.map(
          (event) =>
            `id: ${(event as { id: string }).id}\ndata: ${JSON.stringify(event)}\n\n`,
        ),
      ].join('')
      await route.fulfill({
        body,
        contentType: 'text/event-stream; charset=utf-8',
        headers: { 'cache-control': 'no-cache' },
      })
      return
    }

    await route.fulfill({
      json: { message: `No E2E mock is defined for ${url.pathname}.` },
      status: 501,
    })
  })

  return { authorizationHeaders, requestedIntervals, requestedRanges }
}

export const e2eSensorIds = { climateSensorId, doorSensorId }
