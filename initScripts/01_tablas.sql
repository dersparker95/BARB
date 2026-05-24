-- ==========================================
-- BARB DATABASE — Schema unificado v2.0
-- Fusión de 01_tablas.sql + 02_init.sql
-- ==========================================

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

-- USUARIO: agregado password_hash para autenticación
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

-- DISCIPLINA: mantenida del 01_tablas.sql
CREATE TABLE DISCIPLINA (
    disciplina_id SERIAL PRIMARY KEY,
    nombre        VARCHAR(50) UNIQUE NOT NULL,
    color         VARCHAR(20)
);

-- MAQUINA: con FK a DISCIPLINA (del 01) + codigo del 02
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
-- 9. SEED DATA
-- ==========================================

-- 9.1 Planta
INSERT INTO PLANTA (nombre, ubicacion) VALUES
('Planta Central San Bernardo', 'San Bernardo, Región Metropolitana, Chile');

-- 9.2 Usuarios con contraseñas
-- IMPORTANTE: password_hash contiene texto plano por ahora.
-- Reemplazar por bcrypt hashes reales cuando el backend esté listo.
-- Contraseñas: admin123 / gerente123 / tecnico123 / tecnico123
INSERT INTO USUARIO (nombre, email, password_hash, rol) VALUES
('Administrador BARB',       'admin@barb.com',            'admin123',    'admin'),
('Director de Mantenimiento','supervisor.barb@planta.com', 'gerente123',  'gerente'),
('Carlos Mendoza',           'carlos.mendoza@planta.com',  'tecnico123',  'tecnico'),
('Ana Silva',                'ana.silva@planta.com',       'tecnico123',  'tecnico'),
('Roberto Tapia',            'roberto.tapia@planta.com',   'tecnico123',  'tecnico');

-- 9.3 Disciplinas
INSERT INTO DISCIPLINA (nombre, color) VALUES
('Mecánica',       'blue'),
('Eléctrica',      'yellow'),
('Hidráulica',     'cyan'),
('Neumática',      'purple'),
('Automatización', 'green');

-- 9.4 Máquinas (planta_id=1)
INSERT INTO MAQUINA (planta_id, disciplina_id, nombre, codigo) VALUES
(1, 1, 'Compressor A1',      'COMP-A1'),
(1, 2, 'Motor Drive D1',     'MOTOR-D1'),
(1, 3, 'Hydraulic Press B3', 'PRESS-B3'),
(1, 3, 'Pump E4',            'PUMP-E4');

-- 9.5 10 Órdenes de Trabajo
-- tecnico_id 3=Carlos, 4=Ana, 5=Roberto | creado_por 2=Director
INSERT INTO ORDEN_TRABAJO (
    numero_ot, maquina_id, tecnico_id, creado_por, tipo,
    descripcion_problema, descripcion_reparacion, resolution,
    priority, severity, fecha_creacion, fecha_inicio, fecha_cierre,
    fecha_vencimiento, tiempo_reparacion_min, downtime_minutes,
    costo_estimado, costo_real, estado
) VALUES
('OT-2026-001', 1, 3, 2, 'preventive',
 'Mantenimiento preventivo trimestral.',
 'Se cambiaron filtros y lubricaron rodamientos.',
 'Operación exitosa.',
 'low', 'low',
 '2026-05-10 08:00:00', '2026-05-10 08:30:00', '2026-05-10 10:30:00',
 '2026-05-15 00:00:00', 120, 120, 150.00, 145.50, 'completed'),

('OT-2026-002', 3, 3, 2, 'corrective',
 'Pérdida de presión hidráulica.',
 'Se reemplazó manguera de alta presión.',
 'Fuga contenida.',
 'urgent', 'critical',
 '2026-05-11 14:15:00', '2026-05-11 14:20:00', '2026-05-11 15:05:00',
 '2026-05-11 18:00:00', 45, 45, 500.00, 620.00, 'completed'),

('OT-2026-003', 2, 5, 2, 'inspection',
 'Ruido anómalo reportado.',
 NULL, NULL,
 'low', 'medium',
 '2026-05-17 09:00:00', NULL, NULL,
 '2026-05-20 18:00:00', NULL, 0, 50.00, NULL, 'pending'),

('OT-2026-004', 4, 4, 2, 'predictive',
 'Alerta de vibración en motor.',
 'Analizando alineación.',
 NULL,
 'high', 'high',
 '2026-05-18 10:00:00', '2026-05-18 10:30:00', NULL,
 '2026-05-19 12:00:00', NULL, 60, 300.00, NULL, 'in_progress'),

('OT-2026-005', 1, 3, 2, 'corrective',
 'Falla eléctrica en panel.',
 'Botón atascado.',
 'Se liberó botón.',
 'medium', 'low',
 '2026-05-12 11:00:00', '2026-05-12 11:10:00', '2026-05-12 11:15:00',
 '2026-05-13 18:00:00', 5, 5, 0.00, 0.00, 'cancelled'),

('OT-2026-006', 2, 5, 2, 'preventive',
 'Calibración de sensores.',
 NULL, NULL,
 'medium', 'medium',
 '2026-05-01 08:00:00', NULL, NULL,
 '2026-05-05 18:00:00', NULL, 0, 100.00, NULL, 'overdue'),

('OT-2026-007', 3, 3, 2, 'corrective',
 'Error E-041, prensa no baja.',
 'Se reseteó válvula proporcional.',
 'Equipo operativo.',
 'high', 'high',
 '2026-05-15 16:00:00', '2026-05-15 16:05:00', '2026-05-15 16:35:00',
 '2026-05-16 12:00:00', 30, 30, 0.00, 15.00, 'completed'),

('OT-2026-008', 4, 3, 2, 'inspection',
 'Revisión de niveles de aceite.',
 NULL, NULL,
 'low', 'low',
 '2026-05-18 07:00:00', NULL, NULL,
 '2026-05-19 10:00:00', NULL, 0, 30.00, NULL, 'assigned'),

('OT-2026-009', 2, 5, 2, 'corrective',
 'Corte de banda transportadora.',
 'Empalme térmico y recableado.',
 'Banda reparada.',
 'urgent', 'critical',
 '2026-05-14 02:00:00', '2026-05-14 02:15:00', '2026-05-14 06:15:00',
 '2026-05-14 08:00:00', 240, 240, 1200.00, 1450.00, 'completed'),

('OT-2026-010', 1, 3, 2, 'predictive',
 'Punto caliente en tablero.',
 'Reapriete de conexiones.',
 'Temperatura normal.',
 'medium', 'medium',
 '2026-05-16 09:00:00', '2026-05-16 09:30:00', '2026-05-16 10:15:00',
 '2026-05-17 18:00:00', 45, 0, 80.00, 45.00, 'completed');