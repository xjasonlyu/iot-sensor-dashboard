import { connect, type IClientOptions, type MqttClient } from 'mqtt'
import { persistRealtimeEvent } from './database.js'
import type { RealtimeEvent } from './realtime.js'
import { realtimeHub } from './realtime.js'

let mqttClient: MqttClient | null = null

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
      realtimeHub.publish(parsed)
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
