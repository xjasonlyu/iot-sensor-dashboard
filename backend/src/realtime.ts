import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import type { components } from '@iot-dashboard/api-contract'

type RealtimeEvent = components['schemas']['RealtimeEvent']

function writeEvent(res: Response, event: RealtimeEvent): void {
  res.write(`id: ${event.id}\n`)
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

/**
 * Initial SSE transport stub. MQTT ingestion can call the exported write helper
 * through a broadcaster in the next implementation step. Last-Event-ID replay
 * will require a small event buffer or a durable event-log query.
 */
export function streamRealtimeEvents(req: Request, res: Response): void {
  const lastEventId = req.header('last-event-id')
  void lastEventId // TODO: replay buffered events after this ID.

  res.status(200)
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  res.write('retry: 3000\n\n')

  const sendHeartbeat = () => {
    writeEvent(res, {
      id: randomUUID(),
      type: 'heartbeat',
      occurredAt: new Date().toISOString(),
      data: {},
    })
  }

  sendHeartbeat()
  const heartbeatTimer = setInterval(sendHeartbeat, 15_000)

  req.on('close', () => {
    clearInterval(heartbeatTimer)
    res.end()
  })
}
