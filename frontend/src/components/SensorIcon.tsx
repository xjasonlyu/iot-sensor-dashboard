export type SensorIconName = 'door' | 'humidity' | 'motion' | 'temperature'

interface SensorIconProps {
  name: SensorIconName
}

export function SensorIcon({ name }: SensorIconProps) {
  const paths = {
    temperature: (
      <>
        <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" />
        <path d="M12 9v8" />
        <circle cx="12" cy="18" r="1.25" fill="currentColor" stroke="none" />
      </>
    ),
    humidity: (
      <>
        <path d="M12 3.2S6 9.6 6 14a6 6 0 0 0 12 0c0-4.4-6-10.8-6-10.8Z" />
        <path d="M9.4 15.2a3.1 3.1 0 0 0 2.8 1.8" />
      </>
    ),
    motion: (
      <>
        <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
        <path d="M8.5 8.5a5 5 0 0 0 0 7" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M5.7 5.7a9 9 0 0 0 0 12.6" />
        <path d="M18.3 5.7a9 9 0 0 1 0 12.6" />
      </>
    ),
    door: (
      <>
        <path d="M5 21V3h12v18" />
        <path d="m8 5 7-2v18l-7-2V5Z" />
        <circle cx="12.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className="sensor-icon"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  )
}
