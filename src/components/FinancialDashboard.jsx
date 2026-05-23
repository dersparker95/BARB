import React, { useMemo } from 'react'
import { AlertTriangle, Banknote, RefreshCcw, TimerReset } from 'lucide-react'
import useFinancialStats from '../hooks/useFinancialStats'

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('es-CL', {
  maximumFractionDigits: 0,
})

function StatCard({ icon: Icon, label, value, subtitle, accent = 'text-slate-100', border = 'border-slate-700' }) {
  return (
    <div className={`rounded-2xl border ${border} bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.25)]`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p>
          <div className={`mt-3 text-3xl font-black ${accent} sm:text-4xl`}>{value}</div>
          <p className="mt-2 text-sm leading-5 text-slate-400">{subtitle}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-100">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.25)]">
      <div className="h-3 w-28 animate-pulse rounded bg-slate-700" />
      <div className="mt-4 h-10 w-40 animate-pulse rounded bg-slate-700" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-800" />
      <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-slate-800" />
    </div>
  )
}

export default function FinancialDashboard() {
  const { stats, isLoading, error, refetch } = useFinancialStats()

  const cards = useMemo(
    () => [
      {
        label: 'MTTR',
        value: `${numberFormatter.format(stats.mttr)} min`,
        subtitle: 'Tiempo medio de reparación para órdenes completadas.',
        icon: TimerReset,
        accent: 'text-cyan-300',
        border: 'border-cyan-900/60',
      },
      {
        label: 'Costo total acumulado',
        value: usdFormatter.format(stats.costo_total_acumulado),
        subtitle: 'Suma total de costo real en órdenes finalizadas.',
        icon: Banknote,
        accent: 'text-emerald-300',
        border: 'border-emerald-900/60',
      },
      {
        label: 'Ahorro estimado',
        value: usdFormatter.format(stats.ahorro_estimado),
        subtitle: 'Impacto potencial por downtime evitado en producción.',
        icon: RefreshCcw,
        accent: 'text-amber-300',
        border: 'border-amber-900/60',
      },
    ],
    [stats],
  )

  return (
    <section className="w-full rounded-3xl border border-slate-700 bg-slate-950 p-4 text-slate-100 shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">BARB Financial Impact</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Impacto financiero industrial</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            KPIs calculados desde la tabla <span className="font-semibold text-slate-200">orden_trabajo</span> para
            monitorear reparación, costo real y ahorro estimado.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
        >
          <RefreshCcw className="h-4 w-4" />
          Refrescar
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-700 bg-red-950/80 p-5 text-red-100 shadow-[0_18px_40px_rgba(0,0,0,0.25)]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-900/80 text-red-200">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold">No se pudo cargar el panel financiero</h3>
              <p className="mt-1 text-sm leading-6 text-red-200">{error}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-red-300">
                La app sigue funcionando; este módulo quedó aislado.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map(card => (
            <StatCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              subtitle={card.subtitle}
              accent={card.accent}
              border={card.border}
            />
          ))}
        </div>
      )}
    </section>
  )
}
