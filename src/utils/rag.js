export const DEMO_CHUNKS = [
    { text: "ARRANQUE SEGURO: 1) Verificar nivel aceite MIN-MAX. 2) Abrir válvula suministro. 3) Verificar guardas. 4) Presionar START. 5) Esperar 30s vacío. 6) Cargar gradualmente a 7.5 bar. ⚠️ No superar 10 bar.", page: 14 },
    { text: "CÓDIGO E-041 — Sobrecalentamiento motor. CAUSAS: Filtro obstruido, aceite bajo, ventilación bloqueada, temperatura >45°C. SOLUCIÓN: 1) Parar equipo. 2) Limpiar filtro FA-001. 3) Verificar aceite SAE 40. 4) Despejar ventilación 50cm.", page: 37 },
    { text: "LUBRICACIÓN: Aceite Roto-Inject Plus 4000H, ISO 6743-3A. 4.5 litros. Cambio: 4000h o 12 meses. Rodamientos B1/B2: grasa PTFE cada 2000h.", page: 52 },
    { text: "TORQUES: Tapa culata M10→45Nm. Brida M8→25Nm. Tuerca base M12→65Nm. Pernos válvula M6→12Nm. ⚠️ Torquímetro calibrado obligatorio.", page: 61 },
    { text: "PREVENTIVO: 500h limpiar prefiltro. 2000h cambiar filtro aceite+separador. 4000h cambio aceite, revisar válvulas, calibrar termostato. 8000h overhaul general.", page: 78 },
    { text: "CAÍDA DE PRESIÓN — B3 Schuler: 1) Válvula proporcional desgastada. 2) Filtro hidráulico colapsado (revisar indicador diferencial). 3) Nivel aceite bajo. 4) Fuga interna cilindro. Diagnóstico: medir presión en punto P1.", page: 44 },
    { text: "POST-PARADA EMERGENCIA: 1) Identificar causa en HMI. 2) Resolver causa raíz. 3) Resetear relé SR-001. 4) Restablecer presión gradualmente. 5) Ciclo vacío antes de producción.", page: 19 },
];
export function tokenize(t) {
    return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\W+/).filter(x => x.length > 2);
}
export function retrieveContext(query, k = 4) {
    const qTok = new Set(tokenize(query));
    return DEMO_CHUNKS
        .map(c => {
        const cTok = tokenize(c.text);
        let score = 0;
        qTok.forEach(q => { const f = cTok.filter(t => t.includes(q) || q.includes(t)).length; if (f > 0)
            score += 1 + Math.log(f); });
        return { ...c, score };
    })
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .filter(c => c.score > 0);
}
export function sourcesFromChunks(chunks) {
    return chunks.map(c => ({ documentName: 'Manual', pageNumber: c.page, excerpt: c.text.slice(0, 120) + '…' }));
}
