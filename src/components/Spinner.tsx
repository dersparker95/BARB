import React from 'react'

type SpinnerProps = {
  label?: string
  className?: string
}

const Spinner: React.FC<SpinnerProps> = ({ label = 'Cargando…', className = '' }) => {
  return (
    <span className={`spinner ${className}`.trim()} role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
    </span>
  )
}

export default Spinner
