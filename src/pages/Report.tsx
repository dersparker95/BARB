import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { showToast } from '../components/Toast'
import { getTranslations, normalizeLang } from '../utils/i18n'

const Report: React.FC = () => {
  const navigate = useNavigate()

  // 🔥 BLINDAJE: Conectamos el idioma y evitamos el Spanglish
  const { selectedMachine, sessionStart, getDebugMessages, lang, apiBase, api, user } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])
  const nLang = normalizeLang(lang)

  const debugMessages = getDebugMessages(selectedMachine)
  // Extraemos automáticamente el resumen de los mensajes del usuario
  const summaryText = debugMessages.filter(m => m.role === 'user').map(m => m.content).join('\n')
  const elapsed = sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : 0

  const [isSending, setIsSending] = useState(false)

  // ⚠️ FIX: antes handleSubmit no llamaba a ningún backend — solo mostraba un
  // toast de éxito falso ("Aquí iría tu lógica futura de fetch()"). Ahora sí
  // persiste el reporte contra POST /api/reports/debug (endpoint agregado al
  // backend), usando datos reales de la sesión de debug.
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!selectedMachine) {
      showToast(nLang === 'en' ? '⚠️ No machine selected' : '⚠️ No hay máquina seleccionada')
      return
    }
    if (!user?.id) {
      showToast(nLang === 'en' ? '⚠️ Session expired, please log in again' : '⚠️ Sesión expirada, vuelve a iniciar sesión')
      return
    }
    if (!apiBase) {
      showToast(nLang === 'en' ? '⚠️ API not configured' : '⚠️ API no configurada')
      return
    }

    const form = e.currentTarget
    const formData = new FormData(form)
    const issueDescription = String(formData.get('issue_summary') || summaryText || '').trim()
    const actionsTaken = String(formData.get('actions_taken') || '').trim()
    const preventiveActions = String(formData.get('preventive_actions') || '').trim()
    const severity = String(formData.get('severity') || 'medium')

    if (!issueDescription) {
      showToast(nLang === 'en' ? '⚠️ Describe the issue before sending' : '⚠️ Describe el problema antes de enviar')
      return
    }

    setIsSending(true)
    try {
      // ⚠️ FIX: antes esto era un fetch() manual directo, sin el header
      // Authorization que ahora exige el backend (protegido por rol) y sin el
      // prefijo /api consistente. Se usa api.reports.send(), que ya adjunta
      // el token de sesión automáticamente (ver services/api.ts).
      await api.reports.send({
        maquina_id: Number(selectedMachine),
        tecnico_id: Number(user.id),
        issue_description: issueDescription,
        resolution: actionsTaken || null,
        additional_notes: preventiveActions || null,
        severity,
        downtime_minutes: elapsed > 0 ? elapsed : null,
      })

      showToast(t.common?.success || (nLang === 'en' ? '✅ Report sent to central repository' : '✅ Reporte enviado a repositorio central'))
      navigate(-1)
    } catch (error) {
      console.error('Error enviando reporte:', error)
      showToast(nLang === 'en' ? '❌ Could not send the report' : '❌ No se pudo enviar el reporte')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="report-body">
      {/* 🔥 SEMÁNTICA: Cambiamos el div por un form */}
      <form className="report-card" onSubmit={handleSubmit}>
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
            name="issue_summary"
            className="report-textarea"
            rows={4}
            placeholder={t.report?.issuePlaceholder || (nLang === 'en' ? 'Describe the issue and resolution...' : 'Describe el problema y la resolución...')}
            defaultValue={summaryText}
          />
        </div>

        <div className="report-field">
          <label>{t.report?.actionsTaken || (nLang === 'en' ? 'Actions Taken' : 'Acciones Realizadas')}</label>
          <textarea
            name="actions_taken"
            className="report-textarea"
            rows={3}
            placeholder={t.report?.actionsPlaceholder || (nLang === 'en' ? 'List actions taken...' : 'Enumera las acciones realizadas...')}
          />
        </div>

        <div className="report-field">
          <label>{t.report?.preventiveActions || (nLang === 'en' ? 'Recommended Preventive Actions' : 'Acciones Preventivas Recomendadas')}</label>
          <textarea
            name="preventive_actions"
            className="report-textarea"
            rows={3}
            placeholder={t.report?.preventivePlaceholder || (nLang === 'en' ? 'List recommended preventive actions...' : 'Enumera las acciones preventivas recomendadas...')}
          />
        </div>

        <div className="report-field">
          <label>{t.common?.severity || 'Severidad'}</label>
          <select name="severity" className="form-select form-select--md" defaultValue="medium">
            {/* 🔥 NORMALIZACIÓN: Valores en minúsculas (BD) vs Etiquetas en el idioma del usuario */}
            <option value="low">{t.common?.low || 'Baja'}</option>
            <option value="medium">{t.common?.medium || 'Media'}</option>
            <option value="high">{t.common?.high || 'Alta'}</option>
            <option value="critical">{t.common?.critical || 'Crítica'}</option>
          </select>
        </div>

        <div className="report-actions">
          <button className="btn btn-green btn-lg" type="submit" disabled={isSending}>
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