import type { RealtimeEvent } from '@iot-dashboard/api-contract'
import { apiErrorMessage, realtimeApi } from './client'

export type { RealtimeEvent } from '@iot-dashboard/api-contract'
export type RealtimeStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

interface StreamOptions {
  networkId: number
  signal: AbortSignal
  onEvent: (event: RealtimeEvent) => void
  onStatus: (status: RealtimeStatus) => void
  onError?: (error: Error) => void
}

interface ParsedFrame {
  data: string | null
  id: string | null
  retry: number | null
}

function parseFrame(frame: string): ParsedFrame {
  const dataLines: string[] = []
  let id: string | null = null
  let retry: number | null = null

  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue

    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'data') dataLines.push(value)
    if (field === 'id' && !value.includes('\0')) id = value
    if (field === 'retry' && /^\d+$/.test(value)) retry = Number(value)
  }

  return {
    data: dataLines.length > 0 ? dataLines.join('\n') : null,
    id,
    retry,
  }
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.occurredAt === 'string' &&
    typeof candidate.data === 'object'
  )
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }

    const finish = () => {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }

    const timer = window.setTimeout(finish, delayMs)
    signal.addEventListener('abort', finish, { once: true })
  })
}

async function consumeStream(
  response: Response,
  signal: AbortSignal,
  onFrame: (frame: ParsedFrame) => void,
): Promise<void> {
  if (!response.body) throw new Error('The SSE response did not include a body.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replaceAll('\r\n', '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        onFrame(parseFrame(frame))
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export async function streamRealtimeEvents(options: StreamOptions): Promise<void> {
  const { networkId, signal, onEvent, onStatus, onError } = options
  let lastEventId: string | null = null
  let retryDelayMs = 1_000
  let failedAttempts = 0

  while (!signal.aborted) {
    onStatus(failedAttempts === 0 ? 'connecting' : 'reconnecting')

    try {
      const apiResponse = await realtimeApi.streamRealtimeEventsRaw(
        {
          networkId,
          ...(lastEventId ? { lastEventID: lastEventId } : {}),
        },
        async ({ init }) => ({
          ...init,
          headers: { ...init.headers, Accept: 'text/event-stream' },
          signal,
        }),
      )
      const response = apiResponse.raw
      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        throw new Error('The server did not return an SSE content type.')
      }

      failedAttempts = 0
      onStatus('open')

      await consumeStream(response, signal, (frame) => {
        if (frame.retry !== null) {
          retryDelayMs = Math.min(Math.max(frame.retry, 250), 30_000)
        }
        if (frame.id !== null) lastEventId = frame.id
        if (frame.data === null) return

        const parsed: unknown = JSON.parse(frame.data)
        if (!isRealtimeEvent(parsed)) {
          throw new Error('The server emitted an invalid realtime event.')
        }
        onEvent(parsed)
      })

      if (!signal.aborted) {
        throw new Error('The SSE stream closed unexpectedly.')
      }
    } catch (error) {
      if (signal.aborted) break

      const normalizedError = new Error(await apiErrorMessage(error))
      onError?.(normalizedError)
      failedAttempts += 1
      onStatus('reconnecting')

      const backoff = Math.min(retryDelayMs * 2 ** (failedAttempts - 1), 30_000)
      await waitForRetry(backoff, signal)
    }
  }

  onStatus('closed')
}
