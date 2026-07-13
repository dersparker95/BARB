// @ts-nocheck

// =============================================================================
// IMPORTS
// =============================================================================

import React, { useState, useMemo } from 'react'
import { Banknote, CheckCircle, TimerReset, Clock } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell, ResponsiveContainer } from 'recharts'
import useFinancialStats, { BARB_BUSINESS } from '../hooks/useFinancialStats'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

// =============================================================================
// UTILIDADES Y CONSTANTES
// =============================================================================

const fmtUSD = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0)

// Paleta de gráficos: usa tokens del Design System en vez de hex, ya que recharts
// acepta var() como valor válido de stroke/fill en sus props SVG.
const CHART_COLORS = ['var(--blue)', 'var(--green)', 'var(--amber)', 'var(--purple)', 'var(--red)', 'var(--cyan)']

// =============================================================================
// SUBCOMPONENTES
// =============================================================================

function Badge({ text, type }) {
  return <span className={`fin-badge ${type === 'est' ? 'fin-badge--est' : 'fin-badge--real'}`}>{text}</span>
}

function StatCard({ icon: Icon, label, value, subtitle, colorVariant, badgeType, badgeText }) {
  return (
    <div className={`fin-stat-card fin-stat--${colorVariant}`}>
      <div className="fin-stat-body">
        <div className="fin-stat-head">
          <p className="fin-stat-label">{label}</p>
          <Badge text={badgeText} type={badgeType} />
        </div>
        <div className="fin-stat-value">{value}</div>
        <p className="fin-stat-sub">{subtitle}</p>
      </div>
      <div className="fin-stat-icon">
        <Icon size={20} />
      </div>
    </div>
  )
}

// =============================================================================
// COMPONENTE PRINCIPAL: FINANCIAL DASHBOARD
// =============================================================================

export default function FinancialDashboard({ timeRange }) {
  const { lang, api } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  // ---------------------------------------------------------------------
  // Datos y estado derivado
  // ---------------------------------------------------------------------

  const { financials, trend14Days, machines, isLoading } = useFinancialStats(timeRange, api)
  const [machineView, setMachineView] = useState('ots')

  const topMachines = useMemo(() => {
    const safeMachines = Array.isArray(machines) ? machines : []
    return [...safeMachines].sort((a, b) => {
      const valA = a[machineView === 'ots' ? 'total' : machineView === 'ahorro' ? 'ahorroGenerado' : machineView === 'mttr' ? 'mttr' : 'slaCompliance'] || 0
      const valB = b[machineView === 'ots' ? 'total' : machineView === 'ahorro' ? 'ahorroGenerado' : machineView === 'mttr' ? 'mttr' : 'slaCompliance'] || 0
      return valB - valA
    }).slice(0, 8)
  }, [machines, machineView])

  const safeMttr = Math.round(financials?.mttr || 0)
  const safeEfficiency = Math.min(100, Math.round(financials?.efficiency || 0))
  const safeAhorro = financials?.ahorro_generado || 0
  const safeCosto = financials?.costo_total_acumulado || 0
  const slaTarget = BARB_BUSINESS?.SLA_TARGET || 24

  const mttrSubtitle = safeMttr > slaTarget && typeof t.financial?.mttrOver === 'function'
    ? t.financial.mttrOver(Math.round(safeMttr - slaTarget))
    : (t.financial?.mttrOptimal || 'Óptimo')

  if (isLoading) return <div className="fin-loading">{t.common?.loading || 'Cargando...'}</div>

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  return (
    <section className="fin-section">
      <div className="fin-roi-card">
        <div className="fin-roi-header">
          <h2 className="fin-roi-title">{t.financial?.roiTitle || 'ROI'}</h2>
          <p className="fin-roi-subtitle">{t.financial?.roiSubtitle || 'Impacto Financiero'}</p>
        </div>
        <div className="fin-roi-compare">
          <div className="fin-roi-box fin-roi-box--without">
            <div className="fin-roi-box-label">{t.financial?.withoutBarb || 'Sin BARB'}</div>
            <div className="fin-roi-box-value">{fmtUSD(BARB_BUSINESS?.ANNUAL_WITHOUT_BARB)}</div>
          </div>
          <div className="fin-roi-vs">vs</div>
          <div className="fin-roi-box fin-roi-box--with">
            <div className="fin-roi-box-label">{t.financial?.withBarb || 'Con BARB'}</div>
            <div className="fin-roi-box-value">{fmtUSD(BARB_BUSINESS?.ANNUAL_WITH_BARB)}</div>
          </div>
          <div className="fin-roi-total">
            <div className="fin-roi-total-label">{t.financial?.savingsGenerated || 'Ahorro Generado'}</div>
            <div className="fin-roi-total-value">{fmtUSD(safeAhorro)}</div>
          </div>
        </div>
      </div>

      <div className="fin-stats-grid">
        <StatCard
          icon={TimerReset}
          label={t.financial?.mttrGlobal || 'MTTR'}
          value={`${safeMttr}m`}
          subtitle={mttrSubtitle}
          colorVariant="cyan"
          badgeType="real"
          badgeText={t.financial?.measured || 'Real'}
        />
        <StatCard
          icon={CheckCircle}
          label={t.financial?.efficiency || 'Eficiencia'}
          value={`${safeEfficiency}%`}
          subtitle={t.financial?.efficiencySub || 'Óptimo dentro de SLA'}
          colorVariant="green"
          badgeType="real"
          badgeText={t.financial?.measured || 'Real'}
        />
        <StatCard
          icon={Banknote}
          label={t.financial?.directCost || 'Costo Directo'}
          value={fmtUSD(safeCosto)}
          subtitle={t.financial?.directCostSub || 'Acumulado'}
          colorVariant="red"
          badgeType="real"
          badgeText={t.financial?.measured || 'Real'}
        />
        <StatCard
          icon={Clock}
          label={t.financial?.mtbf || 'MTBF'}
          value={financials?.mtbfHours ? `${financials.mtbfHours} h` : '—'}
          subtitle={financials?.mtbfHours ? (t.financial?.mtbfSub || 'Promedio') : (t.financial?.mtbfNeedData || 'Faltan datos')}
          colorVariant="purple"
          badgeType="real"
          badgeText={t.financial?.measured || 'Real'}
        />
      </div>

      <div className="fin-charts-row">

        {trend14Days && trend14Days.length > 0 && (
          <div className="fin-chart-card">
            <h3 className="fin-chart-title">{t.financial?.healthTitle || 'Tendencias'}</h3>
            <p className="fin-chart-subtitle">{t.financial?.healthSub || 'Últimos 14 días'}</p>
            <div className="fin-chart-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trend14Days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAbiertas" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--amber)" stopOpacity={0.3}/><stop offset="95%" stopColor="var(--amber)" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorCerradas" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--green)" stopOpacity={0.3}/><stop offset="95%" stopColor="var(--green)" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--ink3)' }} tickFormatter={v => v ? v.slice(5) : ''} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--ink3)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Area type="monotone" dataKey="abiertas" stroke="var(--amber)" fill="url(#colorAbiertas)" strokeWidth={2} />
                  <Area type="monotone" dataKey="cerradas" stroke="var(--green)" fill="url(#colorCerradas)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {topMachines && topMachines.length > 0 && (
          <div className="fin-chart-card">
            <div className="fin-chart-header">
              <div>
                <h3 className="fin-chart-title">{t.financial?.topMachinesTitle || 'Top Equipos'}</h3>
                <p className="fin-chart-subtitle">{t.financial?.topMachinesSubtitle || 'Rendimiento por métrica'}</p>
              </div>
              <select
                value={machineView}
                onChange={e => setMachineView(e.target.value)}
                className="filter-select"
              >
                <option value="ots">{t.financial?.viewOts || 'Volumen OTs'}</option>
                <option value="mttr">{t.financial?.viewMttr || 'MTTR (Minutos)'}</option>
                <option value="ahorro">{t.financial?.viewAhorro || 'Ahorro Generado'}</option>
              </select>
            </div>

            <div className="fin-chart-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topMachines} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--ink3)' }} hide />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--ink)' }} width={90} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface2)' }}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar
                    dataKey={machineView === 'ots' ? 'total' : machineView === 'ahorro' ? 'ahorroGenerado' : 'mttr'}
                    radius={[0, 4, 4, 0]}
                    barSize={16}
                  >
                    {topMachines.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

      </div>
    </section>
  )
}