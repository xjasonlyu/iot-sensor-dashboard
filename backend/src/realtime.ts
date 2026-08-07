import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import type { components } from '@iot-dashboard/api-contract'

export type RealtimeEvent = components['schemas']['RealtimeEvent']

const MAX_BUFFERED_EVENTS = 100

function writeEvent(res: Response, event: RealtimeEvent, includeSseId = true): boolean {
  if (res.writableEnded || res.destroyed) return false
  if (includeSseId) res.write(`id: ${event.id}\n`)
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
  return true
}

class RealtimeHub {
  private readonly clients = new Set<Response>()
  private readonly eventBuffer: RealtimeEvent[] = []

  connect(req: Request, res: Response): void {
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
      const lastIndex = this.eventBuffer.findIndex((event) => event.id === lastEventId)
      if (lastIndex >= 0) {
        for (const event of this.eventBuffer.slice(lastIndex + 1)) {
          writeEvent(res, event)
        }
      }
    }

    this.clients.add(res)

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

  publish(event: RealtimeEvent): void {
    if (event.type !== 'heartbeat') {
      this.eventBuffer.push(event)
      if (this.eventBuffer.length > MAX_BUFFERED_EVENTS) this.eventBuffer.shift()
    }

    for (const client of this.clients) {
      if (!writeEvent(client, event)) this.clients.delete(client)
    }
  }

  get connectionCount(): number {
    return this.clients.size
  }
}

export const realtimeHub = new RealtimeHub()

export function streamRealtimeEvents(req: Request, res: Response): void {
  realtimeHub.connect(req, res)
}
