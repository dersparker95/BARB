import React, { useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

type SpinnerProps = {
  label?: string
  className?: string
}

const Spinner: React.FC<SpinnerProps> = ({ label, className = '' }) => {
  const { lang } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  // 🔥 ADIÓS HARDCODEO: Usamos el idioma global o un fallback seguro
  const safeLabel = label || t.common?.loading || 'Cargando...'

  return (
    <span 
      className={`spinner ${className}`.trim()} 
      role="status" 
      aria-live="polite" 
      aria-label={safeLabel}
    >
      <span className="sr-only">{safeLabel}</span>
      
      {/* 
        NOTA PARA EL EQUIPO FRONTEND: 
        Asegúrense de que la clase CSS '.spinner' exista en su index.css. 
        Si prefieren usar Tailwind directamente, pueden reemplazar la clase arriba por:
        "inline-block w-6 h-6 border-4 border-[var(--border)] border-t-[var(--blue)] rounded-full animate-spin"
      */}
    </span>
  )
}

export default Spinner