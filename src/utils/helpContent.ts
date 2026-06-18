export interface HelpGuide {
  title: string;
  content: string;
}

export const helpContentData: Record<string, HelpGuide> = {
  '/menu': {
    title: 'Guía del Menú Principal',
    content: 'Desde aquí puedes acceder a todas las herramientas del sistema BARB. Haz click en las tarjetas para navegar entre todos los módulos disponibles.'
  },
  '/dashboard': {
    title: 'Guía del Dashboard KPI',
    content: 'En esta pantalla puedes visualizar las métricas clave, el rendimiento general de la planta y generar reportes operativos. Utiliza los filtros para acotar la información.'
  },
  '/docchat': {
    title: 'Guía del Asistente IA (Document Chat)',
    content: 'Hazle preguntas al Asistente IA sobre manuales técnicos o procedimientos. La IA buscará en el repositorio de documentos y te entregará una respuesta basada en la documentación oficial.'
  },
  '/debug': {
    title: 'Guía de Debug (Diagnóstico de Equipo)',
    content: 'Esta herramienta te permite analizar y visualizar el registro historico de fallas en cada maquina, ademas de poder guardar registros en el historial de la IA y realizar preguntas directas que estén relacionadas.'
  },
  '/topology': {
    title: 'Guía de Topología de Planta',
    content: 'Explora el mapa interactivo de la planta. Puedes ver el estado general de todas las máquinas conectadas y hacer clic en ellas para ver más detalles.'
  },
  '/memory': {
    title: 'Guía de Memoria de Máquina',
    content: 'Consulta el historial de eventos, mantenimientos previos y el registro operativo específico de esta máquina.'
  },
  '/report': {
    title: 'Guía de Reporte de Diagnóstico',
    content: 'Visualiza y exporta el resumen detallado del diagnóstico realizado a los equipos. Ideal para adjuntar a las órdenes de trabajo.'
  },
  'default': {
    title: 'Ayuda del Sistema',
    content: 'No hay una guía específica detallada para esta sección actual.'
  }
};