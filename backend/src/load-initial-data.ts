import { readFile } from 'node:fs/promises'
import type { Prisma } from './generated/prisma/client.js'
import { prisma } from './prisma.js'

const IMPORT_KEY = 'assignment-json-v1'
const BATCH_SIZE = 1_000

interface SensorSourceRecord {
  network_id: number
  locationName: string
  action: 'SensorValueChanged' | 'SensorDetected'
  payload: string
  thingName: string
  date: string
}

interface SensorSourceFile {
  sensors: SensorSourceRecord[]
}

interface ActivitySourceRecord {
  network_id: number
  time: string
  activity: number
}

interface ActivitySourceFile {
  activity: ActivitySourceRecord[]
}

interface SensorDefinition {
  networkId: number
  location: string
  capabilities: Set<string>
  lastSeenAt: Date
}

function parseDate(value: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid source timestamp: ${value}`)
  return parsed
}

async function insertInBatches<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<{ count: number }>,
): Promise<number> {
  let inserted = 0
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    inserted += (await insert(rows.slice(index, index + BATCH_SIZE))).count
  }
  return inserted
}

export async function loadInitialData(): Promise<void> {
  const completedImport = await prisma.dataImport.findUnique({
    where: { key: IMPORT_KEY },
  })
  if (completedImport) return

  const [sensorJson, activityJson] = await Promise.all([
    readFile(new URL('../../data/sensors.json', import.meta.url), 'utf8'),
    readFile(new URL('../../data/activity.json', import.meta.url), 'utf8'),
  ])
  const sensorSource = JSON.parse(sensorJson) as SensorSourceFile
  const activitySource = JSON.parse(activityJson) as ActivitySourceFile

  const networks = new Set<number>()
  const sensorDefinitions = new Map<string, SensorDefinition>()
  const readings: Prisma.SensorReadingCreateManyInput[] = []
  const events: Prisma.SensorEventCreateManyInput[] = []

  for (const record of sensorSource.sensors) {
    const recordedAt = parseDate(record.date)
    networks.add(record.network_id)

    let definition = sensorDefinitions.get(record.thingName)
    if (!definition) {
      definition = {
        networkId: record.network_id,
        location: record.locationName,
        capabilities: new Set<string>(),
        lastSeenAt: recordedAt,
      }
      sensorDefinitions.set(record.thingName, definition)
    }
    if (recordedAt > definition.lastSeenAt) definition.lastSeenAt = recordedAt

    if (record.action === 'SensorDetected') {
      definition.capabilities.add('vibration')
      events.push({
        id: `source:${record.thingName}:detected:${record.date}`,
        sensorId: record.thingName,
        type: 'detected',
        recordedAt,
      })
      continue
    }

    const payload = JSON.parse(record.payload) as Record<string, unknown>
    for (const metric of ['temperature', 'humidity'] as const) {
      const value = payload[metric]
      if (typeof value !== 'number') continue

      definition.capabilities.add(metric)
      readings.push({
        id: `source:${record.thingName}:${metric}:${record.date}`,
        sensorId: record.thingName,
        metric,
        value,
        unit: typeof payload.unit === 'string' ? payload.unit : '',
        recordedAt,
      })
    }
  }

  const activity: Prisma.ActivityBucketCreateManyInput[] = activitySource.activity.map(
    (record) => {
      networks.add(record.network_id)
      return {
        networkId: record.network_id,
        recordedAt: parseDate(record.time),
        activity: record.activity,
      }
    },
  )

  for (const networkId of networks) {
    await prisma.network.upsert({
      where: { id: networkId },
      create: {
        id: networkId,
        name: networkId === 1 ? 'Home WiFi Motion Network' : `Network ${networkId}`,
      },
      update: {},
    })
  }

  for (const [id, definition] of sensorDefinitions) {
    const capabilities = [...definition.capabilities]
    await prisma.sensor.upsert({
      where: { id },
      create: {
        id,
        networkId: definition.networkId,
        location: definition.location,
        capabilities,
        lastSeenAt: definition.lastSeenAt,
      },
      update: {
        networkId: definition.networkId,
        location: definition.location,
        capabilities,
      },
    })
    await prisma.sensor.updateMany({
      where: {
        id,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: definition.lastSeenAt } }],
      },
      data: { lastSeenAt: definition.lastSeenAt },
    })
  }

  const insertedReadings = await insertInBatches(readings, (data) =>
    prisma.sensorReading.createMany({ data, skipDuplicates: true }),
  )
  const insertedEvents = await insertInBatches(events, (data) =>
    prisma.sensorEvent.createMany({ data, skipDuplicates: true }),
  )
  const insertedActivity = await insertInBatches(activity, (data) =>
    prisma.activityBucket.createMany({ data, skipDuplicates: true }),
  )

  await prisma.dataImport.create({ data: { key: IMPORT_KEY } })
  console.log(
    `Initial data loaded: ${insertedReadings} readings, ${insertedEvents} events, ${insertedActivity} activity buckets`,
  )
}
