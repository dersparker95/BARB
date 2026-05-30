import { useCallback, useEffect, useState } from 'react'

const API_BASE = ((import.meta.env.VITE_API_URL) ?? 'http://localhost:9000/api').replace(/\/$/, '')

export const BARB_BUSINESS = {
  COST_PER_MIN: 2000,
  SLA_TARGET: 45,
  WORST_CASE: 180,
  ANNUAL_WITHOUT_BARB: 8640000,
  ANNUAL_WITH_BARB: 2160000,
  PROJECTED_SAVINGS: 6480000,
}

function processMetricsLocal(workOrders, machineList, timeRangeDays) {
  const now = Date.now()
  const cutoffDate = timeRangeDays !== 'all' ? new Date(now - timeRangeDays * 24 * 60 * 60 * 1000).getTime() : 0

  const filteredOrders = workOrders.filter(wo => {
    const created = new Date(wo.createdAt || wo.created_at || wo.fecha_creacion || 0).getTime()
    return created >= cutoffDate
  })

  let duraciones = []
  let realCostSum = 0
  let totalSavings = 0
  let slaCompliantCount = 0

  const trendsMap = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().split('T')[0]
    trendsMap[d] = { date: d, abiertas: 0, cerradas: 0 }
  }

  const machineMap = {}
  machineList.forEach(m => {
    machineMap[String(m.id)] = { id: String(m.id), name: m.name, total: 0, activas: 0, resueltas: 0, costoReal: 0, duraciones: [], slaMet: 0, failureDates: [] }
  })

  filteredOrders.forEach(wo => {
    const mId = String(wo.machineId || wo.machine_id || wo.maquina_id || '')
    if (!machineMap[mId]) machineMap[mId] = { id: mId, name: wo.machine_name || 'Desconocida', total: 0, activas: 0, resueltas: 0, costoReal: 0, duraciones: [], slaMet: 0, failureDates: [] }
    
    const entry = machineMap[mId]
    entry.total++

    const cAt = new Date(wo.createdAt || wo.created_at || wo.fecha_creacion).getTime()
    if (!isNaN(cAt)) entry.failureDates.push(cAt)

    const status = (wo.status || wo.estado || '').toLowerCase().replace(' ', '_')
    const createdStr = new Date(cAt).toISOString().split('T')[0]
    const closedDateData = wo.closedAt || wo.closed_at || wo.fecha_cierre
    const closedStr = closedDateData ? new Date(closedDateData).toISOString().split('T')[0] : ''

    if (trendsMap[createdStr]) trendsMap[createdStr].abiertas++

    if (['open', 'in_progress', 'pending', 'assigned'].includes(status)) {
      entry.activas++
    } else if (closedDateData || status === 'completed') {
      entry.resueltas++
      if (trendsMap[closedStr]) trendsMap[closedStr].cerradas++

      let durationMin = 0
      if (wo.downtime_minutes != null) {
        durationMin = Number(wo.downtime_minutes)
      } else {
        const endAt = new Date(closedDateData).getTime()
        if (!isNaN(cAt) && !isNaN(endAt)) durationMin = Math.max(0, Math.round((endAt - cAt) / 60000))
      }

      duraciones.push(durationMin)
      entry.duraciones.push(durationMin)
      
      if (durationMin <= BARB_BUSINESS.SLA_TARGET) {
        slaCompliantCount++
        entry.slaMet++
      }
      totalSavings += Math.max(0, (BARB_BUSINESS.WORST_CASE - durationMin) * BARB_BUSINESS.COST_PER_MIN)
    }
    const costReal = Number(wo.costoReal || wo.costo_real || 0)
    entry.costoReal += costReal
    realCostSum += costReal
  })

  // CÁLCULO MATEMÁTICO REAL DE MTBF (Cero Hardcodeo)
  let totalMtbfHours = 0
  let mtbfValidMachines = 0

  Object.values(machineMap).forEach(entry => {
    if (entry.failureDates.length >= 2) {
      const sortedDates = entry.failureDates.sort((a, b) => a - b)
      let diffSum = 0
      for (let i = 1; i < sortedDates.length; i++) {
        diffSum += (sortedDates[i] - sortedDates[i - 1])
      }
      const avgMs = diffSum / (sortedDates.length - 1)
      entry.mtbfHours = Math.round(avgMs / 3600000) // Convertir MS a Horas
      totalMtbfHours += entry.mtbfHours
      mtbfValidMachines++
    } else {
      entry.mtbfHours = null
    }
  })

  const globalMtbf = mtbfValidMachines > 0 ? Math.round(totalMtbfHours / mtbfValidMachines) : null
  const globalMttr = duraciones.length ? duraciones.reduce((a, b) => a + b, 0) / duraciones.length : 0
  const avgEfficiency = duraciones.length ? duraciones.reduce((acc, val) => acc + Math.max(0, (BARB_BUSINESS.WORST_CASE - val) / (BARB_BUSINESS.WORST_CASE - BARB_BUSINESS.SLA_TARGET) * 100), 0) / duraciones.length : 0

  return {
    localFinancials: { mttr: globalMttr, costo_total_acumulado: realCostSum, ahorro_generado: totalSavings, efficiency: avgEfficiency, mtbfHours: globalMtbf },
    trend14Days: Object.values(trendsMap),
    machines: Object.values(machineMap).filter(m => m.total > 0).map(m => ({ 
      ...m, 
      mttr: m.duraciones.length ? Math.round(m.duraciones.reduce((a, b) => a + b, 0) / m.duraciones.length) : 0,
      slaCompliance: m.resueltas ? Math.round((m.slaMet / m.resueltas) * 100) : 100,
      ahorroGenerado: m.duraciones.reduce((acc, val) => acc + Math.max(0, (BARB_BUSINESS.WORST_CASE - val) * BARB_BUSINESS.COST_PER_MIN), 0)
    }))
  }
}

export default function useFinancialStats(timeRange = 'all') {
  const [data, setData] = useState({ financials: { mttr: 0, costo_total_acumulado: 0, ahorro_estimado: 0, efficiency: 0, mtbfHours: null }, trend14Days: [], machines: [] })
  const [isLoading, setIsLoading] = useState(true)

  const loadStats = useCallback(async (signal) => {
    setIsLoading(true)
    try {
      const [finRes, ordersRes, machinesRes] = await Promise.all([ 
        fetch(`${API_BASE}/stats/financial-impact`, { signal }).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/work-orders`, { signal }), 
        fetch(`${API_BASE}/machines`, { signal }) 
      ])
      
      const workOrders = ordersRes.ok ? await ordersRes.json() : []
      const machines = machinesRes.ok ? await machinesRes.json() : []
      
      const { localFinancials, trend14Days, machines: processedMachines } = processMetricsLocal(workOrders, machines, timeRange)
      let finalFinancials = localFinancials
      
      if (finRes.ok) {
        const apiFin = await finRes.json()
        finalFinancials = {
          mttr: Number(apiFin.mttr || localFinancials.mttr),
          costo_total_acumulado: Number(apiFin.costo_total_acumulado || localFinancials.costo_total_acumulado),
          ahorro_generado: Number(apiFin.ahorro_estimado || localFinancials.ahorro_generado),
          efficiency: localFinancials.efficiency,
          mtbfHours: localFinancials.mtbfHours
        }
      }

      setData({ financials: finalFinancials, trend14Days, machines: processedMachines })
    } catch (err) {
      if (signal?.aborted) return
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    const ctrl = new AbortController()
    void loadStats(ctrl.signal)
    return () => ctrl.abort()
  }, [loadStats])

  return { ...data, isLoading, refetch: () => loadStats(new AbortController().signal) }
}