-- ==========================================
-- 1. CREACIÓN DE TIPOS ENUM (Ejecutar primero)
-- ==========================================
CREATE TYPE nivel_severidad AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE estado_reporte AS ENUM ('draft', 'generated', 'uploaded', 'approved', 'archived');
CREATE TYPE tipo_mantenimiento AS ENUM ('corrective', 'preventive', 'predictive', 'inspection');
CREATE TYPE prioridad_ot AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE estado_ot AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue');
CREATE TYPE estado_repuesto AS ENUM ('active', 'discontinued', 'out_of_stock');
CREATE TYPE tipo_nodo AS ENUM ('machine', 'controller', 'sensor', 'hub');
CREATE TYPE estado_nodo AS ENUM ('operational', 'warning', 'error', 'offline');
CREATE TYPE tipo_conexion AS ENUM ('electrical', 'mechanical', 'data', 'hydraulic', 'pneumatic');
CREATE TYPE estado_conexion AS ENUM ('active', 'inactive');
CREATE TYPE frecuencia_mant AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom');
CREATE TYPE prioridad_mant AS ENUM ('low', 'medium', 'high');
CREATE TYPE estado_programa AS ENUM ('active', 'paused', 'inactive');
CREATE TYPE estado_ejecucion AS ENUM ('scheduled', 'completed', 'skipped', 'overdue');
CREATE TYPE estado_lectura AS ENUM ('normal', 'warning', 'critical');

-- ==========================================
-- 2. TABLAS MAESTRAS (Sin dependencias)
-- ==========================================
CREATE TABLE USUARIO (
    usuario_id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    rol VARCHAR(50) NOT NULL
);

CREATE TABLE PLANTA (
    planta_id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    ubicacion VARCHAR(255)
);

CREATE TABLE REPUESTO (
    repuesto_id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    part_number VARCHAR(80),
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    tipo VARCHAR(60),
    categoria VARCHAR(60),
    unidad VARCHAR(20) NOT NULL,
    stock_actual DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_minimo DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_maximo DECIMAL(12,2),
    costo_unitario DECIMAL(12,2),
    proveedor VARCHAR(120),
    ubicacion_bodega VARCHAR(80),
    imagen_url VARCHAR(255),
    estado estado_repuesto NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE DISCIPLINA (
    disciplina_id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL,
    color VARCHAR(20)
);

-- ==========================================
-- 3. TABLAS PRINCIPALES (Infraestructura)
-- ==========================================
CREATE TABLE MAQUINA (
    maquina_id SERIAL PRIMARY KEY,
    planta_id INT NOT NULL,
    disciplina_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    CONSTRAINT fk_maquina_planta FOREIGN KEY (planta_id) REFERENCES PLANTA(planta_id),
    CONSTRAINT fk_maquina_disciplina FOREIGN KEY (disciplina_id) REFERENCES DISCIPLINA(disciplina_id)
);

CREATE TABLE SENSOR (
    sensor_id SERIAL PRIMARY KEY,
    maquina_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    CONSTRAINT fk_sensor_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id)
);

-- ==========================================
-- 4. TABLAS DE TOPOLOGÍA
-- ==========================================
CREATE TABLE TOPOLOGIA_ZONA (
    zona_id SERIAL PRIMARY KEY,
    planta_id INT NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    color VARCHAR(20),
    descripcion VARCHAR(255),
    CONSTRAINT fk_zona_planta FOREIGN KEY (planta_id) REFERENCES PLANTA(planta_id)
);

CREATE TABLE TOPOLOGIA_NODO (
    nodo_id SERIAL PRIMARY KEY,
    planta_id INT NOT NULL,
    maquina_id INT,
    sensor_id INT,
    tipo tipo_nodo NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    categoria VARCHAR(60),
    position_x DECIMAL(10,2) NOT NULL,
    position_y DECIMAL(10,2) NOT NULL,
    position_z DECIMAL(10,2),
    estado estado_nodo NOT NULL DEFAULT 'operational',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_nodo_planta FOREIGN KEY (planta_id) REFERENCES PLANTA(planta_id),
    CONSTRAINT fk_nodo_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_nodo_sensor FOREIGN KEY (sensor_id) REFERENCES SENSOR(sensor_id)
);

CREATE TABLE ZONA_NODO (
    zona_id INT NOT NULL,
    nodo_id INT NOT NULL,
    PRIMARY KEY (zona_id, nodo_id),
    CONSTRAINT fk_zn_zona FOREIGN KEY (zona_id) REFERENCES TOPOLOGIA_ZONA(zona_id) ON DELETE CASCADE,
    CONSTRAINT fk_zn_nodo FOREIGN KEY (nodo_id) REFERENCES TOPOLOGIA_NODO(nodo_id) ON DELETE CASCADE
);

CREATE TABLE TOPOLOGIA_CONEXION (
    conexion_id SERIAL PRIMARY KEY,
    nodo_origen_id INT NOT NULL,
    nodo_destino_id INT NOT NULL,
    tipo tipo_conexion NOT NULL,
    label VARCHAR(120),
    bidirectional BOOLEAN NOT NULL DEFAULT FALSE,
    bandwidth VARCHAR(40),
    strength INT,
    estado estado_conexion NOT NULL DEFAULT 'active',
    CONSTRAINT fk_conexion_origen FOREIGN KEY (nodo_origen_id) REFERENCES TOPOLOGIA_NODO(nodo_id) ON DELETE CASCADE,
    CONSTRAINT fk_conexion_destino FOREIGN KEY (nodo_destino_id) REFERENCES TOPOLOGIA_NODO(nodo_id) ON DELETE CASCADE
);

-- ==========================================
-- 5. TABLAS DE INTELIGENCIA Y DIAGNÓSTICO
-- ==========================================
CREATE TABLE SESION_DEBUG (
    sesion_id SERIAL PRIMARY KEY,
    maquina_id INT NOT NULL,
    tecnico_id INT NOT NULL,
    CONSTRAINT fk_sesion_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_sesion_tecnico FOREIGN KEY (tecnico_id) REFERENCES USUARIO(usuario_id)
);

CREATE TABLE DIAGNOSTICO (
    diagnostico_id SERIAL PRIMARY KEY,
    sesion_id INT NOT NULL,
    descripcion TEXT NOT NULL,
    severidad nivel_severidad NOT NULL,
    CONSTRAINT fk_diagnostico_sesion FOREIGN KEY (sesion_id) REFERENCES SESION_DEBUG(sesion_id)
);

-- ==========================================
-- 6. TABLAS DE GESTIÓN Y OPERACIÓN
-- ==========================================
CREATE TABLE REPORTE (
    reporte_id SERIAL PRIMARY KEY,
    report_number VARCHAR(40) UNIQUE NOT NULL,
    sesion_id INT,
    diagnostico_id INT,
    maquina_id INT NOT NULL,
    tecnico_id INT NOT NULL,
    summary TEXT,
    issue_description TEXT NOT NULL,
    resolution TEXT,
    actions_taken JSONB,
    additional_notes TEXT,
    severity nivel_severidad NOT NULL,
    downtime_minutes INT,
    pdf_url VARCHAR(500),
    repository_url VARCHAR(500),
    estado estado_reporte NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_at TIMESTAMP,
    approved_by INT,
    CONSTRAINT fk_reporte_sesion FOREIGN KEY (sesion_id) REFERENCES SESION_DEBUG(sesion_id),
    CONSTRAINT fk_reporte_diag FOREIGN KEY (diagnostico_id) REFERENCES DIAGNOSTICO(diagnostico_id),
    CONSTRAINT fk_reporte_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_reporte_tecnico FOREIGN KEY (tecnico_id) REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_reporte_aprobador FOREIGN KEY (approved_by) REFERENCES USUARIO(usuario_id)
);

CREATE TABLE ORDEN_TRABAJO (
    ot_id SERIAL PRIMARY KEY,
    numero_ot VARCHAR(40) UNIQUE NOT NULL,
    maquina_id INT NOT NULL,
    tecnico_id INT NOT NULL,
    creado_por INT NOT NULL,
    diagnostico_id INT,
    reporte_id INT,
    tipo tipo_mantenimiento NOT NULL,
    descripcion_problema TEXT,
    descripcion_reparacion TEXT,
    resolution TEXT,
    priority prioridad_ot NOT NULL,
    severity nivel_severidad,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_inicio TIMESTAMP,
    fecha_cierre TIMESTAMP,
    fecha_vencimiento TIMESTAMP,
    tiempo_reparacion_min INT,
    downtime_minutes INT,
    costo_estimado DECIMAL(12,2),
    costo_real DECIMAL(12,2),
    estado estado_ot NOT NULL DEFAULT 'pending',
    CONSTRAINT fk_ot_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_ot_tecnico FOREIGN KEY (tecnico_id) REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_ot_creador FOREIGN KEY (creado_por) REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_ot_diagnostico FOREIGN KEY (diagnostico_id) REFERENCES DIAGNOSTICO(diagnostico_id),
    CONSTRAINT fk_ot_reporte FOREIGN KEY (reporte_id) REFERENCES REPORTE(reporte_id)
);

-- ==========================================
-- 7. TABLAS DE PLANIFICACIÓN PREVENTIVA
-- ==========================================
CREATE TABLE PROGRAMA_MANTENIMIENTO (
    programa_id SERIAL PRIMARY KEY,
    maquina_id INT NOT NULL,
    creado_por INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    instrucciones TEXT,
    frecuencia frecuencia_mant NOT NULL,
    intervalo_dias INT,
    priority prioridad_mant NOT NULL,
    duracion_estimada_min INT,
    costo_estimado DECIMAL(12,2),
    fecha_inicio DATE NOT NULL,
    proxima_ejecucion TIMESTAMP,
    ultima_ejecucion TIMESTAMP,
    estado estado_programa NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_prog_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_prog_usuario FOREIGN KEY (creado_por) REFERENCES USUARIO(usuario_id)
);

CREATE TABLE EJECUCION_PROGRAMA (
    ejecucion_id SERIAL PRIMARY KEY,
    programa_id INT NOT NULL,
    ot_id INT,
    tecnico_id INT,
    fecha_programada TIMESTAMP NOT NULL,
    fecha_ejecutada TIMESTAMP,
    estado estado_ejecucion NOT NULL DEFAULT 'scheduled',
    notes TEXT,
    CONSTRAINT fk_ejec_programa FOREIGN KEY (programa_id) REFERENCES PROGRAMA_MANTENIMIENTO(programa_id) ON DELETE CASCADE,
    CONSTRAINT fk_ejec_ot FOREIGN KEY (ot_id) REFERENCES ORDEN_TRABAJO(ot_id),
    CONSTRAINT fk_ejec_tecnico FOREIGN KEY (tecnico_id) REFERENCES USUARIO(usuario_id)
);

-- ==========================================
-- 8. TABLAS DE LOGS, DETALLES Y DATOS MASIVOS
-- ==========================================
CREATE TABLE OT_REPUESTO (
    ot_repuesto_id SERIAL PRIMARY KEY,
    ot_id INT NOT NULL,
    repuesto_id INT NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    costo_unitario DECIMAL(12,2),
    notas VARCHAR(255),
    fecha_uso TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ot_repuesto_ot FOREIGN KEY (ot_id) REFERENCES ORDEN_TRABAJO(ot_id) ON DELETE CASCADE,
    CONSTRAINT fk_ot_repuesto_item FOREIGN KEY (repuesto_id) REFERENCES REPUESTO(repuesto_id)
);

CREATE TABLE OT_AUDIT_LOG (
    audit_id SERIAL PRIMARY KEY,
    ot_id INT NOT NULL,
    usuario_id INT NOT NULL,
    estado_anterior VARCHAR(40),
    estado_nuevo VARCHAR(40) NOT NULL,
    comentario VARCHAR(500),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_ot FOREIGN KEY (ot_id) REFERENCES ORDEN_TRABAJO(ot_id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_usuario FOREIGN KEY (usuario_id) REFERENCES USUARIO(usuario_id)
);

CREATE TABLE LECTURA_SENSOR (
    lectura_id SERIAL PRIMARY KEY,
    sensor_id INT NOT NULL,
    valor DECIMAL(14,4) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado estado_lectura NOT NULL DEFAULT 'normal',
    CONSTRAINT fk_lectura_sensor FOREIGN KEY (sensor_id) REFERENCES SENSOR(sensor_id) ON DELETE CASCADE
);


-- ==========================================
-- 9. INSERCIÓN DE DATOS SEMILLA (SEED DATA)
-- ==========================================

-- 9.1 Usuarios del sistema (De la versión 2.0)
INSERT INTO USUARIO (usuario_id, nombre, email, rol) VALUES 
(1, 'Director de Mantenimiento', 'supervisor.barb@planta.com', 'Gerente'),
(2, 'Carlos Mendoza', 'carlos.mendoza@planta.com', 'Técnico'),
(3, 'Ana Silva', 'ana.silva@planta.com', 'Técnico'),
(4, 'Roberto Tapia', 'roberto.tapia@planta.com', 'Técnico')
ON CONFLICT (usuario_id) DO NOTHING;

-- 9.2 Plantas de prueba (De la versión 1.0)
INSERT INTO PLANTA (planta_id, nombre, ubicacion) VALUES 
(1, 'Planta Chancado', 'Sector norte'),
(2, 'Planta Concentradora', 'Sector central'),
(3, 'Planta de Filtros', 'Sector sur')
ON CONFLICT (planta_id) DO NOTHING;

-- 9.3 Disciplinas Técnicas (De la versión 2.0, con colores)
INSERT INTO DISCIPLINA (disciplina_id, nombre, color) VALUES 
(1, 'Mecánica', 'blue'),
(2, 'Eléctrica', 'yellow'),
(3, 'Hidráulica', 'cyan'),
(4, 'Neumática', 'purple'),
(5, 'Automatización', 'green')
ON CONFLICT (disciplina_id) DO NOTHING;

-- 9.4 Máquinas Industriales (Las 10 de la versión 1.0 asignadas a las disciplinas)
INSERT INTO MAQUINA (maquina_id, planta_id, disciplina_id, nombre, codigo) VALUES 
(1, 1, 1, 'Chancador Primario', 'MCH-001'),
(2, 1, 1, 'Chancador Secundario', 'MCH-002'),
(3, 1, 1, 'Harnero Vibratorio', 'MCH-003'),
(4, 2, 2, 'Sala Eléctrica', 'MEL-001'),
(5, 2, 2, 'Centro de Control MCC', 'MEL-002'),
(6, 2, 3, 'Bomba de Relaves', 'MHI-001'),
(7, 3, 4, 'Compresor Principal', 'MNE-001'),
(8, 3, 3, 'Bomba de Agua de Servicio', 'MHI-002'),
(9, 3, 4, 'Línea de Aire Instrumental', 'MNE-002'),
(10, 2, 2, 'Tablero General de Fuerza', 'MEL-003')
ON CONFLICT (maquina_id) DO NOTHING;

-- 9.5 Órdenes de Trabajo (Detalle v2.0 aplicadas a las 10 máquinas de v1.0, asignadas a los técnicos 2 y 3)
INSERT INTO ORDEN_TRABAJO (
    numero_ot, maquina_id, tecnico_id, creado_por, tipo, 
    descripcion_problema, descripcion_reparacion, resolution, 
    priority, severity, fecha_creacion, fecha_inicio, fecha_cierre, 
    fecha_vencimiento, tiempo_reparacion_min, downtime_minutes, 
    costo_estimado, costo_real, estado
) VALUES 
('OT-2026-001', 1, 2, 1, 'preventive', 'Mantenimiento preventivo trimestral en Chancador Primario.', 'Se cambiaron filtros y lubricaron rodamientos.', 'Operación exitosa.', 'low', 'low', '2026-05-10 08:00:00', '2026-05-10 08:30:00', '2026-05-10 10:30:00', '2026-05-15 00:00:00', 120, 120, 150.00, 145.50, 'completed'),
('OT-2026-002', 6, 2, 1, 'corrective', 'Pérdida de presión en Bomba de Relaves.', 'Se reemplazó manguera de alta presión y sellos mecánicos.', 'Fuga contenida y presión estable.', 'urgent', 'critical', '2026-05-11 14:15:00', '2026-05-11 14:20:00', '2026-05-11 15:05:00', '2026-05-11 18:00:00', 45, 45, 500.00, 620.00, 'completed'),
('OT-2026-003', 3, 3, 1, 'inspection', 'Ruido anómalo reportado en Harnero Vibratorio.', NULL, NULL, 'low', 'medium', '2026-05-17 09:00:00', NULL, NULL, '2026-05-20 18:00:00', NULL, 0, 50.00, NULL, 'pending'),
('OT-2026-004', 2, 3, 1, 'predictive', 'Alerta de vibración en motor del Chancador Secundario.', 'Analizando alineación e integridad del eje.', NULL, 'high', 'high', '2026-05-18 10:00:00', '2026-05-18 10:30:00', NULL, '2026-05-19 12:00:00', NULL, 60, 300.00, NULL, 'in_progress'),
('OT-2026-005', 4, 2, 1, 'corrective', 'Falla eléctrica intermitente en Sala Eléctrica.', 'Revisión de contactores. Botón de emergencia atascado.', 'Se liberó botón y reseteó sistema.', 'medium', 'low', '2026-05-12 11:00:00', '2026-05-12 11:10:00', '2026-05-12 11:15:00', '2026-05-13 18:00:00', 5, 5, 0.00, 0.00, 'cancelled'),
('OT-2026-006', 7, 3, 1, 'preventive', 'Calibración de sensores y purga de Compresor Principal.', NULL, NULL, 'medium', 'medium', '2026-05-01 08:00:00', NULL, NULL, '2026-05-05 18:00:00', NULL, 0, 100.00, NULL, 'overdue'),
('OT-2026-007', 8, 2, 1, 'corrective', 'Fuga de fluido en Bomba de Agua de Servicio.', 'Se reemplazó empaquetadura y probó estanqueidad.', 'Equipo 100% operativo.', 'high', 'high', '2026-05-15 16:00:00', '2026-05-15 16:05:00', '2026-05-15 16:35:00', '2026-05-16 12:00:00', 30, 30, 0.00, 15.00, 'completed'),
('OT-2026-008', 5, 2, 1, 'inspection', 'Chequeo general de limpieza interna en Centro de Control MCC.', NULL, NULL, 'low', 'low', '2026-05-18 07:00:00', NULL, NULL, '2026-05-19 10:00:00', NULL, 0, 30.00, NULL, 'assigned'),
('OT-2026-009', 9, 3, 1, 'corrective', 'Caída de presión en Línea de Aire Instrumental.', 'Inspección de válvulas y sellado de fugas en línea.', 'Presión neumática restablecida.', 'urgent', 'critical', '2026-05-14 02:00:00', '2026-05-14 02:15:00', '2026-05-14 06:15:00', '2026-05-14 08:00:00', 240, 240, 1200.00, 1450.00, 'completed'),
('OT-2026-010', 10, 2, 1, 'predictive', 'Punto caliente térmico detectado en Tablero General de Fuerza.', 'Termografía, reapriete y limpieza de conexiones.', 'Temperatura en rangos normales.', 'medium', 'medium', '2026-05-16 09:00:00', '2026-05-16 09:30:00', '2026-05-16 10:15:00', '2026-05-17 18:00:00', 45, 0, 80.00, 45.00, 'completed')
ON CONFLICT (numero_ot) DO NOTHING;