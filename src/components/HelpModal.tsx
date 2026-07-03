import React from 'react'

interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  content: string
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, title, content }) => {
  if (!isOpen) return null

  return (
    <div
      className="modal-overlay open"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="modal-box">

        {/* Cabecera idéntica a SettingsModal */}
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

        {/* Cuerpo del modal usando tus clases de tipografía */}
        <div className="modal-body">
          <div className="settings-section">
            <div className="help-modal-content">
              {content}
            </div>
          </div>
        </div>

        {/* Footer usando tu clase btn-primary */}
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