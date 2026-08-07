import type { components } from '@iot-dashboard/api-contract'

export type TimeRange = components['schemas']['TimeRange']

export const RANGE_MILLISECONDS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1_000,
  '6h': 6 * 60 * 60 * 1_000,
  '24h': 24 * 60 * 60 * 1_000,
  '7d': 7 * 24 * 60 * 60 * 1_000,
  '30d': 30 * 24 * 60 * 60 * 1_000,
}

export const RANGE_INTERVALS: Record<
  TimeRange,
  components['schemas']['Interval']
> = {
  '1h': '1m',
  '6h': '5m',
  '24h': '15m',
  '7d': '1h',
  '30d': '1d',
}

export const RANGE_BUCKET_MILLISECONDS: Record<TimeRange, number> = {
  '1h': 60 * 1_000,
  '6h': 5 * 60 * 1_000,
  '24h': 15 * 60 * 1_000,
  '7d': 60 * 60 * 1_000,
  '30d': 24 * 60 * 60 * 1_000,
}
