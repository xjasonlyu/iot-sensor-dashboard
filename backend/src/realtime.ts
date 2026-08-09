import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import type { ApiError, RealtimeEvent } from '@iot-dashboard/api-contract'

export type { RealtimeEvent } from '@iot-dashboard/api-contract'

const MAX_BUFFERED_EVENTS = 100

interface BufferedEvent {
  event: RealtimeEvent
  networkId: number
}

function writeEvent(res: Response, event: RealtimeEvent, includeSseId = true): boolean {
  if (res.writableEnded || res.destroyed) return false
  if (includeSseId) res.write(`id: ${event.id}\n`)
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
  return true
}

class RealtimeHub {
  private readonly clients = new Map<Response, number>()
  private readonly eventBuffer: BufferedEvent[] = []

  connect(req: Request, res: Response, networkId: number): void {
    res.status(200)
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()
    res.write('retry: 3000\n\n')

    const lastEventId = req.header('last-event-id')
    if (lastEventId) {
      const lastIndex = this.eventBuffer.findIndex(
        (buffered) =>
          buffered.networkId === networkId && buffered.event.id === lastEventId,
      )
      if (lastIndex >= 0) {
        for (const buffered of this.eventBuffer.slice(lastIndex + 1)) {
          if (buffered.networkId === networkId) writeEvent(res, buffered.event)
        }
      }
    }

    this.clients.set(res, networkId)

    const sendHeartbeat = () => {
      const heartbeat: RealtimeEvent = {
        id: randomUUID(),
        type: 'heartbeat',
        occurredAt: new Date().toISOString(),
        data: {},
      }
      // Heartbeats deliberately do not replace the resumable Last-Event-ID.
      writeEvent(res, heartbeat, false)
    }

    sendHeartbeat()
    const heartbeatTimer = setInterval(sendHeartbeat, 15_000)

    req.on('close', () => {
      clearInterval(heartbeatTimer)
      this.clients.delete(res)
      if (!res.writableEnded) res.end()
    })
  }

  publish(networkId: number, event: RealtimeEvent): void {
    if (event.type !== 'heartbeat') {
      if (this.eventBuffer.some((buffered) => buffered.event.id === event.id)) return

      this.eventBuffer.push({ event, networkId })
      if (this.eventBuffer.length > MAX_BUFFERED_EVENTS) this.eventBuffer.shift()
    }

    for (const [client, clientNetworkId] of this.clients) {
      if (clientNetworkId !== networkId) continue
      if (!writeEvent(client, event)) this.clients.delete(client)
    }
  }

  get connectionCount(): number {
    return this.clients.size
  }
}

export const realtimeHub = new RealtimeHub()

export function streamRealtimeEvents(req: Request, res: Response): void {
  const networkId =
    typeof req.query.networkId === 'string' ? Number(req.query.networkId) : Number.NaN
  if (!Number.isInteger(networkId) || networkId <= 0) {
    const error: ApiError = {
      code: 'INVALID_QUERY_PARAMETER',
      message: 'The `networkId` query parameter must be a positive integer.',
      requestId: randomUUID(),
    }
    res.status(400).json(error)
    return
  }

  realtimeHub.connect(req, res, networkId)
}
