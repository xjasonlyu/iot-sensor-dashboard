import { useMemo } from 'react'
import type { ActivityPoint, Reading } from '@iot-dashboard/api-contract'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  RANGE_BUCKET_MILLISECONDS,
  RANGE_MILLISECONDS,
  type TimeRange,
} from '../timeRanges'

type ClimateChartPoint = {
  humidity?: number
  temperature?: number
  timestamp: number
}
type ActivityChartPoint = {
  activity: number
  networkId: number
  timestamp: number
}

interface TimeChartProps {
  range: TimeRange
  windowEnd: number
}

interface ClimateChartProps extends TimeChartProps {
  humidity: Reading[]
  temperature: Reading[]
}

interface ActivityChartProps extends TimeChartProps {
  activity: ActivityPoint[]
}

function formatAxisTime(value: number, range: TimeRange): string {
  const date = new Date(value)
  if (range === '7d' || range === '30d') {
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
  }
  if (range === '24h') {
    return date.toLocaleString([], { hour: 'numeric', weekday: 'short' })
  }
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatTooltipTime(value: unknown): string {
  return new Date(Number(value)).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function buildTimeTicks(
  range: TimeRange,
  windowStart: number,
  windowEnd: number,
): number[] {
  if (range === '7d' || range === '30d') {
    const tick = new Date(windowStart)
    tick.setHours(0, 0, 0, 0)
    tick.setDate(tick.getDate() + 1)
    const dayStep = range === '30d' ? 5 : 1
    const ticks: number[] = []
    while (tick.getTime() <= windowEnd) {
      ticks.push(tick.getTime())
      tick.setDate(tick.getDate() + dayStep)
    }
    return ticks
  }

  const step =
    range === '1h'
      ? 10 * 60 * 1_000
      : range === '6h'
        ? 60 * 60 * 1_000
        : 4 * 60 * 60 * 1_000
  const firstTick = Math.ceil(windowStart / step) * step
  const ticks: number[] = []
  for (let tick = firstTick; tick <= windowEnd; tick += step) ticks.push(tick)
  return ticks
}

function coverageLabel(
  firstTimestamp: number | undefined,
  windowStart: number,
  range: TimeRange,
): string | null {
  if (
    firstTimestamp === undefined ||
    firstTimestamp - windowStart < RANGE_MILLISECONDS[range] * 0.1
  ) {
    return null
  }
  const date = new Date(firstTimestamp)
  const formatted =
    range === '7d' || range === '30d'
      ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
      : range === '24h'
        ? date.toLocaleString([], {
            hour: 'numeric',
            minute: '2-digit',
            weekday: 'short',
          })
        : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `Data available since ${formatted}`
}

function bucketTimestamp(timestamp: string, range: TimeRange): number {
  const parsed = Date.parse(timestamp)
  const duration = RANGE_BUCKET_MILLISECONDS[range]
  return Math.floor(parsed / duration) * duration
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  return Math.round(mean * 100) / 100
}

function smoothClimateTrend(
  points: ClimateChartPoint[],
  range: TimeRange,
): ClimateChartPoint[] {
  if (range !== '1h') return points
  const duration = RANGE_BUCKET_MILLISECONDS[range]

  return points.map((point, index) => {
    const recent = points
      .slice(Math.max(0, index - 2), index + 1)
      .filter((candidate) => point.timestamp - candidate.timestamp <= duration * 2)
    const temperatureValues = recent.flatMap((candidate) =>
      candidate.temperature === undefined ? [] : [candidate.temperature],
    )
    const humidityValues = recent.flatMap((candidate) =>
      candidate.humidity === undefined ? [] : [candidate.humidity],
    )

    return {
      ...(point.temperature === undefined
        ? {}
        : { temperature: average(temperatureValues) ?? point.temperature }),
      ...(point.humidity === undefined
        ? {}
        : { humidity: average(humidityValues) ?? point.humidity }),
      timestamp: point.timestamp,
    }
  })
}

function smoothActivityTrend(
  points: ActivityChartPoint[],
  range: TimeRange,
): ActivityChartPoint[] {
  if (range !== '1h') return points
  const duration = RANGE_BUCKET_MILLISECONDS[range]

  return points.map((point, index) => {
    const recent = points
      .slice(Math.max(0, index - 2), index + 1)
      .filter((candidate) => point.timestamp - candidate.timestamp <= duration * 2)
    return {
      ...point,
      activity: average(recent.map((candidate) => candidate.activity)) ?? point.activity,
    }
  })
}

export function ClimateChart({
  humidity,
  range,
  temperature,
  windowEnd,
}: ClimateChartProps) {
  const data = useMemo(() => {
    const points = new Map<
      number,
      {
        humidityCount: number
        humiditySum: number
        temperatureCount: number
        temperatureSum: number
        timestamp: number
      }
    >()

    for (const reading of [...temperature, ...humidity]) {
      const timestamp = bucketTimestamp(reading.timestamp, range)
      const point = points.get(timestamp) ?? {
        humidityCount: 0,
        humiditySum: 0,
        temperatureCount: 0,
        temperatureSum: 0,
        timestamp,
      }
      if (reading.metric === 'temperature') {
        point.temperatureCount += 1
        point.temperatureSum += reading.value
      } else {
        point.humidityCount += 1
        point.humiditySum += reading.value
      }
      points.set(timestamp, point)
    }

    const bucketed = [...points.values()]
      .map((point) => ({
        ...(point.humidityCount > 0
          ? { humidity: point.humiditySum / point.humidityCount }
          : {}),
        ...(point.temperatureCount > 0
          ? { temperature: point.temperatureSum / point.temperatureCount }
          : {}),
        timestamp: point.timestamp,
      }))
      .sort((left, right) => left.timestamp - right.timestamp)
    return smoothClimateTrend(bucketed, range)
  }, [humidity, range, temperature])
  const windowStart = windowEnd - RANGE_MILLISECONDS[range]
  const ticks = buildTimeTicks(range, windowStart, windowEnd)
  const coverage = coverageLabel(data.at(0)?.timestamp, windowStart, range)

  if (data.length === 0) {
    return <div className="chart-empty">Waiting for climate readings…</div>
  }

  return (
    <div className="chart" aria-label="Temperature and humidity history chart">
      {coverage && <span className="chart__coverage">{coverage}</span>}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 0, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#e9edf3" strokeDasharray="4 4" vertical={false} />
          <XAxis
            allowDataOverflow
            axisLine={false}
            dataKey="timestamp"
            domain={[windowStart, windowEnd]}
            minTickGap={30}
            scale="time"
            tick={{ fill: '#667287', fontSize: 11 }}
            tickFormatter={(value: number) => formatAxisTime(value, range)}
            tickLine={false}
            ticks={ticks}
            type="number"
          />
          <YAxis
            axisLine={false}
            domain={['dataMin - 1', 'dataMax + 1']}
            tick={{ fill: '#667287', fontSize: 11 }}
            tickFormatter={(value: number) => value.toFixed(1)}
            tickLine={false}
            unit="°"
            yAxisId="temperature"
          />
          <YAxis
            axisLine={false}
            domain={[0, 100]}
            hide
            orientation="right"
            yAxisId="humidity"
          />
          <Tooltip
            contentStyle={{
              background: '#111827',
              border: 0,
              borderRadius: 12,
              color: '#fff',
            }}
            formatter={(value, name) => {
              const numericValue = Number(value ?? 0)
              return name === 'Temperature °C'
                ? [`${numericValue.toFixed(1)} °C`, 'Temperature']
                : [`${numericValue.toFixed(0)}%`, 'Humidity']
            }}
            labelFormatter={formatTooltipTime}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          <Line
            activeDot={{ r: 5 }}
            dataKey="temperature"
            dot={false}
            isAnimationActive={false}
            name="Temperature °C"
            stroke="#d96824"
            strokeWidth={2.5}
            type="monotone"
            yAxisId="temperature"
          />
          <Line
            activeDot={{ r: 5 }}
            dataKey="humidity"
            dot={false}
            isAnimationActive={false}
            name="Humidity %"
            stroke="#256edb"
            strokeDasharray="6 4"
            strokeWidth={2.5}
            type="monotone"
            yAxisId="humidity"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ActivityChart({ activity, range, windowEnd }: ActivityChartProps) {
  const data = useMemo(() => {
    const buckets = new Map<
      number,
      { count: number; networkId: number; sum: number; timestamp: number }
    >()
    for (const point of activity) {
      const timestamp = bucketTimestamp(point.timestamp, range)
      const bucket = buckets.get(timestamp) ?? {
        count: 0,
        networkId: point.networkId,
        sum: 0,
        timestamp,
      }
      bucket.count += 1
      bucket.sum += point.activity
      buckets.set(timestamp, bucket)
    }
    const bucketed = [...buckets.values()]
      .map((bucket) => ({
        activity: bucket.sum / bucket.count,
        networkId: bucket.networkId,
        timestamp: bucket.timestamp,
      }))
      .sort((left, right) => left.timestamp - right.timestamp)
    return smoothActivityTrend(bucketed, range)
  }, [activity, range])
  const windowStart = windowEnd - RANGE_MILLISECONDS[range]
  const ticks = buildTimeTicks(range, windowStart, windowEnd)
  const coverage = coverageLabel(data.at(0)?.timestamp, windowStart, range)

  if (data.length === 0) {
    return <div className="chart-empty">Waiting for motion activity…</div>
  }

  return (
    <div className="chart" aria-label="Motion activity history chart">
      {coverage && <span className="chart__coverage">{coverage}</span>}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#138a61" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#138a61" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e9edf3" strokeDasharray="4 4" vertical={false} />
          <XAxis
            allowDataOverflow
            axisLine={false}
            dataKey="timestamp"
            domain={[windowStart, windowEnd]}
            minTickGap={30}
            scale="time"
            tick={{ fill: '#667287', fontSize: 11 }}
            tickFormatter={(value: number) => formatAxisTime(value, range)}
            tickLine={false}
            ticks={ticks}
            type="number"
          />
          <YAxis
            axisLine={false}
            domain={[0, 1]}
            tick={{ fill: '#667287', fontSize: 11 }}
            tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#111827',
              border: 0,
              borderRadius: 12,
              color: '#fff',
            }}
            formatter={(value) => [
              `${Math.round(Number(value ?? 0) * 100)}%`,
              'Activity',
            ]}
            labelFormatter={formatTooltipTime}
          />
          <Area
            dataKey="activity"
            fill="url(#activity-fill)"
            isAnimationActive={false}
            stroke="#138a61"
            strokeWidth={2.5}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
