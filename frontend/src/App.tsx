import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ActivityPoint,
  DashboardSummary,
  Reading,
  Sensor,
  SensorEvent,
} from '@iot-dashboard/api-contract'
import { apiErrorMessage, dashboardApi, networksApi, sensorsApi } from './api/client'
import type { RealtimeEvent } from './api/sse'
import { ActivityChart, ClimateChart } from './components/DashboardCharts'
import { MetricCard } from './components/MetricCard'
import { SensorIcon } from './components/SensorIcon'
import { useRealtimeEvents } from './hooks/useRealtimeEvents'
import {
  RANGE_INTERVALS,
  RANGE_MILLISECONDS,
  type TimeRange,
} from './timeRanges'

const NETWORK_ID = 1
const MAX_LIVE_POINTS = 1_200
const ranges: Array<{ label: string; value: TimeRange }> = [
  { label: '1H', value: '1h' },
  { label: '6H', value: '6h' },
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
]
const chartModeLabels: Record<TimeRange, string> = {
  '1h': '3 min trend · live',
  '6h': '5 min avg · live',
  '24h': '15 min avg · live',
  '7d': '1 hour avg · live',
  '30d': '1 day avg · live',
}

function formatValue(value: number | undefined, fractionDigits = 1): string {
  return value === undefined
    ? '—'
    : value.toLocaleString([], {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits,
      })
}

function relativeTime(timestamp: string | null | undefined): string {
  if (!timestamp) return 'No activity yet'
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(timestamp)) / 1_000))
  if (seconds < 10) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(timestamp).toLocaleDateString()
}

function upsertTimestamped<T extends { timestamp: string }>(
  items: T[],
  nextItem: T,
  maxItems = MAX_LIVE_POINTS,
): T[] {
  return [...items.filter((item) => item.timestamp !== nextItem.timestamp), nextItem]
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    .slice(-maxItems)
}

function App() {
  const [range, setRange] = useState<TimeRange>('24h')
  const [refreshKey, setRefreshKey] = useState(0)
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [temperature, setTemperature] = useState<Reading[]>([])
  const [humidity, setHumidity] = useState<Reading[]>([])
  const [activity, setActivity] = useState<ActivityPoint[]>([])
  const [doorEvents, setDoorEvents] = useState<SensorEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [chartEndAt, setChartEndAt] = useState(Date.now())
  const [lastEventAt, setLastEventAt] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard(): Promise<void> {
      setLoading(true)
      setApiError(null)

      const requestedAt = Date.now()
      const from = new Date(requestedAt - RANGE_MILLISECONDS[range]).toISOString()
      const interval = RANGE_INTERVALS[range]
      setChartEndAt(requestedAt)
      const sensorsResponse = await sensorsApi.listSensors(
        { networkId: NETWORK_ID },
        { signal: controller.signal },
      )

      const nextSensors = sensorsResponse.data
      const climateSensor = nextSensors.find(
        (sensor) =>
          sensor.capabilities.includes('temperature') &&
          sensor.capabilities.includes('humidity'),
      )
      const doorSensor = nextSensors.find((sensor) =>
        sensor.capabilities.includes('vibration'),
      )
      if (!climateSensor || !doorSensor) {
        throw new Error('The expected climate and door sensors were not found.')
      }

      const [
        summaryResponse,
        temperatureResponse,
        humidityResponse,
        activityResponse,
        eventsResponse,
      ] = await Promise.all([
          dashboardApi.getDashboardSummary(
            { networkId: NETWORK_ID, range },
            { signal: controller.signal },
          ),
          sensorsApi.getSensorReadings(
            {
              sensorId: climateSensor.id,
              from,
              interval,
              limit: 1_000,
              metric: 'temperature',
            },
            { signal: controller.signal },
          ),
          sensorsApi.getSensorReadings(
            {
              sensorId: climateSensor.id,
              from,
              interval,
              limit: 1_000,
              metric: 'humidity',
            },
            { signal: controller.signal },
          ),
          networksApi.getNetworkActivity(
            {
              networkId: NETWORK_ID,
              from,
              interval,
              limit: 1_000,
            },
            { signal: controller.signal },
          ),
          sensorsApi.getSensorEvents(
            {
              sensorId: doorSensor.id,
              from,
              limit: 8,
              type: 'detected',
            },
            { signal: controller.signal },
          ),
        ])

      if (controller.signal.aborted) return
      setSensors(nextSensors)
      setSummary(summaryResponse)
      setTemperature(temperatureResponse.data)
      setHumidity(humidityResponse.data)
      setActivity(activityResponse.data)
      setDoorEvents(eventsResponse.data)
    }

    void loadDashboard()
      .catch(async (error: unknown) => {
        const message = await apiErrorMessage(error)
        if (!controller.signal.aborted) setApiError(message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [range, refreshKey])

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    setLastEventAt(event.occurredAt)
    const eventTime = Date.parse(event.occurredAt)
    if (!Number.isNaN(eventTime)) {
      setChartEndAt((current) => Math.max(current, eventTime))
    }

    if (event.type === 'sensor.reading') {
      setSensors((currentSensors) =>
        currentSensors.map((sensor) => {
          if (sensor.id !== event.data.sensorId) return sensor
          const latestReadings = (sensor.latestReadings ?? []).filter(
            (reading) => reading.metric !== event.data.metric,
          )
          return {
            ...sensor,
            lastSeenAt: event.data.timestamp,
            latestReadings: [...latestReadings, event.data],
            status: 'online',
          }
        }),
      )
      if (event.data.metric === 'temperature') {
        setTemperature((current) => upsertTimestamped(current, event.data))
      } else {
        setHumidity((current) => upsertTimestamped(current, event.data))
      }
      setSummary((current) =>
        current
          ? {
              ...current,
              metrics: current.metrics.map((metric) =>
                metric.metric === event.data.metric
                  ? {
                      ...metric,
                      current: event.data.value,
                      updatedAt: event.data.timestamp,
                    }
                  : metric,
              ),
            }
          : current,
      )
    }

    if (event.type === 'activity.updated') {
      setActivity((current) => upsertTimestamped(current, event.data))
      setSummary((current) =>
        current
          ? { ...current, activity: { ...current.activity, current: event.data.activity } }
          : current,
      )
    }

    if (event.type === 'sensor.event') {
      setDoorEvents((current) => [
        event.data,
        ...current.filter((item) => item.id !== event.data.id),
      ].slice(0, 8))
      setSummary((current) =>
        current
          ? {
              ...current,
              door: {
                eventCount: current.door.eventCount + 1,
                lastDetectedAt: event.data.timestamp,
              },
            }
          : current,
      )
    }
  }, [])

  const realtime = useRealtimeEvents({
    networkId: NETWORK_ID,
    onEvent: handleRealtimeEvent,
  })

  const latestTemperature = summary?.metrics.find(
    (metric) => metric.metric === 'temperature',
  )
  const latestHumidity = summary?.metrics.find((metric) => metric.metric === 'humidity')
  const onlineSensors = sensors.filter((sensor) => sensor.status === 'online').length
  const offlineSensors = sensors.length - onlineSensors
  const dashboardStatus = loading && sensors.length === 0
    ? 'Checking your home…'
    : apiError
      ? 'Dashboard needs attention.'
      : offlineSensors > 0
        ? `${offlineSensors} sensor${offlineSensors === 1 ? '' : 's'} offline.`
        : 'Everything looks calm.'
  const sensorStatus = loading && sensors.length === 0
    ? 'Checking sensor status'
    : sensors.length === 0
      ? 'Sensor status unavailable'
      : `${onlineSensors} of ${sensors.length} sensors online`
  const insight = useMemo(() => {
    const currentTemperature = latestTemperature?.current
    const currentHumidity = latestHumidity?.current
    if (currentTemperature === undefined || currentHumidity === undefined) {
      return { label: 'Collecting data', message: 'A comfort insight will appear shortly.' }
    }

    const comfortable =
      currentTemperature >= 20 &&
      currentTemperature <= 26 &&
      currentHumidity >= 30 &&
      currentHumidity <= 60
    const firstTemperature = temperature.at(0)?.value ?? currentTemperature
    const delta = currentTemperature - firstTemperature
    const direction = Math.abs(delta) < 0.2 ? 'stable' : delta > 0 ? 'warming' : 'cooling'

    return {
      label: comfortable ? 'Comfortable' : 'Check conditions',
      message: `${currentTemperature.toFixed(1)}°C and ${currentHumidity.toFixed(0)}% humidity; the room is ${direction} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}° over this view).`,
    }
  }, [latestHumidity?.current, latestTemperature?.current, temperature])

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            io
          </span>
          <div>
            <p className="eyebrow">Home network</p>
            <h1>Sensor overview</h1>
          </div>
        </div>
        <div className="header-actions">
          <div className={`connection connection--${realtime.status}`}>
            <span className="connection__dot" />
            {realtime.status === 'open' ? 'Live' : realtime.status}
          </div>
          <button
            className="refresh-button"
            disabled={loading}
            onClick={() => setRefreshKey((value) => value + 1)}
            type="button"
          >
            <span aria-hidden="true">↻</span> Refresh
          </button>
        </div>
      </header>

      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">WiFi motion network · Primary residence</p>
          <h2>{dashboardStatus}</h2>
          <p>
            {sensorStatus}
            {lastEventAt ? ` · Last live update ${relativeTime(lastEventAt)}` : ''}
          </p>
        </div>
        <div className="range-control" aria-label="Chart time range">
          {ranges.map((option) => (
            <button
              aria-pressed={range === option.value}
              className={range === option.value ? 'is-active' : ''}
              key={option.value}
              onClick={() => setRange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {apiError && (
        <div className="notice notice--error" role="alert">
          <strong>Dashboard data could not be loaded.</strong>
          <span>{apiError}</span>
          <button onClick={() => setRefreshKey((value) => value + 1)} type="button">
            Try again
          </button>
        </div>
      )}
      {realtime.error && (
        <div className="notice" role="status">
          Live updates were interrupted. Reconnecting automatically…
        </div>
      )}

      <section className={`metric-grid ${loading ? 'is-loading' : ''}`} aria-label="Current values">
        <MetricCard
          accent="orange"
          detail={`Avg ${formatValue(latestTemperature?.average)}° · ${range.toUpperCase()}`}
          icon="temperature"
          label="Temperature"
          unit="°C"
          value={formatValue(latestTemperature?.current)}
        />
        <MetricCard
          accent="blue"
          detail={`Range ${formatValue(latestHumidity?.minimum, 0)}–${formatValue(latestHumidity?.maximum, 0)}%`}
          icon="humidity"
          label="Humidity"
          unit="%"
          value={formatValue(latestHumidity?.current, 0)}
        />
        <MetricCard
          accent="green"
          detail={`Average ${formatValue((summary?.activity.average ?? 0) * 100, 0)}%`}
          icon="motion"
          label="Motion activity"
          unit="%"
          value={formatValue((summary?.activity.current ?? 0) * 100, 0)}
        />
        <MetricCard
          accent="violet"
          detail={`${summary?.door.eventCount ?? 0} detections in this view`}
          icon="door"
          label="Front door"
          value={relativeTime(summary?.door.lastDetectedAt)}
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel panel--wide">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Bathroom climate</p>
              <h2>Temperature & humidity</h2>
            </div>
            <span className="panel__live"><i /> {chartModeLabels[range]}</span>
          </div>
          <ClimateChart
            humidity={humidity}
            range={range}
            temperature={temperature}
            windowEnd={chartEndAt}
          />
        </article>

        <article className="panel insight-panel">
          <div>
            <p className="eyebrow">Smart insight</p>
            <h2>{insight.label}</h2>
            <p>{insight.message}</p>
          </div>
          <div className="comfort-scale" aria-label="Comfort bands: dry, ideal, humid">
            <span>Dry</span>
            <span>Ideal</span>
            <span>Humid</span>
          </div>
          <small>Comfort band: 20–26°C and 30–60% RH</small>
        </article>

        <article className="panel panel--wide">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Whole home</p>
              <h2>Motion activity</h2>
            </div>
            <span className="panel__stat">
              Peak {formatValue((summary?.activity.peak ?? 0) * 100, 0)}%
            </span>
          </div>
          <ActivityChart activity={activity} range={range} windowEnd={chartEndAt} />
        </article>

        <article className="panel events-panel">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Front door</p>
              <h2>Recent detections</h2>
            </div>
          </div>
          {doorEvents.length === 0 ? (
            <div className="events-empty">No door activity in this time range.</div>
          ) : (
            <ol className="event-list">
              {doorEvents.slice(0, 5).map((event) => (
                <li key={event.id}>
                  <span className="event-list__icon" aria-hidden="true">
                    <SensorIcon name="motion" />
                  </span>
                  <div>
                    <strong>Motion detected</strong>
                    <small>{new Date(event.timestamp).toLocaleString()}</small>
                  </div>
                  <time dateTime={event.timestamp}>{relativeTime(event.timestamp)}</time>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>

      <footer>
        <span className={`footer-status footer-status--${realtime.status}`} />
        MQTT → Node.js → authenticated SSE → React
      </footer>
    </main>
  )
}

export default App
