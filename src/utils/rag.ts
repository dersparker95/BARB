import { SourceHit } from '../types'

// =============================================================================
// MODELOS
// =============================================================================
//
// Estructuras tipadas utilizadas por el motor RAG local.
//

export interface LocalChunk {
  text: string
  page: number
}

export interface ScoredChunk extends LocalChunk {
  score: number
}

// =============================================================================
// BASE DE DATOS OFFLINE
// =============================================================================
//
// Conjunto de fragmentos técnicos utilizados como fuente de contexto cuando
// el backend central no está disponible.
//

export const DEMO_CHUNKS: LocalChunk[] = [
  { text: "ARRANQUE SEGURO: 1) Verificar nivel aceite MIN-MAX. 2) Abrir válvula suministro. 3) Verificar guardas. 4) Presionar START. 5) Esperar 30s vacío. 6) Cargar gradualmente a 7.5 bar. ⚠️ No superar 10 bar.", page: 14 },
  { text: "CÓDIGO E-041 — Sobrecalentamiento motor. CAUSAS: Filtro obstruido, aceite bajo, ventilación bloqueada, temperatura >45°C. SOLUCIÓN: 1) Parar equipo. 2) Limpiar filtro FA-001. 3) Verificar aceite SAE 40. 4) Despejar ventilación 50cm.", page: 37 },
  { text: "LUBRICACIÓN: Aceite Roto-Inject Plus 4000H, ISO 6743-3A. 4.5 litros. Cambio: 4000h o 12 meses. Rodamientos B1/B2: grasa PTFE cada 2000h.", page: 52 },
  { text: "TORQUES: Tapa culata M10→45Nm. Brida M8→25Nm. Tuerca base M12→65Nm. Pernos válvula M6→12Nm. ⚠️ Torquímetro calibrado obligatorio.", page: 61 },
  { text: "PREVENTIVO: 500h limpiar prefiltro. 2000h cambiar filtro aceite+separador. 4000h cambio aceite, revisar válvulas, calibrar termostato. 8000h overhaul general.", page: 78 },
  { text: "CAÍDA DE PRESIÓN — B3 Schuler: 1) Válvula proporcional desgastada. 2) Filtro hidráulico colapsado (revisar indicador diferencial). 3) Nivel aceite bajo. 4) Fuga interna cilindro. Diagnóstico: medir presión en punto P1.", page: 44 },
  { text: "POST-PARADA EMERGENCIA: 1) Identificar causa en HMI. 2) Resolver causa raíz. 3) Resetear relé SR-001. 4) Restablecer presión gradualmente. 5) Ciclo vacío antes de producción.", page: 19 },
]

// =============================================================================
// PROCESAMIENTO Y RECUPERACIÓN
// =============================================================================
//
// Implementa la tokenización de texto y el algoritmo de recuperación de
// contexto por similitud léxica.
//

/**
 * Normaliza y tokeniza un texto para su comparación léxica.
 *
 * Args:
 *     t:
 *         Texto de entrada a tokenizar.
 *
 * Returns:
 *     Lista de tokens en minúsculas, sin tildes, filtrando palabras cortas.
 */
export function tokenize(t: string): string[] {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\W+/).filter(x => x.length > 2)
}

/**
 * Recupera los fragmentos más relevantes de la base offline para una
 * consulta dada, mediante un puntaje de coincidencia léxica.
 *
 * Args:
 *     query:
 *         Consulta del usuario.
 *     k:
 *         Cantidad máxima de fragmentos a retornar.
 *
 * Returns:
 *     Fragmentos ordenados por relevancia, con puntaje mayor a cero.
 */
export function retrieveContext(query: string, k = 4): ScoredChunk[] {
  const qTok = new Set(tokenize(query))
  return DEMO_CHUNKS
    .map(c => {
      const cTok = tokenize(c.text)
      let score = 0
      qTok.forEach(q => { 
        const f = cTok.filter(t => t.includes(q) || q.includes(t)).length; 
        if (f > 0) score += 1 + Math.log(f) 
      })
      return { ...c, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter(c => c.score > 0)
}

/**
 * Construye las referencias de origen (SourceHit) a partir de los
 * fragmentos recuperados, truncando el extracto cuando corresponde.
 *
 * Args:
 *     chunks:
 *         Fragmentos utilizados como fuente de la respuesta.
 *     docName:
 *         Nombre del documento a mostrar como origen.
 *
 * Returns:
 *     Lista de referencias de origen listas para mostrar en la UI.
 */
export function sourcesFromChunks(chunks: LocalChunk[], docName: string = 'Offline Database'): SourceHit[] {
  return chunks.map(c => ({ 
    documentName: docName, 
    pageNumber: c.page, 
    excerpt: c.text.length > 120 ? c.text.slice(0, 120) + '…' : c.text
  }))
}
