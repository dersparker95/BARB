// =============================================================================
// IMPORTS
// =============================================================================

import React, { useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

// =============================================================================
// TIPOS
// =============================================================================

interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  content: string
}

// =============================================================================
// COMPONENTE PRINCIPAL: HELP MODAL
// =============================================================================

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, title, content }) => {
  const { lang } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  if (!isOpen) return null

  return (
    <div
      className="modal-overlay open"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="modal-box">

        {/* Reutiliza la misma estructura de cabecera que SettingsModal para mantener consistencia visual. */}
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={t.common?.close || 'Cerrar'}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <div className="help-modal-content">
              {content}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-primary"
            onClick={onClose}
          >
            {t.common?.understood || 'Entendido'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default HelpModal