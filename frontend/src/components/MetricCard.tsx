import { SensorIcon, type SensorIconName } from './SensorIcon'

interface MetricCardProps {
  accent: 'blue' | 'green' | 'orange' | 'violet'
  detail: string
  icon: SensorIconName
  label: string
  unit?: string
  value: string
}

export function MetricCard({
  accent,
  detail,
  icon,
  label,
  unit,
  value,
}: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${accent}`}>
      <div className="metric-card__heading">
        <span className="metric-card__icon" aria-hidden="true">
          <SensorIcon name={icon} />
        </span>
        <p>{label}</p>
      </div>
      <p className="metric-card__value">
        {value}
        {unit && <span>{unit}</span>}
      </p>
      <p className="metric-card__detail">{detail}</p>
    </article>
  )
}
