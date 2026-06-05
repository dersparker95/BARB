import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { showToast } from '../components/Toast'
import { getTranslations, normalizeLang } from '../utils/i18n'

const Report: React.FC = () => {
  const navigate = useNavigate()
  
  // 🔥 BLINDAJE: Conectamos el idioma y evitamos el Spanglish
  const { selectedMachine, sessionStart, getDebugMessages, lang } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])
  const nLang = normalizeLang(lang)

  const debugMessages = getDebugMessages(selectedMachine)
  // Extraemos automáticamente el resumen de los mensajes del usuario
  const summaryText = debugMessages.filter(m => m.role === 'user').map(m => m.content).join('\n')
  const elapsed = sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : 0

  // 🔥 MEJORA: Manejador de envío nativo para interceptar el formulario completo
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Aquí iría tu lógica futura de fetch() para guardar en la BD.
    // Por ahora, simulamos el éxito usando traducciones.
    showToast(t.common?.success || (nLang === 'en' ? '✅ Report sent to central repository' : '✅ Reporte enviado a repositorio central'))
    navigate(-1)
  }

  return (
    <div className="report-body w-full">
      {/* 🔥 SEMÁNTICA: Cambiamos el div por un form */}
      <form className="report-card mx-auto shadow-soft" onSubmit={handleSubmit}>
        <h2>{t.report?.title || (nLang === 'en' ? 'Debug Session Report' : 'Reporte de Diagnóstico')}</h2>
        
        <div className="report-field">
          <label>{t.common?.machine || 'Máquina'}</label>
          <div className="rfield-val">{selectedMachine || '—'}</div>
        </div>
        
        <div className="report-field">
          <label>{t.report?.sessionDuration || (nLang === 'en' ? 'Session Duration' : 'Duración de Sesión')}</label>
          <div className="rfield-val">
            {elapsed > 0 
              ? `${elapsed} ${t.common?.minutes || 'minutos'}` 
              : (t.report?.activeSession || (nLang === 'en' ? 'Active session' : 'Sesión activa'))}
          </div>
        </div>
        
        <div className="report-field">
          <label>{t.report?.issueSummary || (nLang === 'en' ? 'Issue Summary' : 'Resumen del Problema')}</label>
          <textarea 
            className="report-textarea" 
            rows={4} 
            placeholder={t.report?.issuePlaceholder || (nLang === 'en' ? 'Describe the issue and resolution...' : 'Describe el problema y la resolución...')} 
            defaultValue={summaryText}
          />
        </div>
        
        <div className="report-field">
          <label>{t.report?.actionsTaken || (nLang === 'en' ? 'Actions Taken' : 'Acciones Realizadas')}</label>
          <textarea 
            className="report-textarea" 
            rows={3} 
            placeholder={t.report?.actionsPlaceholder || (nLang === 'en' ? 'List actions taken...' : 'Enumera las acciones realizadas...')}
          />
        </div>
        
        <div className="report-field">
          <label>{t.report?.preventiveActions || (nLang === 'en' ? 'Recommended Preventive Actions' : 'Acciones Preventivas Recomendadas')}</label>
          <textarea 
            className="report-textarea" 
            rows={3} 
            placeholder={t.report?.preventivePlaceholder || (nLang === 'en' ? 'List recommended preventive actions...' : 'Enumera las acciones preventivas recomendadas...')}
          />
        </div>
        
        <div className="report-field">
          <label>{t.common?.severity || 'Severidad'}</label>
          <select className="form-select" style={{ maxWidth: '200px' }}>
            {/* 🔥 NORMALIZACIÓN: Valores en minúsculas (BD) vs Etiquetas en el idioma del usuario */}
            <option value="low">{t.common?.low || 'Baja'}</option>
            <option value="medium">{t.common?.medium || 'Media'}</option>
            <option value="high">{t.common?.high || 'Alta'}</option>
            <option value="critical">{t.common?.critical || 'Crítica'}</option>
          </select>
        </div>
        
        <div className="report-actions mt-4">
          <button className="btn btn-green btn-lg" type="submit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {t.report?.sendToRepository || (nLang === 'en' ? 'Send to Repository' : 'Enviar al Repositorio')}
          </button>
          <button className="btn btn-outline" type="button" onClick={() => navigate(-1)}>
            {t.report?.backToDebug || (nLang === 'en' ? 'Back to Debug' : 'Volver al Diagnóstico')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default Report