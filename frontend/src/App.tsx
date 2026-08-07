import { useCallback, useEffect, useState } from 'react'
import type { components } from '@iot-dashboard/api-contract'
import { apiClient } from './api/client'
import type { RealtimeEvent } from './api/sse'
import { useRealtimeEvents } from './hooks/useRealtimeEvents'

type Sensor = components['schemas']['Sensor']

function App() {
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void apiClient
      .GET('/api/v1/sensors', {
        params: { query: { networkId: 1 } },
        signal: controller.signal,
      })
      .then(({ data, error }) => {
        if (error) {
          setApiError(error.message)
          return
        }
        setSensors(data.data)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setApiError(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    setLastEvent(event)

    if (event.type !== 'sensor.reading') return

    setSensors((currentSensors) =>
      currentSensors.map((sensor) => {
        if (sensor.id !== event.data.sensorId) return sensor

        const latestReadings = (sensor.latestReadings ?? []).filter(
          (reading) => reading.metric !== event.data.metric,
        )

        return {
          ...sensor,
          status: 'online',
          lastSeenAt: event.data.timestamp,
          latestReadings: [...latestReadings, event.data],
        }
      }),
    )
  }, [])

  const realtime = useRealtimeEvents({
    networkId: 1,
    onEvent: handleRealtimeEvent,
  })

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Home network</p>
          <h1>IoT Sensor Dashboard</h1>
        </div>
        <div className={`connection connection--${realtime.status}`}>
          <span className="connection__dot" />
          SSE: {realtime.status}
        </div>
      </header>

      {loading && <p className="notice">Loading sensors…</p>}
      {apiError && <p className="notice notice--error">API error: {apiError}</p>}
      {realtime.error && (
        <p className="notice notice--error">Realtime: {realtime.error}</p>
      )}

      <section className="sensor-grid" aria-label="Current sensor values">
        {sensors.flatMap((sensor) =>
          (sensor.latestReadings ?? []).map((reading) => (
            <article className="sensor-card" key={`${sensor.id}-${reading.metric}`}>
              <p>{sensor.location}</p>
              <h2>{reading.metric}</h2>
              <strong>
                {reading.value}
                <span>{reading.unit}</span>
              </strong>
              <small>Updated {new Date(reading.timestamp).toLocaleTimeString()}</small>
            </article>
          )),
        )}
      </section>

      <section className="event-panel">
        <h2>Realtime transport stub</h2>
        <p>
          The fetch-based SSE client reconnects with exponential backoff and preserves
          the latest event ID.
        </p>
        <pre>{lastEvent ? JSON.stringify(lastEvent, null, 2) : 'Waiting for an event…'}</pre>
      </section>
    </main>
  )
}

export default App
