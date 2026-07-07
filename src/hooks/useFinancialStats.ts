// @ts-nocheck

// =============================================================================
// IMPORTS
// =============================================================================

import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

// =============================================================================
// CONSTANTES DE NEGOCIO
// =============================================================================

export const BARB_BUSINESS = {
  targetUptime: 98,
  avgDowntimeCost: 5000,
  SLA_TARGET: 24,
  ANNUAL_WITHOUT_BARB: 120000, 
  ANNUAL_WITH_BARB: 45000
};

// =============================================================================
// TIPOS
// =============================================================================

interface Financials {
  ahorro_generado: number;
  mttr: number;
  efficiency: number;
  costo_total_acumulado: number;
  mtbfHours: number | null;
}

interface TrendData {
  date: string;
  abiertas: number;
  cerradas: number;
}

interface MachineData {
  id: string;
  name: string;
  total: number;
  ahorroGenerado?: number;
  mttr?: number;
  slaCompliance?: number;
}

interface FinancialStats {
  financials: Financials;
  trend14Days: TrendData[];
  machines: MachineData[];
}

// =============================================================================
// HOOK PRINCIPAL: USE FINANCIAL STATS
// =============================================================================

export default function useFinancialStats(timeRange?: number | 'all') {
  const [data, setData] = useState<FinancialStats>({
    financials: { ahorro_generado: 0, mttr: 0, efficiency: 0, costo_total_acumulado: 0, mtbfHours: null },
    trend14Days: [],
    machines: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const { apiBase, api } = useAppContext();

  useEffect(() => {
    // Permite cancelar la petición si el usuario cambia de pantalla antes de
    // que la respuesta llegue, evitando actualizar estado de un componente desmontado.
    const controller = new AbortController();

    // FIX: antes esto era un fetch() manual sin el header Authorization que
    // ahora exige el backend, y sin el prefijo /api consistente. Se usa
    // api.stats.financialImpact(), que ya adjunta el token de sesión y normaliza
    // la URL (ver services/api.ts). Se mantiene el guard de apiBase vacío para
    // no lanzar cuando el contexto todavía no terminó de inicializar.
    if (!apiBase) {
      console.warn('[BARB] useFinancialStats: no hay apiBase configurada, se omite el fetch.')
      setIsLoading(false)
      return
    }

    setIsLoading(true);

    api.stats.financialImpact(timeRange, { signal: controller.signal })
      .then((json: any) => {
        // Si el usuario ya se fue de la pantalla, no intentamos actualizar el estado
        if (controller.signal.aborted) return;

        setData({
          financials: json?.financials || { ahorro_generado: 0, mttr: 0, efficiency: 0, costo_total_acumulado: 0, mtbfHours: null },
          trend14Days: Array.isArray(json?.trend14Days) ? json.trend14Days : [],
          machines: Array.isArray(json?.machines) ? json.machines : []
        });
      })
      .catch((err: any) => {
        // Ignoramos el error si fue provocado por cancelar la petición intencionalmente
        if (err.name === 'AbortError') return;
        console.error("Error cargando stats financieras:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [apiBase, api, timeRange]);

  return {
    financials: data.financials,
    trend14Days: data.trend14Days,
    machines: data.machines,
    isLoading
  };
}