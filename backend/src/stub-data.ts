import type { components } from '@iot-dashboard/api-contract'

type ActivityPoint = components['schemas']['ActivityPoint']
type DashboardSummary = components['schemas']['DashboardSummary']
type Network = components['schemas']['Network']
type Reading = components['schemas']['Reading']
type Sensor = components['schemas']['Sensor']
type SensorEvent = components['schemas']['SensorEvent']
type TimeRange = components['schemas']['TimeRange']

const now = new Date()
const timestamp = now.toISOString()
const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString()
const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString()

export const networks: Network[] = [
  {
    id: 1,
    name: 'Home WiFi Motion Network',
  },
]

export const readings: Reading[] = [
  {
    id: 'stub-temperature-1',
    sensorId: 'SENSOR_7C3E822F6E550000',
    metric: 'temperature',
    value: 24.4,
    unit: 'C',
    timestamp,
  },
  {
    id: 'stub-humidity-1',
    sensorId: 'SENSOR_7C3E822F6E550000',
    metric: 'humidity',
    value: 54,
    unit: '%',
    timestamp,
  },
]

export const sensors: Sensor[] = [
  {
    id: 'SENSOR_7C3E822F6E550000',
    networkId: 1,
    location: 'Bathroom',
    capabilities: ['temperature', 'humidity'],
    status: 'online',
    lastSeenAt: timestamp,
    latestReadings: readings,
  },
  {
    id: 'SENSOR_282C02BFFFEEE739',
    networkId: 1,
    location: 'Front Door',
    capabilities: ['vibration'],
    status: 'online',
    lastSeenAt: fifteenMinutesAgo,
    latestReadings: [],
  },
]

export const sensorEvents: SensorEvent[] = [
  {
    id: 'stub-door-event-1',
    sensorId: 'SENSOR_282C02BFFFEEE739',
    type: 'detected',
    timestamp: fifteenMinutesAgo,
  },
]

export const activity: ActivityPoint[] = [
  { networkId: 1, activity: 0.18, timestamp: thirtyMinutesAgo },
  { networkId: 1, activity: 0.31, timestamp: fifteenMinutesAgo },
  { networkId: 1, activity: 0.23, timestamp },
]

export function createDashboardSummary(range: TimeRange): DashboardSummary {
  return {
    networkId: 1,
    range,
    metrics: [
      {
        metric: 'temperature',
        current: 24.4,
        unit: 'C',
        average: 24.2,
        minimum: 23.8,
        maximum: 24.7,
        updatedAt: timestamp,
      },
      {
        metric: 'humidity',
        current: 54,
        unit: '%',
        average: 53.4,
        minimum: 51,
        maximum: 56,
        updatedAt: timestamp,
      },
    ],
    door: {
      lastDetectedAt: fifteenMinutesAgo,
      eventCount: 1,
    },
    activity: {
      current: 0.23,
      average: 0.15,
      peak: 0.31,
    },
  }
}
