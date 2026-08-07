import { useEffect, useState } from 'react'
import {
  streamRealtimeEvents,
  type RealtimeEvent,
  type RealtimeStatus,
} from '../api/sse'

interface UseRealtimeEventsOptions {
  networkId: number
  onEvent: (event: RealtimeEvent) => void
}

export function useRealtimeEvents({
  networkId,
  onEvent,
}: UseRealtimeEventsOptions): {
  status: RealtimeStatus
  error: string | null
} {
  const [status, setStatus] = useState<RealtimeStatus>('connecting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void streamRealtimeEvents({
      networkId,
      signal: controller.signal,
      onEvent,
      onStatus: (nextStatus) => {
        setStatus(nextStatus)
        if (nextStatus === 'open') setError(null)
      },
      onError: (streamError) => setError(streamError.message),
    })

    return () => controller.abort()
  }, [networkId, onEvent])

  return { status, error }
}
