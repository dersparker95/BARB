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

-- ==========================================
-- 3. TABLAS PRINCIPALES (Infraestructura)
-- ==========================================
CREATE TABLE MAQUINA (
    maquina_id SERIAL PRIMARY KEY,
    planta_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    CONSTRAINT fk_maquina_planta FOREIGN KEY (planta_id) REFERENCES PLANTA(planta_id)
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



-- INSERCIÓN DE DATOS BASE PARA PRUEBAS
INSERT INTO USUARIO (nombre, email, rol) VALUES 
('Tecnico Central', 'tecnico@barb.com', 'tecnico');

INSERT INTO PLANTA (nombre, ubicacion) VALUES 
('Planta Principal', 'Zona Industrial Norte');

-- Insertamos máquinas (asumiendo planta_id = 1)
INSERT INTO MAQUINA (planta_id, nombre, codigo) VALUES 
(1, 'Hydraulic Press B3', 'MCH-HYD-B3'),
(1, 'Robotic Arm A1', 'MCH-ROB-A1');