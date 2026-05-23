import { useCallback, useEffect, useState } from 'react'

const DEFAULT_STATS_URL = 'http://localhost:9000/api/stats/financial-impact'

function resolveStatsUrl() {
  const base = (import.meta.env.VITE_FINANCIAL_API_URL || import.meta.env.VITE_API_URL || DEFAULT_STATS_URL).toString().trim()
  if (base.endsWith('/financial-impact')) return base
  if (base.endsWith('/stats')) return `${base}/financial-impact`
  if (base.endsWith('/api')) return `${base}/stats/financial-impact`
  return base.replace(/\/$/, '') + '/api/stats/financial-impact'
}

function parseFriendlyError(status) {
  if (status === 0) {
    return 'No fue posible conectar con el backend financiero. Verifica que el servidor esté corriendo en el puerto 9000.'
  }

  if (status === 404) {
    return 'El endpoint financiero no fue encontrado. Revisa que la API esté desplegada correctamente.'
  }

  if (status === 500) {
    return 'El backend respondió con un error interno al calcular los indicadores financieros.'
  }

  if (status >= 502 && status <= 504) {
    return 'El servicio financiero no está disponible en este momento. Intenta nuevamente en unos segundos.'
  }

  return 'No se pudieron obtener las métricas financieras. Intenta refrescar la página.'
}

export function useFinancialStats() {
  const [stats, setStats] = useState({
    mttr: 0,
    costo_total_acumulado: 0,
    ahorro_estimado: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadStats = useCallback(async (signal) => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(resolveStatsUrl(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal,
      })

      if (!response.ok) {
        throw new Error(JSON.stringify({ status: response.status, body: await response.text().catch(() => '') }))
      }

      const data = await response.json()

      setStats({
        mttr: Number(data?.mttr ?? 0),
        costo_total_acumulado: Number(data?.costo_total_acumulado ?? 0),
        ahorro_estimado: Number(data?.ahorro_estimado ?? 0),
      })
    } catch (err) {
      if (signal?.aborted) return

      let status = 0
      try {
        const parsed = JSON.parse(err instanceof Error ? err.message : '')
        status = Number(parsed?.status ?? 0)
      } catch (_) {
        status = 0
      }

      setError(parseFriendlyError(status))
      setStats({
        mttr: 0,
        costo_total_acumulado: 0,
        ahorro_estimado: 0,
      })
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadStats(controller.signal)
    return () => controller.abort()
  }, [loadStats])

  const refetch = useCallback(() => {
    const controller = new AbortController()
    void loadStats(controller.signal)
    return () => controller.abort()
  }, [loadStats])

  return { stats, isLoading, error, refetch }
}

export default useFinancialStats
