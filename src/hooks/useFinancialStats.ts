import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

// Todas las constantes de negocio estructuradas para el dashboard
export const BARB_BUSINESS = {
  targetUptime: 98,
  avgDowntimeCost: 5000,
  SLA_TARGET: 24,
  ANNUAL_WITHOUT_BARB: 120000, 
  ANNUAL_WITH_BARB: 45000
};

// 🔥 BLINDAJE DE TIPOS: Aseguramos la integridad de los datos
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

export default function useFinancialStats(timeRange?: number | 'all') {
  const [data, setData] = useState<FinancialStats>({
    financials: { ahorro_generado: 0, mttr: 0, efficiency: 0, costo_total_acumulado: 0, mtbfHours: null },
    trend14Days: [],
    machines: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const { apiBase } = useAppContext();

  useEffect(() => {
    // 🛡️ ESCUDO ANTI-FUGAS DE MEMORIA: Prepara la cancelación si el usuario cambia de pantalla rápido
    const controller = new AbortController();
    
    setIsLoading(true);
    
    // Normalizamos la URL para evitar el error de la doble barra "//"
    const safeApi = apiBase.replace(/\/$/, '');
    
    const url = timeRange && timeRange !== 'all' 
      ? `${safeApi}/stats/financial-impact?days=${timeRange}`
      : `${safeApi}/stats/financial-impact`;

    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('Error en respuesta del servidor');
        return res.json();
      })
      .then(json => {
        // Si el usuario ya se fue de la pantalla, no intentamos actualizar el estado
        if (controller.signal.aborted) return;

        setData({
          financials: json?.financials || { ahorro_generado: 0, mttr: 0, efficiency: 0, costo_total_acumulado: 0, mtbfHours: null },
          trend14Days: Array.isArray(json?.trend14Days) ? json.trend14Days : [],
          machines: Array.isArray(json?.machines) ? json.machines : []
        });
      })
      .catch(err => {
        // Ignoramos el error si fue provocado por cancelar la petición intencionalmente
        if (err.name === 'AbortError') return;
        console.error("Error cargando stats financieras:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    // Cleanup function: Se ejecuta si el componente se desmonta antes de terminar el fetch
    return () => {
      controller.abort();
    };
  }, [apiBase, timeRange]);

  return {
    financials: data.financials,
    trend14Days: data.trend14Days,
    machines: data.machines,
    isLoading
  };
}