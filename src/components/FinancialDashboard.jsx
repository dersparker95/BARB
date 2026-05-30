import React, { useState, useMemo } from 'react'
import { Banknote, CheckCircle, TimerReset, Clock } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell, ReferenceLine } from 'recharts'
import useFinancialStats, { BARB_BUSINESS } from '../hooks/useFinancialStats'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

const fmtUSD = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']

function Badge({ text, type }) {
  const colors = type === 'est' ? { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6', border: '#bfdbfe' } : { bg: 'rgba(16,185,129,0.1)', text: '#10b981', border: '#a7f3d0' }
  return <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, marginLeft: 8 }}>{text}</span>
}

function StatCard({ icon: Icon, label, value, subtitle, highlightColor, badgeType, badgeText }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, display: 'flex', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</p>
          <Badge text={badgeText} type={badgeType} />
        </div>
        <div style={{ marginTop: 8, fontSize: 26, fontWeight: 900, color: highlightColor }}>{value}</div>
        <p style={{ marginTop: 4, fontSize: 11, color: 'var(--ink2)' }}>{subtitle}</p>
      </div>
      <div style={{ color: highlightColor, background: 'var(--bg-body)', padding: 10, borderRadius: 12, height: 'fit-content' }}>
        <Icon size={20} />
      </div>
    </div>
  )
}

export default function FinancialDashboard({ timeRange }) {
  const { lang } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])
  
  const { financials, trend14Days, machines, isLoading } = useFinancialStats(timeRange)
  const [machineView, setMachineView] = useState('ots')

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>{t.common.loading}</div>

  const topMachines = [...machines].sort((a, b) => b[machineView === 'ots' ? 'total' : machineView === 'ahorro' ? 'ahorroGenerado' : machineView === 'mttr' ? 'mttr' : 'slaCompliance'] - a[machineView === 'ots' ? 'total' : machineView === 'ahorro' ? 'ahorroGenerado' : machineView === 'mttr' ? 'mttr' : 'slaCompliance']).slice(0, 8)

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ background: 'linear-gradient(135deg, var(--surface) 0%, var(--bg-body) 100%)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0, color: 'var(--ink1)' }}>{t.financial.roiTitle}</h2>
          <p style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>{t.financial.roiSubtitle}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
          <div style={{ flex: '1 1 200px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700, textTransform: 'uppercase' }}>{t.financial.withoutBarb}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#ef4444', margin: '4px 0' }}>{fmtUSD(BARB_BUSINESS.ANNUAL_WITHOUT_BARB)}</div>
          </div>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 24, color: 'var(--ink3)' }}>vs</div>
          <div style={{ flex: '1 1 200px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#047857', fontWeight: 700, textTransform: 'uppercase' }}>{t.financial.withBarb}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#10b981', margin: '4px 0' }}>{fmtUSD(BARB_BUSINESS.ANNUAL_WITH_BARB)}</div>
          </div>
          <div style={{ flex: '1 1 100%', background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase' }}>{t.financial.savingsGenerated}</div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>{fmtUSD(financials.ahorro_generado)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
        <StatCard icon={TimerReset} label={t.financial.mttrGlobal} value={`${Math.round(financials.mttr)}m`} subtitle={financials.mttr > BARB_BUSINESS.SLA_TARGET ? t.financial.mttrOver(Math.round(financials.mttr - BARB_BUSINESS.SLA_TARGET)) : t.financial.mttrOptimal} highlightColor="#06b6d4" badgeType="real" badgeText={t.financial.measured} />
        <StatCard icon={CheckCircle} label={t.financial.efficiency} value={`${Math.min(100, Math.round(financials.efficiency))}%`} subtitle={t.financial.efficiencySub} highlightColor="#10b981" badgeType="est" badgeText={t.financial.estimated} />
        <StatCard icon={Banknote} label={t.financial.directCost} value={fmtUSD(financials.costo_total_acumulado)} subtitle={t.financial.directCostSub} highlightColor="#ef4444" badgeType="real" badgeText={t.financial.measured} />
        <StatCard icon={Clock} label={t.financial.mtbf} value={financials.mtbfHours !== null ? `${financials.mtbfHours} h` : '—'} subtitle={financials.mtbfHours !== null ? t.financial.mtbfSub : t.financial.mtbfNeedData} highlightColor="#8b5cf6" badgeType="real" badgeText={t.financial.measured} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {trend14Days.length > 0 && (
          <div style={{ flex: '1 1 400px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink1)', marginBottom: 4 }}>{t.financial.healthTitle}</h3>
            <p style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 16 }}>{t.financial.healthSub}</p>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend14Days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAbiertas" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorCerradas" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--ink3)' }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--ink3)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Area type="monotone" dataKey="abiertas" stroke="#f59e0b" fill="url(#colorAbiertas)" strokeWidth={2} />
                  <Area type="monotone" dataKey="cerradas" stroke="#10b981" fill="url(#colorCerradas)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}