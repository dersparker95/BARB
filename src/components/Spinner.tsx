// =============================================================================
// IMPORTS
// =============================================================================

import React, { useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

// =============================================================================
// TIPOS
// =============================================================================

type SpinnerProps = {
  label?: string
  className?: string
}

// =============================================================================
// COMPONENTE PRINCIPAL: SPINNER
// =============================================================================

const Spinner: React.FC<SpinnerProps> = ({ label, className = '' }) => {
  const { lang } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  const safeLabel = label || t.common?.loading || 'Cargando...'

  return (
    <span
      className={`spinner ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={safeLabel}
    >
      <span className="sr-only">{safeLabel}</span>
    </span>
  )
}

export default Spinner