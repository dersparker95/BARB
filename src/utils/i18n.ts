// =============================================================================
// TIPOS BASE
// =============================================================================
//
// Define los idiomas soportados y el tipo genérico de valor de traducción
// (texto estático o función interpolada).
//

export type AppLang = 'es' | 'en'

type TranslationValue = string | ((...args: Array<string | number>) => string)

// =============================================================================
// ÁRBOL DE TRADUCCIONES
// =============================================================================
//
// Define la estructura tipada de todas las claves de traducción disponibles,
// agrupadas por módulo de la aplicación.
//

export type TranslationTree = {
  common: {
    language: string
    refresh: string
    loading: string
    export: string
    csv: string
    xlsx: string
    search: string
    all: string
    back: string
    close: string
    cancel: string
    save: string
    create: string
    delete: string
    status: string
    machine: string
    priority: string
    title: string
    description: string
    summary: string
    report: string
    theme: string
    username: string
    password: string
    role: string
    settings: string
    optional: string
    page: string
    remove: string
    replace: string
    upload: string
    processing: string
    documentName: string
    internalNotes: string
    file: string
    send: string
    connecting: string
    forbiddenTitle: string
    forbiddenMessage: string
    backToMenu: string
    goToLogin: string
    success: string
    error: string
    severity: string
    low: string
    medium: string
    high: string
    critical: string
    minutes: string
    operator: string
    untitled: string
    noDescription: string
    plant: string
    discipline: string
    next: string
    prev: string
    technician: string
    duration: string
  }
  statuses: {
    pending: string
    assigned: string
    in_progress: string
    completed: string
    cancelled: string
    overdue: string
    // Claves utilizadas por el Dashboard.
    open: string
    done: string
    closed: string
    // Claves utilizadas por la Topología.
    operativo: string
    alerta: string
    mantenimiento: string
    falla: string
  }
  maintenanceTypes: {
    corrective: string
    preventive: string
    predictive: string
    inspection: string
  }
  financial: {
    roiTitle: string
    roiSubtitle: string
    withoutBarb: string
    withBarb: string
    savingsGenerated: string
    mttrGlobal: string
    mttrOptimal: string
    mttrOver: (mins: number) => string
    efficiency: string
    efficiencySub: string
    directCost: string
    directCostSub: string
    mtbf: string
    mtbfSub: string
    mtbfNeedData: string
    healthTitle: string
    healthSub: string
    performanceTitle: string
    measured: string
    estimated: string
  }
  dashboard: {
    title: string
    totalWorkOrders: string
    activeWorkOrders: string
    completedWorkOrders: string
    mttr: string
    filters: string
    allStatuses: string
    allMachines: string
    allTypes: string
    createWorkOrder: string
    updatedAt: (time: string) => string
    chartStatus: string
    chartMachines: string
    chartResolution: string
    noData: string
    strategyTitle: string
    strategySubtitle: string
    costDeviationTitle: string
    costDeviationSubtitle: string
    topAssetsTitle: string
    topAssetsSubtitle: string
    last7Days: string
    last30Days: string
    last90Days: string
    allTime: string
  }
  report: {
    title: string
    machine: string
    duration: string
    issueSummary: string
    actionsTaken: string
    preventiveActions: string
    severity: string
    send: string
    backToDebug: string
    activeSession: string
    minutes: (value: number) => string
    sessionDuration: string
    issuePlaceholder: string
    actionsPlaceholder: string
    preventivePlaceholder: string
    sendToRepository: string
  }
  topbar: {
    admin: string
    apiOnline: string
    documentChat: string
    machineDebug: string
    plantTopology: string
    machineMemory: string
    debugReport: string
    mainMenu: string
    maintenance: string
    logout: string
    settings: string
  }
  topology: {
    title: string
    zoomIn: string
    zoomOut: string
    resetView: string
    goToDebug: string
    history: string
    close: string
    statusOperational: string
    statusWarning: string
    statusMaintenance: string
    statusOffline: string
    selectedMachine: string
    noMachineSelected: string
  }
  docchat: {
    plantLocation: string
    discipline: string
    machineOptional: string
    allMachines: string
    selectDiscipline: string
    selectDisciplineHint: string
    selectPlant: string
    selectMachine: string
    askPlaceholder: string
    sendPrompt: string
    inputHint: string
    emptyTitle: string
    emptyDescription: string
    backendError: string
    lmStudioOffline: string
    assignedOts: string
    fragments: string
    emptyContext: string
    inputPlaceholder: string
    uploadManual: string
  }
  settings: {
    title: string
    appearanceLanguage: string
    darkTheme: string
    account: string
    systemConnections: string
    appVersion: string
    fastApiEndpoint: string
    lmStudioEndpoint: string
    testConnections: string
    testingConnections: string
    apiOkLmOffline: string
    apiOkLmOk: string
    saveChanges: string
    savedLocally: string
    languageUpdated: string
    username: string
    role: string
    guest: string
  }
  login: {
    title: string
    subtitle: string
    usernamePlaceholder: string
    passwordPlaceholder: string
    loginButton: string
    incorrectCredentials: string
    chooseRole: string
    technician: string
    engineer: string
    supervisor: string
    admin: string
    themeToggle: string
    hidePassword: string
    showPassword: string
  }
  menu: {
    title: string
    documentChatTitle: string
    documentChatDescription: string
    topologyTitle: string
    topologyDescription: string
    dashboardTitle: string
    dashboardDescription: string
    adminBadge: string
    uploadTitle: string
    uploadDescription: string
    uploadHint: string
  }
  debug: {
    machineInformation: string
    specifications: string
    status: string
    category: string
    sessionId: string
    startDebugging: string
    issuePlaceholder: string
    attachPhoto: string
    generateReport: string
    poweredBy: string
    equipmentInfo: string
    specs: string
    strictMode: string
    strictModeDesc: string
    startSession: string
    selectMachine: string
    chipSecurity: string
    chipMaintenance: string
    chipChecklist: string
    inputPlaceholder: string
    takePhoto: string
  }
  machineMemory: {
    title: string
    noHistoryTitle: string
    noHistoryDescription: string
    operator: string
    noHistoryDesc: string
  }
}

// =============================================================================
// DATOS DE TRADUCCIÓN
// =============================================================================
//
// Contiene los valores de traducción para cada idioma soportado, siguiendo
// la estructura definida en TranslationTree.
//

const translations: Record<AppLang, TranslationTree> = {
  es: {
    common: {
      language: 'Idioma', refresh: 'Actualizar', loading: 'Cargando…', export: 'Exportar',
      csv: 'CSV', xlsx: 'XLSX', search: 'Buscar', all: 'Todos', back: 'Volver', close: 'Cerrar',
      cancel: 'Cancelar', save: 'Guardar', create: 'Crear', delete: 'Eliminar', status: 'Estado',
      machine: 'Máquina', priority: 'Prioridad', title: 'Título', description: 'Descripción',
      summary: 'Resumen', report: 'Reporte', theme: 'Tema', username: 'Usuario', password: 'Contraseña',
      role: 'Rol', settings: 'Configuración', optional: 'opcional', page: 'Página', remove: 'Quitar',
      replace: 'Cambiar', upload: 'Subir', processing: 'Procesando...', documentName: 'Nombre del documento',
      internalNotes: 'Notas internas', file: 'Archivo', send: 'Enviar', connecting: 'Conectando...',
      forbiddenTitle: '403 - No Autorizado', forbiddenMessage: 'Tu usuario no tiene permiso para acceder a esta ruta.',
      backToMenu: 'Volver al menú', goToLogin: 'Ir al Login', success: 'Éxito', error: 'Error',
      severity: 'Severidad', low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica', minutes: 'minutos',
      operator: 'Operador', untitled: 'Sin título', noDescription: 'Sin descripción', plant: 'Planta',
      discipline: 'Disciplina', next: 'Siguiente', prev: 'Anterior', technician: 'Técnico', duration: 'Duración'
    },
    statuses: {
      pending: 'Pendiente', assigned: 'Asignada', in_progress: 'En Progreso', completed: 'Completada',
      cancelled: 'Cancelada', overdue: 'Atrasada', open: 'Abierta', done: 'Terminada', closed: 'Cerrada',
      operativo: 'Operativo', alerta: 'Alerta', mantenimiento: 'Mantenimiento', falla: 'Falla'
    },
    maintenanceTypes: { corrective: 'Correctivo', preventive: 'Preventivo', predictive: 'Predictivo', inspection: 'Inspección' },
    financial: {
      roiTitle: 'Impacto Anual Proyectado (Modelo BARB v1.0)', roiSubtitle: 'Basado en US$2.000/min de inactividad operativa.',
      withoutBarb: 'Escenario Sin BARB', withBarb: 'Escenario Con BARB', savingsGenerated: 'Ahorro Generado a la fecha',
      mttrGlobal: 'MTTR Global', mttrOptimal: '✓ Dentro de SLA', mttrOver: (mins: number) => `⚠ ${mins}m sobre SLA`,
      efficiency: 'Eficiencia Resolución', efficiencySub: 'OTs completadas dentro del SLA (24h)', directCost: 'Costo Directo',
      directCostSub: 'Repuestos y servicios facturados', mtbf: 'MTBF Global', mtbfSub: 'Tiempo Medio Entre Fallas (Horas)',
      mtbfNeedData: 'Requiere historial min. 2 fallas', healthTitle: 'Salud Operacional: Backlog', healthSub: 'Tendencia diaria de OTs Abiertas vs Cerradas (14 d).',
      performanceTitle: 'Rendimiento por Máquina', measured: 'Medido', estimated: 'Estimado'
    },
    dashboard: {
      title: 'Órdenes de Trabajo', totalWorkOrders: 'Total OTs', activeWorkOrders: 'OTs activas', completedWorkOrders: 'Completadas',
      mttr: 'MTTR (min)', filters: 'Filtros', allStatuses: 'Todos los estados', allMachines: 'Todas las máquinas',
      allTypes: 'Todos los tipos', createWorkOrder: 'Crear OT', updatedAt: (time: string) => `Actualizado: ${time}`,
      chartStatus: 'Distribución por estado', chartMachines: 'Máquinas con más OTs', chartResolution: 'Tiempo de resolución',
      noData: 'Sin datos', strategyTitle: 'Estrategia de Mantenimiento', strategySubtitle: 'Preventivo vs Correctivo',
      costDeviationTitle: 'Desviación de Costos', costDeviationSubtitle: 'Costo Estimado vs Real (USD)', topAssetsTitle: 'Top 5 Activos Críticos',
      topAssetsSubtitle: 'Máquinas con mayor volumen de OTs', last7Days: 'Últimos 7 días', last30Days: 'Últimos 30 días', last90Days: 'Últimos 90 días', allTime: 'Histórico'
    },
    report: {
      title: 'Reporte de Sesión', machine: 'Máquina', duration: 'Duración de la sesión', issueSummary: 'Resumen del problema',
      actionsTaken: 'Acciones tomadas', preventiveActions: 'Acciones preventivas recomendadas', severity: 'Severidad',
      send: 'Enviar al Repositorio', backToDebug: 'Volver al Debug', activeSession: 'Sesión activa',
      minutes: (value: number) => `${value} minutos`, sessionDuration: 'Duración de Sesión', issuePlaceholder: 'Describe el problema y la resolución...',
      actionsPlaceholder: 'Enumera las acciones realizadas...', preventivePlaceholder: 'Enumera las acciones preventivas recomendadas...',
      sendToRepository: 'Enviar al Repositorio'
    },
    topbar: {
      admin: 'ADMIN', apiOnline: 'API', documentChat: 'Chat de documentos', machineDebug: 'Diagnóstico de máquina',
      plantTopology: 'Topología de planta', machineMemory: 'Memoria de máquina', debugReport: 'Reporte de sesión',
      mainMenu: 'Menú principal', maintenance: 'Mantenimiento de planta', logout: 'Salir', settings: 'Configuración'
    },
    topology: {
      title: 'Topología de planta', zoomIn: 'Acercar', zoomOut: 'Alejar', resetView: 'Reiniciar vista',
      goToDebug: 'Ir a Debug', history: 'Historial', close: 'Cerrar', statusOperational: 'Operativa',
      statusWarning: 'Advertencia', statusMaintenance: 'Mantenimiento', statusOffline: 'Fuera de servicio',
      selectedMachine: 'Máquina seleccionada', noMachineSelected: 'Ninguna máquina seleccionada'
    },
    docchat: {
      plantLocation: 'Planta / Ubicación', discipline: 'Disciplina', machineOptional: 'Máquina (opcional)',
      allMachines: 'Todas las máquinas', selectDiscipline: 'Selecciona una disciplina',
      selectDisciplineHint: 'Puedes cambiar planta, disciplina y máquina desde el panel lateral.',
      selectPlant: 'Seleccionar planta', selectMachine: 'Seleccionar máquina',
      askPlaceholder: 'Pregunta por procedimientos, especificaciones, mantenimiento…',
      sendPrompt: 'Enviar mensaje al chat', inputHint: 'Enter para enviar · Shift+Enter nueva línea',
      emptyTitle: 'Selecciona una disciplina para empezar', emptyDescription: 'Puedes cambiar planta, disciplina y máquina desde el panel lateral.',
      backendError: 'No se pudo conectar con el backend de Plant Memory en este momento.',
      lmStudioOffline: 'El asistente está desconectado temporalmente. Revisa la conexión de LM Studio.',
      assignedOts: 'OTs asignadas', fragments: 'fragmentos', emptyContext: 'Selecciona una disciplina para empezar a chatear con la documentación',
      inputPlaceholder: 'Escribe tu pregunta', uploadManual: 'Cargar manual'
    },
    settings: {
      title: 'Configuración', appearanceLanguage: 'Apariencia e idioma', darkTheme: 'Tema oscuro', account: 'Cuenta',
      systemConnections: 'Sistema y conexiones', appVersion: 'Versión de la app', fastApiEndpoint: 'Endpoint FastAPI',
      lmStudioEndpoint: 'Endpoint LM Studio', testConnections: 'Probar conexiones', testingConnections: 'Probando conexión a FastAPI y LM Studio…',
      apiOkLmOffline: '✅ FastAPI · ❌ LM Studio (No detectado)', apiOkLmOk: '✅ FastAPI · ✅ LM Studio',
      saveChanges: 'Guardar cambios', savedLocally: 'Configuración guardada localmente', languageUpdated: 'Idioma actualizado',
      username: 'Usuario', role: 'Rol', guest: 'Invitado'
    },
    login: {
      title: 'BARB', subtitle: 'Sistema de mantenimiento de planta', usernamePlaceholder: 'Usuario', passwordPlaceholder: 'Contraseña',
      loginButton: 'Ingresar', incorrectCredentials: 'Usuario o contraseña incorrecta, vuelve a intentarlo.',
      chooseRole: 'Seleccionar rol', technician: 'Técnico', engineer: 'Ingeniero', supervisor: 'Supervisor', admin: 'Administrador',
      themeToggle: 'Cambiar tema', hidePassword: 'Ocultar contraseña', showPassword: 'Mostrar contraseña'
    },
    menu: {
      title: 'Menú principal', documentChatTitle: 'Asistente Documental', documentChatDescription: 'Consulta manuales y procedimientos',
      topologyTitle: 'Topología de planta', topologyDescription: 'Mapa interactivo de máquinas', dashboardTitle: 'Dashboard KPI',
      dashboardDescription: 'Métricas y reportes', adminBadge: 'ADMIN', uploadTitle: 'Subir documentos',
      uploadDescription: 'Sube archivos al repositorio documental', uploadHint: 'El archivo se guardará en el repositorio documental seguro.'
    },
    debug: {
      machineInformation: 'Información de la máquina', specifications: 'Especificaciones', status: 'Estado', category: 'Categoría',
      sessionId: 'ID de sesión', startDebugging: 'Iniciar sesión de diagnóstico', issuePlaceholder: 'Describe el problema o haz una pregunta…',
      attachPhoto: 'Adjuntar foto', generateReport: 'Generar y enviar reporte', poweredBy: 'Powered by FastAPI',
      equipmentInfo: 'Información del Equipo', specs: 'Especificaciones', strictMode: 'Modo Estricto BARB Activado',
      strictModeDesc: 'La IA está bloqueada para responder solo temas industriales.', startSession: 'Inicia la sesión de diagnóstico',
      selectMachine: 'Selecciona una máquina desde la topología', chipSecurity: 'Riesgos de seguridad', chipMaintenance: 'Mantenimiento preventivo',
      chipChecklist: 'Generar Checklist', inputPlaceholder: 'Describe el problema para que BARB lo analice...', takePhoto: 'Tomar foto del problema'
    },
    machineMemory: {
      title: 'Memoria de máquina', noHistoryTitle: 'No hay historial disponible', noHistoryDescription: 'No existen órdenes de trabajo o reportes previos para esta máquina.',
      operator: 'Operador', noHistoryDesc: 'No existen órdenes de trabajo ni reportes pasados para este equipo.'
    },
  },
  en: {
    common: {
      language: 'Language', refresh: 'Refresh', loading: 'Loading…', export: 'Export', csv: 'CSV', xlsx: 'XLSX', search: 'Search',
      all: 'All', back: 'Back', close: 'Close', cancel: 'Cancel', save: 'Save', create: 'Create', delete: 'Delete', status: 'Status',
      machine: 'Machine', priority: 'Priority', title: 'Title', description: 'Description', summary: 'Summary', report: 'Report',
      theme: 'Theme', username: 'Username', password: 'Password', role: 'Role', settings: 'Settings', optional: 'optional',
      page: 'Page', remove: 'Remove', replace: 'Change', upload: 'Upload', processing: 'Processing...', documentName: 'Document name',
      internalNotes: 'Internal notes', file: 'File', send: 'Send', connecting: 'Connecting...', forbiddenTitle: '403 - Forbidden',
      forbiddenMessage: 'You do not have permission to access this page.', backToMenu: 'Back to menu', goToLogin: 'Go to Login',
      success: 'Success', error: 'Error', severity: 'Severity', low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
      minutes: 'minutes', operator: 'Operator', untitled: 'Untitled', noDescription: 'No description', plant: 'Plant', discipline: 'Discipline',
      next: 'Next', prev: 'Prev', technician: 'Technician', duration: 'Duration'
    },
    statuses: {
      pending: 'Pending', assigned: 'Assigned', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled', overdue: 'Overdue',
      open: 'Open', done: 'Done', closed: 'Closed', operativo: 'Operational', alerta: 'Warning', mantenimiento: 'Maintenance', falla: 'Error'
    },
    maintenanceTypes: { corrective: 'Corrective', preventive: 'Preventive', predictive: 'Predictive', inspection: 'Inspection' },
    financial: {
      roiTitle: 'Projected Annual Impact (BARB v1.0 Model)', roiSubtitle: 'Based on US$2,000/min of operational downtime.',
      withoutBarb: 'Without BARB Scenario', withBarb: 'With BARB Scenario', savingsGenerated: 'Savings Generated to Date',
      mttrGlobal: 'Global MTTR', mttrOptimal: '✓ Within SLA', mttrOver: (mins: number) => `⚠ ${mins}m over SLA`,
      efficiency: 'Resolution Efficiency', efficiencySub: 'Work orders completed within SLA (24h)', directCost: 'Direct Cost',
      directCostSub: 'Billed parts and services', mtbf: 'Global MTBF', mtbfSub: 'Mean Time Between Failures (Hours)',
      mtbfNeedData: 'Requires min. 2 failures history', healthTitle: 'Operational Health: Backlog', healthSub: 'Daily trend of Open vs Closed WOs (14 d).',
      performanceTitle: 'Machine Performance', measured: 'Measured', estimated: 'Estimated'
    },
    dashboard: {
      title: 'Work Orders', totalWorkOrders: 'Total WOs', activeWorkOrders: 'Active WOs', completedWorkOrders: 'Completed', mttr: 'MTTR (min)',
      filters: 'Filters', allStatuses: 'All statuses', allMachines: 'All machines', allTypes: 'All types', createWorkOrder: 'Create WO',
      updatedAt: (time: string) => `Updated: ${time}`, chartStatus: 'Status breakdown', chartMachines: 'Top machines', chartResolution: 'Resolution time',
      noData: 'No data', strategyTitle: 'Maintenance Strategy', strategySubtitle: 'Preventive vs Corrective', costDeviationTitle: 'Cost Deviation',
      costDeviationSubtitle: 'Estimated vs Real Cost (USD)', topAssetsTitle: 'Top 5 Critical Assets', topAssetsSubtitle: 'Machines with highest WO volume',
      last7Days: 'Last 7 days', last30Days: 'Last 30 days', last90Days: 'Last 90 days', allTime: 'All Time'
    },
    report: {
      title: 'Session Report', machine: 'Machine', duration: 'Session duration', issueSummary: 'Issue summary', actionsTaken: 'Actions taken',
      preventiveActions: 'Recommended preventive actions', severity: 'Severity', send: 'Send to Repository', backToDebug: 'Back to Debug',
      activeSession: 'Active session', minutes: (value: number) => `${value} minutes`, sessionDuration: 'Session Duration',
      issuePlaceholder: 'Describe the issue and resolution...', actionsPlaceholder: 'List actions taken...', preventivePlaceholder: 'List recommended preventive actions...',
      sendToRepository: 'Send to Repository'
    },
    topbar: {
      admin: 'ADMIN', apiOnline: 'API', documentChat: 'Document Chat', machineDebug: 'Machine Debug', plantTopology: 'Plant Topology',
      machineMemory: 'Machine Memory', debugReport: 'Session Report', mainMenu: 'Main Menu', maintenance: 'Plant Maintenance', logout: 'Log out', settings: 'Settings'
    },
    topology: {
      title: 'Plant topology', zoomIn: 'Zoom in', zoomOut: 'Zoom out', resetView: 'Reset view', goToDebug: 'Go to Debug', history: 'History',
      close: 'Close', statusOperational: 'Operational', statusWarning: 'Warning', statusMaintenance: 'Maintenance', statusOffline: 'Offline',
      selectedMachine: 'Selected machine', noMachineSelected: 'No machine selected'
    },
    docchat: {
      plantLocation: 'Plant / Location', discipline: 'Discipline', machineOptional: 'Machine (optional)', allMachines: 'All machines',
      selectDiscipline: 'Select a discipline', selectDisciplineHint: 'You can change plant, discipline and machine from the side panel.',
      selectPlant: 'Select plant', selectMachine: 'Select machine', askPlaceholder: 'Ask about procedures, specifications, maintenance…',
      sendPrompt: 'Send chat message', inputHint: 'Enter to send · Shift+Enter new line', emptyTitle: 'Select a discipline to start',
      emptyDescription: 'You can change plant, discipline and machine from the side panel.', backendError: 'Could not connect to the Plant Memory backend right now.',
      lmStudioOffline: 'The assistant is temporarily disconnected. Check LM Studio connection.', assignedOts: 'Assigned OTs', fragments: 'fragments',
      emptyContext: 'Select a discipline to start chatting with documentation', inputPlaceholder: 'Type your question', uploadManual: 'Upload manual'
    },
    settings: {
      title: 'Settings', appearanceLanguage: 'Appearance & language', darkTheme: 'Dark theme', account: 'Account', systemConnections: 'System & connections',
      appVersion: 'App version', fastApiEndpoint: 'FastAPI endpoint', lmStudioEndpoint: 'LM Studio endpoint', testConnections: 'Test connections',
      testingConnections: 'Testing FastAPI and LM Studio connection…', apiOkLmOffline: '✅ FastAPI · ❌ LM Studio (Not detected)', apiOkLmOk: '✅ FastAPI · ✅ LM Studio',
      saveChanges: 'Save changes', savedLocally: 'Configuration saved locally', languageUpdated: 'Language updated', username: 'Username', role: 'Role', guest: 'Guest'
    },
    login: {
      title: 'BARB', subtitle: 'Plant maintenance system', usernamePlaceholder: 'Username', passwordPlaceholder: 'Password', loginButton: 'Login',
      incorrectCredentials: 'Incorrect username or password, please try again.', chooseRole: 'Choose role', technician: 'Technician', engineer: 'Engineer',
      supervisor: 'Supervisor', admin: 'Admin', themeToggle: 'Toggle theme', hidePassword: 'Hide password', showPassword: 'Show password'
    },
    menu: {
      title: 'Main Menu', documentChatTitle: 'Document Chat', documentChatDescription: 'Chat with plant manuals and documentation by discipline',
      topologyTitle: 'Plant Topology', topologyDescription: 'View machines and their connections in the plant', dashboardTitle: 'OT Dashboard',
      dashboardDescription: 'Work order dashboard — automatic tickets, start/close times, maintenance KPIs', adminBadge: 'ADMIN',
      uploadTitle: 'Document upload', uploadDescription: 'Upload manuals, technical sheets or procedures.', uploadHint: 'The file will be stored in the document repository.'
    },
    debug: {
      machineInformation: 'Machine information', specifications: 'Specifications', status: 'Status', category: 'Category', sessionId: 'Session ID',
      startDebugging: 'Start debugging session', issuePlaceholder: 'Describe the issue or ask questions…', attachPhoto: 'Attach photo', generateReport: 'Generate & Send Report',
      poweredBy: 'Powered by FastAPI', equipmentInfo: 'Equipment Info', specs: 'Specifications', strictMode: 'Strict Mode Enabled', strictModeDesc: 'AI is locked to answer industrial topics only.',
      startSession: 'Start diagnostics session', selectMachine: 'Select a machine from topology', chipSecurity: 'Safety risks', chipMaintenance: 'Preventive maintenance',
      chipChecklist: 'Generate Checklist', inputPlaceholder: 'Describe the issue for BARB to analyze...', takePhoto: 'Take photo'
    },
    machineMemory: {
      title: 'Machine memory', noHistoryTitle: 'No history available', noHistoryDescription: 'There are no past work orders or reports for this machine.', operator: 'Operator',
      noHistoryDesc: 'There are no past work orders or reports for this machine.'
    },
  },
}

// =============================================================================
// UTILIDADES DE IDIOMA
// =============================================================================
//
// Funciones auxiliares para validar, normalizar y consultar traducciones.
//

/**
 * Verifica si un valor corresponde a un idioma soportado por la aplicación.
 *
 * Args:
 *     value:
 *         Valor a evaluar.
 *
 * Returns:
 *     True si el valor es un AppLang válido.
 */
export const isSupportedLang = (value: string): value is AppLang => value === 'es' || value === 'en'

/**
 * Normaliza un valor de idioma, retornando español como valor por defecto
 * cuando el idioma recibido no es soportado.
 *
 * Args:
 *     value:
 *         Valor de idioma a normalizar.
 *
 * Returns:
 *     Idioma soportado equivalente.
 */
export const normalizeLang = (value: string): AppLang => (isSupportedLang(value) ? value : 'es')

/**
 * Obtiene el árbol de traducciones correspondiente a un idioma.
 *
 * Args:
 *     lang:
 *         Idioma solicitado (se normaliza automáticamente).
 *
 * Returns:
 *     Árbol de traducciones del idioma resultante.
 */
export const getTranslations = (lang: string) => translations[normalizeLang(lang)]

/**
 * Obtiene un valor de traducción específico dentro de una sección del árbol.
 *
 * Args:
 *     lang:
 *         Idioma solicitado.
 *     section:
 *         Sección del árbol de traducciones.
 *     key:
 *         Clave de traducción dentro de la sección.
 *
 * Returns:
 *     Valor de traducción (texto o función interpolada).
 */
export const t = <S extends keyof TranslationTree, K extends keyof TranslationTree[S]>(
  lang: string,
  section: S,
  key: K,
) => {
  const tree = getTranslations(lang)[section]
  return tree[key] as TranslationValue
}
