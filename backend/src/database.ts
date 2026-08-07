import type { RealtimeEvent } from '@iot-dashboard/api-contract'
import { loadInitialData } from './load-initial-data.js'
import { prisma } from './prisma.js'

export async function initializeDatabase(): Promise<void> {
  await prisma.$connect()
  await loadInitialData()
}

export async function isDatabaseConnected(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error('PostgreSQL readiness check failed', error)
    return false
  }
}

export async function persistRealtimeEvent(event: RealtimeEvent): Promise<void> {
  if (event.type === 'sensor.reading') {
    const recordedAt = new Date(event.data.timestamp)
    await prisma.$transaction([
      prisma.sensorReading.upsert({
        where: { id: event.data.id },
        create: {
          id: event.data.id,
          sensorId: event.data.sensorId,
          metric: event.data.metric,
          value: event.data.value,
          unit: event.data.unit,
          recordedAt,
        },
        update: {
          value: event.data.value,
          unit: event.data.unit,
          recordedAt,
        },
      }),
      prisma.sensor.updateMany({
        where: { id: event.data.sensorId },
        data: { lastSeenAt: recordedAt },
      }),
    ])
    return
  }

  if (event.type === 'sensor.event') {
    const recordedAt = new Date(event.data.timestamp)
    await prisma.$transaction([
      prisma.sensorEvent.upsert({
        where: { id: event.data.id },
        create: {
          id: event.data.id,
          sensorId: event.data.sensorId,
          type: event.data.type,
          recordedAt,
        },
        update: {
          type: event.data.type,
          recordedAt,
        },
      }),
      prisma.sensor.updateMany({
        where: { id: event.data.sensorId },
        data: { lastSeenAt: recordedAt },
      }),
    ])
    return
  }

  if (event.type === 'activity.updated') {
    const recordedAt = new Date(event.data.timestamp)
    await prisma.activityBucket.upsert({
      where: {
        networkId_recordedAt: {
          networkId: event.data.networkId,
          recordedAt,
        },
      },
      create: {
        networkId: event.data.networkId,
        recordedAt,
        activity: event.data.activity,
      },
      update: { activity: event.data.activity },
    })
  }
}

export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect()
}
