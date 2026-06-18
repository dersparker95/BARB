import React from 'react'
import { useAppContext } from '../context/AppContext'

interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  content: string
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, title, content }) => {
  // 🔥 Importamos el estado "dark" directamente de tu contexto
  const { dark } = useAppContext()

  if (!isOpen) return null

  return (
    <div 
      className="modal-overlay open" 
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className={`modal-box ${dark ? 'bg-slate-900 text-gray-100 border border-slate-700' : ''}`}>
        
        {/* Cabecera idéntica a SettingsModal */}
        <div className="modal-header">
          <h2 className={dark ? 'text-gray-100' : ''}>{title}</h2>
          <button
            className={`modal-close ${dark ? 'bg-slate-700 text-gray-100' : ''}`}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo del modal usando tus clases de tipografía */}
        <div className="modal-body">
          <div className="settings-section">
            <div className={`text-sm leading-relaxed ${dark ? 'text-gray-200' : 'text-gray-700'}`}>
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