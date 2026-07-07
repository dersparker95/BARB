// =============================================================================
// IMPORTS
// =============================================================================

import React from 'react'

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
            aria-label="Cerrar"
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
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}

export default HelpModal