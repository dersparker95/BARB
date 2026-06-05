-- ==========================================
-- BARB DATABASE — Schema unificado v2.1 (Full Seed)
-- ==========================================

-- 1. Limpieza total (DROP de tablas y tipos si existen para evitar conflictos)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- ==========================================
-- 1. TIPOS ENUM
-- ==========================================
CREATE TYPE nivel_severidad   AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE estado_reporte    AS ENUM ('draft', 'generated', 'uploaded', 'approved', 'archived');
CREATE TYPE tipo_mantenimiento AS ENUM ('corrective', 'preventive', 'predictive', 'inspection');
CREATE TYPE prioridad_ot      AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE estado_ot         AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue');
CREATE TYPE estado_repuesto   AS ENUM ('active', 'discontinued', 'out_of_stock');
CREATE TYPE tipo_nodo         AS ENUM ('machine', 'controller', 'sensor', 'hub');
CREATE TYPE estado_nodo       AS ENUM ('operational', 'warning', 'error', 'offline');
CREATE TYPE tipo_conexion     AS ENUM ('electrical', 'mechanical', 'data', 'hydraulic', 'pneumatic');
CREATE TYPE estado_conexion   AS ENUM ('active', 'inactive');
CREATE TYPE frecuencia_mant   AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom');
CREATE TYPE prioridad_mant    AS ENUM ('low', 'medium', 'high');
CREATE TYPE estado_programa   AS ENUM ('active', 'paused', 'inactive');
CREATE TYPE estado_ejecucion  AS ENUM ('scheduled', 'completed', 'skipped', 'overdue');
CREATE TYPE estado_lectura    AS ENUM ('normal', 'warning', 'critical');

-- ==========================================
-- 2. TABLAS MAESTRAS
-- ==========================================
CREATE TABLE USUARIO (
    usuario_id    SERIAL PRIMARY KEY,
    nombre        VARCHAR(100) NOT NULL,
    email         VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol           VARCHAR(50)  NOT NULL,
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE PLANTA (
    planta_id  SERIAL PRIMARY KEY,
    nombre     VARCHAR(120) NOT NULL,
    ubicacion  VARCHAR(255)
);

CREATE TABLE REPUESTO (
    repuesto_id      SERIAL PRIMARY KEY,
    codigo           VARCHAR(50)  UNIQUE NOT NULL,
    part_number      VARCHAR(80),
    nombre           VARCHAR(150) NOT NULL,
    descripcion      TEXT,
    tipo             VARCHAR(60),
    categoria        VARCHAR(60),
    unidad           VARCHAR(20)  NOT NULL,
    stock_actual     DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_minimo     DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_maximo     DECIMAL(12,2),
    costo_unitario   DECIMAL(12,2),
    proveedor        VARCHAR(120),
    ubicacion_bodega VARCHAR(80),
    imagen_url       VARCHAR(255),
    estado           estado_repuesto NOT NULL DEFAULT 'active',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 3. INFRAESTRUCTURA
-- ==========================================
CREATE TABLE DISCIPLINA (
    disciplina_id SERIAL PRIMARY KEY,
    nombre        VARCHAR(50) UNIQUE NOT NULL,
    color         VARCHAR(20)
);

CREATE TABLE MAQUINA (
    maquina_id    SERIAL PRIMARY KEY,
    planta_id     INT NOT NULL,
    disciplina_id INT,
    nombre        VARCHAR(100) NOT NULL,
    codigo        VARCHAR(50)  UNIQUE NOT NULL,
    CONSTRAINT fk_maquina_planta      FOREIGN KEY (planta_id)     REFERENCES PLANTA(planta_id),
    CONSTRAINT fk_maquina_disciplina  FOREIGN KEY (disciplina_id) REFERENCES DISCIPLINA(disciplina_id)
);

CREATE TABLE SENSOR (
    sensor_id  SERIAL PRIMARY KEY,
    maquina_id INT NOT NULL,
    nombre     VARCHAR(100) NOT NULL,
    codigo     VARCHAR(50)  UNIQUE NOT NULL,
    CONSTRAINT fk_sensor_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id)
);

-- ==========================================
-- 4. TOPOLOGÍA
-- ==========================================
CREATE TABLE TOPOLOGIA_ZONA (
    zona_id     SERIAL PRIMARY KEY,
    planta_id   INT NOT NULL,
    nombre      VARCHAR(120) NOT NULL,
    color       VARCHAR(20),
    descripcion VARCHAR(255),
    CONSTRAINT fk_zona_planta FOREIGN KEY (planta_id) REFERENCES PLANTA(planta_id)
);

CREATE TABLE TOPOLOGIA_NODO (
    nodo_id    SERIAL PRIMARY KEY,
    planta_id  INT NOT NULL,
    maquina_id INT,
    sensor_id  INT,
    tipo       tipo_nodo NOT NULL,
    nombre     VARCHAR(120) NOT NULL,
    categoria  VARCHAR(60),
    position_x DECIMAL(10,2) NOT NULL,
    position_y DECIMAL(10,2) NOT NULL,
    position_z DECIMAL(10,2),
    estado     estado_nodo NOT NULL DEFAULT 'operational',
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_nodo_planta   FOREIGN KEY (planta_id)  REFERENCES PLANTA(planta_id),
    CONSTRAINT fk_nodo_maquina  FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_nodo_sensor   FOREIGN KEY (sensor_id)  REFERENCES SENSOR(sensor_id)
);

CREATE TABLE ZONA_NODO (
    zona_id INT NOT NULL,
    nodo_id INT NOT NULL,
    PRIMARY KEY (zona_id, nodo_id),
    CONSTRAINT fk_zn_zona FOREIGN KEY (zona_id) REFERENCES TOPOLOGIA_ZONA(zona_id) ON DELETE CASCADE,
    CONSTRAINT fk_zn_nodo FOREIGN KEY (nodo_id) REFERENCES TOPOLOGIA_NODO(nodo_id) ON DELETE CASCADE
);

CREATE TABLE TOPOLOGIA_CONEXION (
    conexion_id     SERIAL PRIMARY KEY,
    nodo_origen_id  INT NOT NULL,
    nodo_destino_id INT NOT NULL,
    tipo            tipo_conexion NOT NULL,
    label           VARCHAR(120),
    bidirectional   BOOLEAN NOT NULL DEFAULT FALSE,
    bandwidth       VARCHAR(40),
    strength        INT,
    estado          estado_conexion NOT NULL DEFAULT 'active',
    CONSTRAINT fk_conexion_origen  FOREIGN KEY (nodo_origen_id)  REFERENCES TOPOLOGIA_NODO(nodo_id) ON DELETE CASCADE,
    CONSTRAINT fk_conexion_destino FOREIGN KEY (nodo_destino_id) REFERENCES TOPOLOGIA_NODO(nodo_id) ON DELETE CASCADE
);

-- ==========================================
-- 5. DIAGNÓSTICO
-- ==========================================
CREATE TABLE SESION_DEBUG (
    sesion_id  SERIAL PRIMARY KEY,
    maquina_id INT NOT NULL,
    tecnico_id INT NOT NULL,
    CONSTRAINT fk_sesion_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_sesion_tecnico FOREIGN KEY (tecnico_id) REFERENCES USUARIO(usuario_id)
);

CREATE TABLE DIAGNOSTICO (
    diagnostico_id SERIAL PRIMARY KEY,
    sesion_id      INT NOT NULL,
    descripcion    TEXT NOT NULL,
    severidad      nivel_severidad NOT NULL,
    CONSTRAINT fk_diagnostico_sesion FOREIGN KEY (sesion_id) REFERENCES SESION_DEBUG(sesion_id)
);

-- ==========================================
-- 6. GESTIÓN Y OPERACIÓN
-- ==========================================
CREATE TABLE REPORTE (
    reporte_id       SERIAL PRIMARY KEY,
    report_number    VARCHAR(40) UNIQUE NOT NULL,
    sesion_id        INT,
    diagnostico_id   INT,
    maquina_id       INT NOT NULL,
    tecnico_id       INT NOT NULL,
    summary          TEXT,
    issue_description TEXT NOT NULL,
    resolution       TEXT,
    actions_taken    JSONB,
    additional_notes TEXT,
    severity         nivel_severidad NOT NULL,
    downtime_minutes INT,
    pdf_url          VARCHAR(500),
    repository_url   VARCHAR(500),
    estado           estado_reporte NOT NULL DEFAULT 'draft',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_at      TIMESTAMP,
    approved_by      INT,
    CONSTRAINT fk_reporte_sesion    FOREIGN KEY (sesion_id)      REFERENCES SESION_DEBUG(sesion_id),
    CONSTRAINT fk_reporte_diag      FOREIGN KEY (diagnostico_id) REFERENCES DIAGNOSTICO(diagnostico_id),
    CONSTRAINT fk_reporte_maquina   FOREIGN KEY (maquina_id)     REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_reporte_tecnico   FOREIGN KEY (tecnico_id)     REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_reporte_aprobador FOREIGN KEY (approved_by)    REFERENCES USUARIO(usuario_id)
);

CREATE TABLE ORDEN_TRABAJO (
    ot_id                 SERIAL PRIMARY KEY,
    numero_ot             VARCHAR(40) UNIQUE NOT NULL,
    maquina_id            INT NOT NULL,
    tecnico_id            INT NOT NULL,
    creado_por            INT NOT NULL,
    diagnostico_id        INT,
    reporte_id            INT,
    tipo                  tipo_mantenimiento NOT NULL,
    descripcion_problema  TEXT,
    descripcion_reparacion TEXT,
    resolution            TEXT,
    priority              prioridad_ot NOT NULL,
    severity              nivel_severidad,
    fecha_creacion        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_inicio          TIMESTAMP,
    fecha_cierre          TIMESTAMP,
    fecha_vencimiento     TIMESTAMP,
    tiempo_reparacion_min INT,
    downtime_minutes      INT,
    costo_estimado        DECIMAL(12,2),
    costo_real            DECIMAL(12,2),
    estado                estado_ot NOT NULL DEFAULT 'pending',
    CONSTRAINT fk_ot_maquina     FOREIGN KEY (maquina_id)     REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_ot_tecnico     FOREIGN KEY (tecnico_id)     REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_ot_creador     FOREIGN KEY (creado_por)     REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_ot_diagnostico FOREIGN KEY (diagnostico_id) REFERENCES DIAGNOSTICO(diagnostico_id),
    CONSTRAINT fk_ot_reporte     FOREIGN KEY (reporte_id)     REFERENCES REPORTE(reporte_id)
);

CREATE TABLE OT_FOTO (
    ot_foto_id    SERIAL PRIMARY KEY,
    ot_id         INT NOT NULL,
    file_name     VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    content_type  VARCHAR(100) NOT NULL,
    file_path     VARCHAR(500) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ot_foto_ot FOREIGN KEY (ot_id) REFERENCES ORDEN_TRABAJO(ot_id) ON DELETE CASCADE
);

-- ==========================================
-- 7. PLANIFICACIÓN PREVENTIVA
-- ==========================================
CREATE TABLE PROGRAMA_MANTENIMIENTO (
    programa_id           SERIAL PRIMARY KEY,
    maquina_id            INT NOT NULL,
    creado_por            INT NOT NULL,
    nombre                VARCHAR(150) NOT NULL,
    descripcion           TEXT,
    instrucciones         TEXT,
    frecuencia            frecuencia_mant NOT NULL,
    intervalo_dias        INT,
    priority              prioridad_mant NOT NULL,
    duracion_estimada_min INT,
    costo_estimado        DECIMAL(12,2),
    fecha_inicio          DATE NOT NULL,
    proxima_ejecucion     TIMESTAMP,
    ultima_ejecucion      TIMESTAMP,
    estado                estado_programa NOT NULL DEFAULT 'active',
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_prog_maquina  FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_prog_usuario  FOREIGN KEY (creado_por) REFERENCES USUARIO(usuario_id)
);

CREATE TABLE EJECUCION_PROGRAMA (
    ejecucion_id    SERIAL PRIMARY KEY,
    programa_id     INT NOT NULL,
    ot_id           INT,
    tecnico_id      INT,
    fecha_programada TIMESTAMP NOT NULL,
    fecha_ejecutada  TIMESTAMP,
    estado           estado_ejecucion NOT NULL DEFAULT 'scheduled',
    notes            TEXT,
    CONSTRAINT fk_ejec_programa FOREIGN KEY (programa_id) REFERENCES PROGRAMA_MANTENIMIENTO(programa_id) ON DELETE CASCADE,
    CONSTRAINT fk_ejec_ot       FOREIGN KEY (ot_id)       REFERENCES ORDEN_TRABAJO(ot_id),
    CONSTRAINT fk_ejec_tecnico  FOREIGN KEY (tecnico_id)  REFERENCES USUARIO(usuario_id)
);

-- ==========================================
-- 8. LOGS Y DATOS MASIVOS
-- ==========================================
CREATE TABLE OT_REPUESTO (
    ot_repuesto_id SERIAL PRIMARY KEY,
    ot_id          INT NOT NULL,
    repuesto_id    INT NOT NULL,
    cantidad       DECIMAL(10,2) NOT NULL,
    costo_unitario DECIMAL(12,2),
    notas          VARCHAR(255),
    fecha_uso      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ot_repuesto_ot   FOREIGN KEY (ot_id)       REFERENCES ORDEN_TRABAJO(ot_id) ON DELETE CASCADE,
    CONSTRAINT fk_ot_repuesto_item FOREIGN KEY (repuesto_id) REFERENCES REPUESTO(repuesto_id)
);

CREATE TABLE OT_AUDIT_LOG (
    audit_id       SERIAL PRIMARY KEY,
    ot_id          INT NOT NULL,
    usuario_id     INT NOT NULL,
    estado_anterior VARCHAR(40),
    estado_nuevo   VARCHAR(40) NOT NULL,
    comentario     VARCHAR(500),
    timestamp      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_ot      FOREIGN KEY (ot_id)      REFERENCES ORDEN_TRABAJO(ot_id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_usuario FOREIGN KEY (usuario_id) REFERENCES USUARIO(usuario_id)
);

CREATE TABLE LECTURA_SENSOR (
    lectura_id SERIAL PRIMARY KEY,
    sensor_id  INT NOT NULL,
    valor      DECIMAL(14,4) NOT NULL,
    timestamp  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado     estado_lectura NOT NULL DEFAULT 'normal',
    CONSTRAINT fk_lectura_sensor FOREIGN KEY (sensor_id) REFERENCES SENSOR(sensor_id) ON DELETE CASCADE
);

-- ==========================================
-- 9. SEED DATA (Masivo > 10 por tabla)
-- ==========================================

-- 9.1 Plantas
INSERT INTO PLANTA (nombre, ubicacion) VALUES
('Planta Central San Bernardo', 'San Bernardo, Región Metropolitana, Chile'),
('Planta Norte Antofagasta', 'Antofagasta, Chile'),
('Planta Sur Concepción', 'Concepción, Chile');

-- 9.2 Usuarios (12 usuarios)
INSERT INTO USUARIO (nombre, email, password_hash, rol) VALUES
('Administrador BARB', 'admin@barb.com', 'admin123', 'admin'),
('Director Mantenimiento','gerente1@planta.com', 'gerente123', 'gerente'),
('Subgerente Operaciones','gerente2@planta.com', 'gerente123', 'gerente'),
('Carlos Mendoza', 'carlos@planta.com', 'tecnico123', 'tecnico'),
('Ana Silva', 'ana@planta.com', 'tecnico123', 'tecnico'),
('Roberto Tapia', 'roberto@planta.com', 'tecnico123', 'tecnico'),
('Luisa Martínez', 'luisa@planta.com', 'tecnico123', 'tecnico'),
('Jorge Soto', 'jorge@planta.com', 'tecnico123', 'tecnico'),
('Ingeniero de Procesos', 'engineer1@planta.com', 'engineer123', 'engineer'),
('Supervisor Turno A', 'supervisor1@planta.com', 'super123', 'supervisor'),
('Operador Molino', 'operador1@planta.com', 'operador123', 'operador'),
('Operador Grúa', 'operador2@planta.com', 'operador123', 'operador');

-- 9.3 Disciplinas (10 disciplinas)
INSERT INTO DISCIPLINA (nombre, color) VALUES
('Mecánica', 'blue'),
('Eléctrica', 'yellow'),
('Hidráulica', 'cyan'),
('Neumática', 'purple'),
('Automatización', 'green'),
('Estructural', 'gray'),
('HVAC', 'orange'),
('Instrumentación', 'teal'),
('Lubricación', 'indigo'),
('Robótica', 'pink');

-- 9.4 Máquinas (12 máquinas)
INSERT INTO MAQUINA (planta_id, disciplina_id, nombre, codigo) VALUES
(1, 1, 'Compressor A1', 'COMP-A1'),
(1, 2, 'Motor Drive D1', 'MOTOR-D1'),
(1, 3, 'Hydraulic Press B3', 'PRESS-B3'),
(1, 3, 'Pump E4', 'PUMP-E4'),
(1, 4, 'Compresor Neumático N2', 'COMP-N2'),
(1, 10, 'Brazo Robótico KUKA 1', 'ROB-K1'),
(1, 5, 'PLC Siemens S7 Principal', 'PLC-S7'),
(1, 1, 'Cinta Transportadora C1', 'CINT-C1'),
(1, 2, 'Generador de Respaldo G1', 'GEN-G1'),
(1, 3, 'Válvula de Presión V8', 'VALV-V8'),
(1, 7, 'Sistema Chiller Central', 'CHILL-01'),
(1, 8, 'Analizador de Gases', 'GAS-001');

-- 9.5 Repuestos (12 repuestos)
INSERT INTO REPUESTO (codigo, part_number, nombre, descripcion, tipo, categoria, unidad, stock_actual, stock_minimo, costo_unitario, estado) VALUES
('REP-001', 'FIL-1029', 'Filtro Hidráulico', 'Filtro de 10 micrones', 'Consumible', 'Hidráulica', 'Unidad', 15, 5, 45.00, 'active'),
('REP-002', 'VAL-9921', 'Válvula Proporcional', 'Válvula 24V DC', 'Componente', 'Automatización', 'Unidad', 2, 1, 350.00, 'active'),
('REP-003', 'SENS-011', 'Sensor Vibración', 'Sensor piezoeléctrico', 'Sensor', 'Instrumentación', 'Unidad', 8, 3, 120.00, 'active'),
('REP-004', 'BELT-44', 'Correa Transmisión', 'Correa de caucho', 'Consumible', 'Mecánica', 'Unidad', 20, 10, 25.00, 'active'),
('REP-005', 'PLC-MOD', 'Módulo E/S PLC', '16 entradas', 'Electrónica', 'Automatización', 'Unidad', 4, 2, 450.00, 'active'),
('REP-006', 'BRG-608', 'Rodamiento 608ZZ', 'Acero inox', 'Consumible', 'Mecánica', 'Unidad', 50, 20, 5.00, 'active'),
('REP-007', 'LUB-001', 'Aceite Sintético', 'Tambor 20L', 'Consumible', 'Lubricación', 'Litro', 100, 40, 12.00, 'active'),
('REP-008', 'FUS-10A', 'Fusible 10A', 'Cerámico', 'Consumible', 'Eléctrica', 'Unidad', 200, 50, 1.50, 'active'),
('REP-009', 'MOT-3HP', 'Motor 3HP', 'Trifásico', 'Componente', 'Eléctrica', 'Unidad', 3, 1, 600.00, 'active'),
('REP-010', 'CYL-PN', 'Cilindro Neumático', 'Doble efecto', 'Componente', 'Neumática', 'Unidad', 5, 2, 180.00, 'active'),
('REP-011', 'TER-01', 'Termocupla Tipo K', 'Alta temp', 'Sensor', 'Instrumentación', 'Unidad', 12, 5, 35.00, 'active'),
('REP-012', 'BOM-AG', 'Bomba Centrífuga', 'Acero Inox', 'Componente', 'Hidráulica', 'Unidad', 2, 1, 850.00, 'active');

-- 9.6 Sensores (10 sensores)
INSERT INTO SENSOR (maquina_id, nombre, codigo) VALUES
(1, 'Temp. Compresor', 'ST-COMP1'),
(1, 'Presión Salida', 'SP-COMP1'),
(3, 'Nivel Aceite Prensa', 'SL-PRESS3'),
(3, 'Vibración Cilindro', 'SV-PRESS3'),
(2, 'Temp. Motor D1', 'ST-MOT1'),
(6, 'Encoder Eje X', 'SE-ROB1'),
(7, 'Temp. Procesador PLC', 'ST-PLC1'),
(8, 'Velocidad Cinta', 'SS-CINT1'),
(9, 'Voltaje Generador', 'SV-GEN1'),
(11, 'Flujo Chiller', 'SF-CHILL1');

-- 9.7 Lecturas de Sensores (20 lecturas)
INSERT INTO LECTURA_SENSOR (sensor_id, valor, estado) VALUES
(1, 85.5, 'normal'), (1, 86.1, 'normal'), (1, 95.0, 'warning'), (1, 105.0, 'critical'),
(2, 120.4, 'normal'), (2, 118.9, 'normal'),
(3, 45.2, 'warning'), (3, 40.1, 'critical'),
(4, 2.3, 'normal'), (4, 4.8, 'critical'),
(5, 60.0, 'normal'), (5, 62.5, 'normal'),
(6, 1500.0, 'normal'), (6, 1495.0, 'normal'),
(7, 45.0, 'normal'), (7, 46.5, 'normal'),
(8, 5.0, 'normal'), (8, 0.0, 'critical'),
(9, 220.0, 'normal'), (10, 50.0, 'normal');

-- 9.8 Topología: Zonas (10 zonas)
INSERT INTO TOPOLOGIA_ZONA (planta_id, nombre, color, descripcion) VALUES
(1, 'Zona de Control', '#3b82f6', 'Gabinete eléctrico principal'),
(1, 'Zona de Potencia y Motores', '#ef4444', 'Servomotores X,Y,Z'),
(1, 'Zona de Fluidos', '#06b6d4', 'Refrigeración'),
(1, 'Zona de Prensado', '#f59e0b', 'Prensas y troqueladoras'),
(1, 'Línea de Empaque', '#10b981', 'Robótica final'),
(1, 'Cuarto de Compresores', '#8b5cf6', 'Aire comprimido'),
(1, 'Subestación Eléctrica', '#f97316', 'Energía y respaldo'),
(1, 'Laboratorio Calidad', '#14b8a6', 'Análisis gases'),
(1, 'Zona de Soldadura', '#ec4899', 'Robots soldadores'),
(1, 'Bodega de Materia Prima', '#64748b', 'Almacenamiento');

-- 9.9 Topología: Nodos (12 nodos mezclando máquinas y hubs)
INSERT INTO TOPOLOGIA_NODO (planta_id, maquina_id, tipo, nombre, categoria, position_x, position_y, estado) VALUES
(1, NULL, 'hub', 'HMI Panel Control', 'Control', 100, 250, 'operational'),
(1, 7, 'controller', 'PLC Siemens S7', 'Control', 250, 250, 'operational'),
(1, NULL, 'controller', 'Variador Frecuencia', 'Potencia', 400, 100, 'operational'),
(1, 2, 'machine', 'Motor Husillo', 'Motriz', 550, 100, 'operational'),
(1, NULL, 'controller', 'Servo Driver X', 'Potencia', 400, 220, 'operational'),
(1, 6, 'machine', 'Brazo Robótico X', 'Robótica', 550, 220, 'warning'),
(1, 3, 'machine', 'Prensa Hidráulica', 'Prensado', 700, 220, 'error'),
(1, 4, 'machine', 'Bomba Refrigerante', 'Fluidos', 400, 460, 'operational'),
(1, 1, 'machine', 'Compresor Aire', 'Neumática', 250, 460, 'warning'),
(1, NULL, 'sensor', 'Sensor Flujo Main', 'Instrumentación', 100, 460, 'operational'),
(1, 8, 'machine', 'Cinta Transportadora', 'Logística', 850, 220, 'operational'),
(1, 9, 'machine', 'Generador', 'Eléctrica', 250, 600, 'operational');

-- 9.10 Topología: Conexiones (15 conexiones)
INSERT INTO TOPOLOGIA_CONEXION (nodo_origen_id, nodo_destino_id, tipo, label, bidirectional) VALUES
(1, 2, 'data', 'Control Ethernet', true),
(2, 3, 'data', 'Modbus RTU', true),
(3, 4, 'electrical', 'Potencia 380V', false),
(2, 5, 'data', 'Profibus', true),
(5, 6, 'electrical', 'Potencia y Feedback', true),
(6, 7, 'mechanical', 'Fuerza de prensado', false),
(2, 8, 'electrical', 'Relé 24V', false),
(8, 7, 'hydraulic', 'Línea de aceite', false),
(9, 7, 'pneumatic', 'Línea de aire', false),
(10, 2, 'data', 'Señal 4-20mA', false),
(6, 11, 'mechanical', 'Transferencia piezas', false),
(2, 11, 'data', 'Control VDF Cinta', true),
(12, 2, 'electrical', 'Respaldo UPS', false),
(12, 1, 'electrical', 'Respaldo UPS', false),
(12, 3, 'electrical', 'Respaldo UPS', false);

-- 9.11 Órdenes de Trabajo (20 OTs para gráficas completas)
INSERT INTO ORDEN_TRABAJO (numero_ot, maquina_id, tecnico_id, creado_por, tipo, descripcion_problema, descripcion_reparacion, priority, severity, fecha_creacion, fecha_inicio, fecha_cierre, tiempo_reparacion_min, costo_estimado, costo_real, estado) VALUES
('OT-2026-001', 1, 4, 2, 'preventive', 'Mant. preventivo', 'Cambio filtros', 'low', 'low', '2026-05-10 08:00:00', '2026-05-10 08:30:00', '2026-05-10 10:30:00', 120, 150.00, 145.00, 'completed'),
('OT-2026-002', 3, 4, 2, 'corrective', 'Fuga hidráulica', 'Reemplazo manguera', 'urgent', 'critical', '2026-05-11 14:15:00', '2026-05-11 14:20:00', '2026-05-11 15:05:00', 45, 500.00, 620.00, 'completed'),
('OT-2026-003', 2, 5, 2, 'inspection', 'Ruido anómalo', NULL, 'low', 'medium', '2026-05-17 09:00:00', NULL, NULL, NULL, 50.00, NULL, 'pending'),
('OT-2026-004', 4, 6, 2, 'predictive', 'Alerta vibración', 'Alineación', 'high', 'high', '2026-05-18 10:00:00', '2026-05-18 10:30:00', NULL, NULL, 300.00, NULL, 'in_progress'),
('OT-2026-005', 1, 4, 2, 'corrective', 'Falla eléctrica', 'Botón atascado', 'medium', 'low', '2026-05-12 11:00:00', '2026-05-12 11:10:00', '2026-05-12 11:15:00', 5, 0.00, 0.00, 'cancelled'),
('OT-2026-006', 2, 5, 2, 'preventive', 'Calibración', NULL, 'medium', 'medium', '2026-05-01 08:00:00', NULL, NULL, NULL, 100.00, NULL, 'overdue'),
('OT-2026-007', 3, 4, 2, 'corrective', 'Error E-041', 'Reset válvula', 'high', 'high', '2026-05-15 16:00:00', '2026-05-15 16:05:00', '2026-05-15 16:35:00', 30, 0.00, 15.00, 'completed'),
('OT-2026-008', 4, 6, 2, 'inspection', 'Revisión aceite', NULL, 'low', 'low', '2026-05-18 07:00:00', NULL, NULL, NULL, 30.00, NULL, 'assigned'),
('OT-2026-009', 8, 5, 2, 'corrective', 'Corte banda', 'Empalme térmico', 'urgent', 'critical', '2026-05-14 02:00:00', '2026-05-14 02:15:00', '2026-05-14 06:15:00', 240, 1200.00, 1450.00, 'completed'),
('OT-2026-010', 7, 4, 2, 'predictive', 'Punto caliente', 'Reapriete', 'medium', 'medium', '2026-05-16 09:00:00', '2026-05-16 09:30:00', '2026-05-16 10:15:00', 45, 80.00, 45.00, 'completed'),
('OT-2026-011', 5, 6, 2, 'corrective', 'Fuga manguera', 'Cambio manguera', 'high', 'high', '2026-05-19 14:00:00', '2026-05-19 14:15:00', '2026-05-19 15:30:00', 75, 120.00, 95.00, 'completed'),
('OT-2026-012', 6, 5, 2, 'predictive', 'Anomalía encoder', 'Recalibración', 'medium', 'medium', '2026-05-20 09:30:00', '2026-05-20 10:00:00', '2026-05-20 10:45:00', 45, 0.00, 0.00, 'completed'),
('OT-2026-013', 7, 4, 2, 'preventive', 'Update firmware', 'Flasheo', 'low', 'low', '2026-05-21 23:00:00', '2026-05-21 23:15:00', '2026-05-22 00:15:00', 60, 0.00, 0.00, 'completed'),
('OT-2026-014', 8, 6, 2, 'corrective', 'Cinta atascada', 'Ajuste tensores', 'urgent', 'critical', '2026-05-22 11:00:00', '2026-05-22 11:05:00', '2026-05-22 12:45:00', 100, 200.00, 250.00, 'completed'),
('OT-2026-015', 9, 5, 2, 'inspection', 'Prueba carga', NULL, 'medium', 'medium', '2026-05-23 08:00:00', NULL, NULL, NULL, 50.00, NULL, 'assigned'),
('OT-2026-016', 10, 4, 2, 'corrective', 'Válvula no cierra', 'Cambio sellos', 'high', 'high', '2026-05-24 15:30:00', '2026-05-24 16:00:00', '2026-05-24 17:15:00', 75, 80.00, 90.00, 'completed'),
('OT-2026-017', 3, 6, 2, 'corrective', 'Ruido extremo', 'Cambio guías', 'urgent', 'critical', '2026-05-25 10:00:00', '2026-05-25 10:15:00', '2026-05-25 13:30:00', 195, 450.00, 500.00, 'completed'),
('OT-2026-018', 1, 5, 2, 'predictive', 'Termografía ALTA', NULL, 'medium', 'medium', '2026-05-26 09:00:00', '2026-05-26 09:30:00', NULL, NULL, 150.00, NULL, 'in_progress'),
('OT-2026-019', 2, 4, 2, 'preventive', 'Lubricación', 'Engrase', 'low', 'low', '2026-05-26 14:00:00', '2026-05-26 14:30:00', '2026-05-26 15:00:00', 30, 25.00, 20.00, 'completed'),
('OT-2026-020', 4, 6, 2, 'corrective', 'Falla rodamientos', NULL, 'high', 'critical', '2026-05-27 08:00:00', NULL, NULL, NULL, 600.00, NULL, 'pending');

-- 9.12 OT Repuestos (15 items)
INSERT INTO OT_REPUESTO (ot_id, repuesto_id, cantidad, costo_unitario) VALUES
(2, 1, 2, 45.00), (9, 4, 1, 25.00), (17, 2, 1, 350.00), (1, 1, 1, 45.00), (11, 10, 1, 180.00),
(14, 4, 2, 25.00), (16, 2, 1, 350.00), (19, 7, 5, 12.00), (4, 3, 1, 120.00), (7, 2, 1, 350.00);

-- 9.13 Sesiones Debug y Diagnóstico de IA (10 sesiones)
INSERT INTO SESION_DEBUG (maquina_id, tecnico_id) VALUES
(3, 4), (3, 6), (1, 4), (8, 5), (6, 5), (7, 4), (10, 4), (2, 5), (4, 6), (9, 5);

INSERT INTO DIAGNOSTICO (sesion_id, descripcion, severidad) VALUES
(1, 'IA: Fuga detectada en manguera P2. Rápida caída de presión analizada.', 'critical'),
(2, 'IA: Vibración armónica sugiere desgaste en guías de bronce eje Z.', 'critical'),
(3, 'IA: Botón de parada atascado mecánicamente.', 'low'),
(4, 'IA: Sobrecarga del motor por tensor desalineado.', 'high'),
(5, 'IA: Fallo de encoder por suciedad en disco óptico.', 'medium'),
(6, 'IA: Firmware obsoleto causando reinicios aleatorios.', 'low'),
(7, 'IA: Sellos tóricos de la válvula degradados por temperatura.', 'high'),
(8, 'IA: Resonancia acústica normal, requiere lubricación estándar.', 'low'),
(9, 'IA: Falla catastrófica inminente en rodamiento principal.', 'critical'),
(10, 'IA: Ciclo de carga del generador requiere calibración de AVR.', 'medium');

-- 9.14 Programas Preventivos (10 programas)
INSERT INTO PROGRAMA_MANTENIMIENTO (maquina_id, creado_por, nombre, frecuencia, intervalo_dias, priority, duracion_estimada_min, fecha_inicio) VALUES
(1, 2, 'Revisión Filtros', 'monthly', 30, 'medium', 45, '2026-01-01'),
(3, 2, 'Cambio Aceite', 'yearly', 365, 'high', 240, '2026-01-15'),
(6, 2, 'Calibración Brazo', 'quarterly', 90, 'high', 120, '2026-02-01'),
(7, 2, 'Respaldo PLC', 'monthly', 30, 'low', 30, '2026-01-10'),
(8, 2, 'Tensión Cintas', 'weekly', 7, 'medium', 60, '2026-01-05'),
(9, 2, 'Prueba Generador', 'monthly', 30, 'high', 120, '2026-01-20'),
(2, 2, 'Engrase Motores', 'quarterly', 90, 'medium', 90, '2026-03-01'),
(10, 2, 'Test Estanqueidad', 'yearly', 365, 'high', 180, '2026-04-01'),
(11, 2, 'Limpieza Chiller', 'quarterly', 90, 'medium', 200, '2026-02-15'),
(12, 2, 'Calibración Gases', 'monthly', 30, 'high', 60, '2026-01-02');

-- 9.15 Reportes (10 reportes)
INSERT INTO REPORTE (report_number, sesion_id, diagnostico_id, maquina_id, tecnico_id, summary, issue_description, severity, estado) VALUES
('RPT-2026-001', 1, 1, 3, 4, 'Reemplazo manguera', 'Pérdida de presión', 'critical', 'approved'),
('RPT-2026-002', 2, 2, 3, 6, 'Cambio guías', 'Ruido extremo', 'critical', 'approved'),
('RPT-2026-003', 3, 3, 1, 4, 'Destrabe botón', 'No encendía', 'low', 'approved'),
('RPT-2026-004', 4, 4, 8, 5, 'Empalme térmico', 'Cinta cortada', 'critical', 'approved'),
('RPT-2026-005', 5, 5, 6, 5, 'Limpieza encoder', 'Perdía posición', 'medium', 'approved'),
('RPT-2026-006', 6, 6, 7, 4, 'Flasheo PLC', 'Reinicios', 'low', 'approved'),
('RPT-2026-007', 7, 7, 10, 4, 'Cambio sellos', 'No cerraba', 'high', 'approved'),
('RPT-2026-008', 8, 8, 2, 5, 'Lubricación 3', 'Ruido ligero', 'low', 'generated'),
('RPT-2026-009', 9, 9, 4, 6, 'Cambio rodamiento', 'Falla inminente', 'critical', 'draft'),
('RPT-2026-010', 10, 10, 9, 5, 'Ajuste AVR', 'Fluctuación', 'medium', 'draft');

-- Enlazando OTs a Reportes
UPDATE ORDEN_TRABAJO SET reporte_id = 1 WHERE numero_ot = 'OT-2026-002';
UPDATE ORDEN_TRABAJO SET reporte_id = 2 WHERE numero_ot = 'OT-2026-017';
UPDATE ORDEN_TRABAJO SET reporte_id = 3 WHERE numero_ot = 'OT-2026-005';
UPDATE ORDEN_TRABAJO SET reporte_id = 4 WHERE numero_ot = 'OT-2026-009';

-- 9.16 Audit Log (10 logs)
INSERT INTO OT_AUDIT_LOG (ot_id, usuario_id, estado_anterior, estado_nuevo, comentario) VALUES
(1, 2, NULL, 'pending', 'Creada por sistema'),
(1, 2, 'pending', 'assigned', 'Asignada a Ana'),
(1, 4, 'assigned', 'in_progress', 'Inicio trabajos'),
(1, 4, 'in_progress', 'completed', 'Fin trabajos'),
(2, 2, NULL, 'pending', 'Reporte falla'),
(2, 2, 'pending', 'assigned', 'Urgente para Ana'),
(2, 4, 'assigned', 'in_progress', 'Corte suministro hidráulico'),
(2, 4, 'in_progress', 'completed', 'Reparación exitosa'),
(5, 2, NULL, 'pending', 'Botón trabado'),
(5, 4, 'pending', 'cancelled', 'Cancelada, operario lo destrabó manualmente');