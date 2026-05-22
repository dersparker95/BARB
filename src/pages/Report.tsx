import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { showToast } from '../components/Toast'

const Report: React.FC = () => {
  const navigate = useNavigate()
  const { selectedMachine, sessionStart, getDebugMessages } = useAppContext()

  const debugMessages = getDebugMessages(selectedMachine)
  const summaryText = debugMessages.filter(m => m.role === 'user').map(m => m.content).join('\n')
  const elapsed = sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : 0

  return (
    <div className="report-body w-full">
      <div className="report-card mx-auto">
        <h2>Debug Session Report</h2>
        <div className="report-field">
          <label>Machine</label>
          <div className="rfield-val">{selectedMachine || '—'}</div>
        </div>
        <div className="report-field">
          <label>Session Duration</label>
          <div className="rfield-val">{elapsed > 0 ? `${elapsed} minutes` : 'Active session'}</div>
        </div>
        <div className="report-field">
          <label>Issue Summary</label>
          <textarea className="report-textarea" rows={4} placeholder="Describe the issue and resolution..." defaultValue={summaryText}></textarea>
        </div>
        <div className="report-field">
          <label>Actions Taken</label>
          <textarea className="report-textarea" rows={3} placeholder="List actions taken..."></textarea>
        </div>
        <div className="report-field">
          <label>Recommended Preventive Actions</label>
          <textarea className="report-textarea" rows={3} placeholder="List recommended preventive actions..."></textarea>
        </div>
        <div className="report-field">
          <label>Severity</label>
          <select className="form-select" style={{ maxWidth: '200px' }}>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Critical</option>
          </select>
        </div>
        <div className="report-actions mt-4">
          <button className="btn btn-green btn-lg" onClick={() => { showToast('✅ Reporte enviado a repositorio central'); navigate(-1) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Send to Repository
          </button>
          <button className="btn btn-outline" onClick={() => navigate(-1)}>Back to Debug</button>
        </div>
      </div>
    </div>
  )
}

export default Report
