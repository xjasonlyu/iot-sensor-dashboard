import { connect, type IClientOptions, type MqttClient } from 'mqtt'
import { persistRealtimeEvent } from './database.js'
import type { RealtimeEvent } from './realtime.js'
import { realtimeHub } from './realtime.js'

let mqttClient: MqttClient | null = null

type TelemetryTopic =
  | { kind: 'activity'; networkId: number }
  | { kind: 'events' | 'readings'; networkId: number; sensorId: string }

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const supportedTypes = new Set([
    'sensor.reading',
    'sensor.event',
    'activity.updated',
    'heartbeat',
  ])

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    supportedTypes.has(candidate.type) &&
    typeof candidate.occurredAt === 'string' &&
    candidate.data !== null &&
    typeof candidate.data === 'object'
  )
}

function parseTelemetryTopic(topic: string): TelemetryTopic | null {
  const segments = topic.split('/')
  if (segments[0] !== 'iot' || segments[1] !== 'networks') return null

  const networkId = Number(segments[2])
  if (!Number.isInteger(networkId) || networkId <= 0) return null

  if (segments.length === 4 && segments[3] === 'activity') {
    return { kind: 'activity', networkId }
  }

  const kind = segments[5]
  const sensorId = segments[4]
  if (
    segments.length === 6 &&
    segments[3] === 'sensors' &&
    sensorId &&
    (kind === 'events' || kind === 'readings')
  ) {
    return { kind, networkId, sensorId }
  }

  return null
}

function eventMatchesTopic(event: RealtimeEvent, topic: TelemetryTopic): boolean {
  if (topic.kind === 'activity') {
    return event.type === 'activity.updated' && event.data.networkId === topic.networkId
  }
  if (topic.kind === 'readings') {
    return event.type === 'sensor.reading' && event.data.sensorId === topic.sensorId
  }
  return event.type === 'sensor.event' && event.data.sensorId === topic.sensorId
}

export function startMqtt(): MqttClient {
  const mqttUrl = process.env.MQTT_URL ?? 'mqtt://localhost:1883'
  const options: IClientOptions = {
    clientId: 'iot-dashboard-backend',
    clean: true,
    reconnectPeriod: 1_000,
    connectTimeout: 10_000,
    keepalive: 30,
  }

  const client = connect(mqttUrl, options)
  mqttClient = client

  client.on('connect', () => {
    const topics = [
      'iot/networks/+/sensors/+/readings',
      'iot/networks/+/sensors/+/events',
      'iot/networks/+/activity',
    ]

    client.subscribe(topics, { qos: 1 }, (error) => {
      if (error) {
        console.error('Failed to subscribe to MQTT telemetry topics', error)
        return
      }
      console.log(`MQTT connected to ${mqttUrl}; subscribed to ${topics.join(', ')}`)
    })
  })

  client.on('message', (topic, payload) => {
    try {
      const parsed: unknown = JSON.parse(payload.toString('utf8'))
      if (!isRealtimeEvent(parsed)) {
        console.warn(`Ignoring invalid MQTT payload on ${topic}`)
        return
      }
      const telemetryTopic = parseTelemetryTopic(topic)
      if (!telemetryTopic || !eventMatchesTopic(parsed, telemetryTopic)) {
        console.warn(`Ignoring MQTT payload that does not match its topic: ${topic}`)
        return
      }

      realtimeHub.publish(telemetryTopic.networkId, parsed)
      void persistRealtimeEvent(parsed).catch((error: unknown) => {
        console.error(`Could not persist MQTT payload from ${topic}`, error)
      })
    } catch (error) {
      console.warn(`Could not process MQTT payload on ${topic}`, error)
    }
  })

  client.on('reconnect', () => console.log('Reconnecting to MQTT broker'))
  client.on('error', (error) => console.error('MQTT client error', error))

  return client
}

export function isMqttConnected(): boolean {
  return mqttClient?.connected ?? false
}

export async function stopMqtt(): Promise<void> {
  const client = mqttClient
  mqttClient = null
  if (!client) return

  await new Promise<void>((resolve, reject) => {
    client.end(false, {}, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}
