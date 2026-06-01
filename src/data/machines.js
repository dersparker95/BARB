export const DISCIPLINES = [
    { id: 'mecanica', name: 'Mecánica' },
    { id: 'electrica', name: 'Eléctrica' },
    { id: 'instrumentacion', name: 'Instrumentación' },
    { id: 'operacion', name: 'Operación' }
];
export const MACHINES = {
    '1': { name: 'Chancador Primario', model: 'Metso Superior', status: 'operational', cat: 'mecanica', icon: '🪨' },
    '2': { name: 'Chancador Secundario', model: 'Sandvik CH895', status: 'warning', cat: 'mecanica', icon: '⚙️' },
    '3': { name: 'Harnero Vibratorio', model: 'Ludowici', status: 'maintenance', cat: 'mecanica', icon: '📳' },
    '4': { name: 'Sala Eléctrica', model: 'ABB', status: 'operational', cat: 'electrica', icon: '⚡' },
    '5': { name: 'Centro de Control MCC', model: 'Siemens', status: 'operational', cat: 'electrica', icon: '🖥️' },
    '6': { name: 'Bomba de Relaves', model: 'Warman', status: 'operational', cat: 'mecanica', icon: '💧' },
    '7': { name: 'Compresor Principal', model: 'Atlas Copco', status: 'warning', cat: 'instrumentacion', icon: '💨' },
    '8': { name: 'Bomba de Agua', model: 'Flowserve', status: 'operational', cat: 'mecanica', icon: '🌊' },
    '9': { name: 'Línea de Aire', model: 'Festo', status: 'operational', cat: 'instrumentacion', icon: '🎛️' },
    '10': { name: 'Tablero de Fuerza', model: 'Schneider', status: 'operational', cat: 'electrica', icon: '🔋' }
};
export default MACHINES;
