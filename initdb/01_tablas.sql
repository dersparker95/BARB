-- 1. Primero creamos el tipo ENUM para los roles (Postgres necesita esto antes)
CREATE TYPE rol_usuario AS ENUM ('technician', 'engineer', 'supervisor', 'admin');

-- 2. Ahora creamos la tabla tal cual la pediste
CREATE TABLE USUARIO (
    usuario_id SERIAL PRIMARY KEY, -- SERIAL es el equivalente a AUTO_INCREMENT
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(80) NOT NULL,
    apellido VARCHAR(80) NOT NULL,
    telefono VARCHAR(20),
    especialidad VARCHAR(80),
    rol rol_usuario NOT NULL, -- Usamos el tipo que creamos arriba
    permissions JSON,
    avatar_url VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMP, -- DATETIME se traduce como TIMESTAMP
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE AUTH_TOKEN (
    token_id SERIAL PRIMARY KEY, -- SERIAL para que sea autoincrementable en Postgres
    usuario_id INT NOT NULL,     -- Debe coincidir con el tipo de dato de USUARIO(usuario_id)
    refresh_token VARCHAR(512) UNIQUE NOT NULL,
    device_id VARCHAR(120),
    device_info VARCHAR(200),
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_usuario
        FOREIGN KEY (usuario_id) 
        REFERENCES USUARIO(usuario_id) 
        ON DELETE CASCADE
);

CREATE TYPE tipo_tema AS ENUM ('light', 'dark');
CREATE TYPE tipo_fuente AS ENUM ('small', 'medium', 'large');

CREATE TYPE estado_planta AS ENUM ('active', 'inactive', 'maintenance');




CREATE TABLE PLANTA (
    planta_id SERIAL PRIMARY KEY, -- Cambiado de BIGINT AUTO_INCREMENT a SERIAL
    nombre VARCHAR(120) NOT NULL,
    ubicacion VARCHAR(200),
    area VARCHAR(100),
    sector VARCHAR(80),
    estado estado_planta NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- DATETIME es TIMESTAMP
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE PREFERENCIA_USUARIO (
    usuario_id INT PRIMARY KEY,
    language CHAR(5) NOT NULL DEFAULT 'es',
    theme tipo_tema NOT NULL DEFAULT 'light',
    font_size tipo_fuente NOT NULL DEFAULT 'medium',
    notif_push BOOLEAN NOT NULL DEFAULT TRUE,
    notif_email BOOLEAN NOT NULL DEFAULT TRUE,
    notif_maintenance_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    default_plant_id INT,
    offline_mode BOOLEAN NOT NULL DEFAULT FALSE,
    auto_sync BOOLEAN NOT NULL DEFAULT TRUE,
    cache_size_max INT,
    download_wifi_only BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuario_pref
        FOREIGN KEY (usuario_id) REFERENCES USUARIO(usuario_id) ON DELETE CASCADE,
    CONSTRAINT fk_planta_defecto
        FOREIGN KEY (default_plant_id) REFERENCES PLANTA(planta_id) ON DELETE SET NULL
);


-- 1. Primero nos aseguramos de que existan los tipos ENUM para esta tabla
-- (Si ya los creaste en el paso anterior, Postgres simplemente te avisará)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_tema') THEN
        CREATE TYPE tipo_tema AS ENUM ('light', 'dark');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_fuente') THEN
        CREATE TYPE tipo_fuente AS ENUM ('small', 'medium', 'large');
    END IF;
END $$;

-- 2. Creamos la tabla PREFERENCIA_USUARIO



CREATE TABLE CATEGORIA_MAQUINA (
    categoria_id SERIAL PRIMARY KEY, -- Cambiado de BIGINT AUTO_INCREMENT a SERIAL
    nombre VARCHAR(80) UNIQUE NOT NULL,
    descripcion VARCHAR(255),
    icono VARCHAR(50)
);



CREATE TYPE estado_maquina AS ENUM ('operational', 'warning', 'maintenance', 'error', 'offline');

CREATE TABLE MAQUINA (
    maquina_id SERIAL PRIMARY KEY,
    planta_id INT NOT NULL,
    categoria_id INT,
    nombre VARCHAR(120) NOT NULL,
    tipo VARCHAR(60),
    modelo VARCHAR(80),
    fabricante VARCHAR(80),
    numero_serie VARCHAR(80) UNIQUE,
    fecha_instalacion DATE,
    estado estado_maquina NOT NULL DEFAULT 'operational',
    image_url VARCHAR(255),
    thumbnail_url VARCHAR(255),
    image_urls JSONB, -- Usamos JSONB para mejor rendimiento en Postgres
    spec_power VARCHAR(40),
    spec_voltage VARCHAR(40),
    spec_capacity VARCHAR(40),
    spec_width DECIMAL(10,2),
    spec_height DECIMAL(10,2),
    spec_depth DECIMAL(10,2),
    spec_weight DECIMAL(10,2),
    position_x DECIMAL(10,2),
    position_y DECIMAL(10,2),
    position_z DECIMAL(10,2),
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_maquina_planta
        FOREIGN KEY (planta_id) REFERENCES PLANTA(planta_id),
    CONSTRAINT fk_maquina_categoria
        FOREIGN KEY (categoria_id) REFERENCES CATEGORIA_MAQUINA(categoria_id)
);


CREATE TYPE tipo_actividad AS ENUM ('login', 'logout', 'debug', 'chat', 'report', 'upload');


CREATE TABLE LOG_ACTIVIDAD (
    activity_id SERIAL PRIMARY KEY, -- Equivalente a AUTO_INCREMENT
    usuario_id INT NOT NULL,        -- Conecta con USUARIO
    tipo tipo_actividad NOT NULL,   -- Usa el ENUM que creamos arriba
    descripcion VARCHAR(255) NOT NULL,
    maquina_id INT,                 -- Conecta con MAQUINA (opcional)
    session_id INT,                 -- Para rastrear sesiones de la App
    metadata JSONB,                 -- Usamos JSONB para mayor flexibilidad
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_usuario
        FOREIGN KEY (usuario_id) REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_log_maquina
        FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id)
);


CREATE TYPE estado_sensor AS ENUM ('normal', 'warning', 'critical', 'offline');


CREATE TABLE SENSOR (
    sensor_id SERIAL PRIMARY KEY,    -- SERIAL para autoincremento
    maquina_id INT NOT NULL,         -- Debe ser INT para conectar con MAQUINA
    nombre VARCHAR(80) NOT NULL,
    tipo VARCHAR(40) NOT NULL,       -- Ejemplo: 'temperatura', 'presión', 'vibración'
    unidad VARCHAR(20) NOT NULL,     -- Ejemplo: '°C', 'Bar', 'RPM'
    current_value DECIMAL(12,4),
    min_value DECIMAL(12,4),
    max_value DECIMAL(12,4),
    estado estado_sensor NOT NULL DEFAULT 'normal',
    last_reading_at TIMESTAMP,       -- DATETIME se convierte en TIMESTAMP
    CONSTRAINT fk_sensor_maquina
        FOREIGN KEY (maquina_id) 
        REFERENCES MAQUINA(maquina_id) 
        ON DELETE CASCADE
);


CREATE TABLE DISCIPLINA (
    disciplina_id SERIAL PRIMARY KEY, -- Traducido de AUTO_INCREMENT
    nombre VARCHAR(60) UNIQUE NOT NULL,
    icono VARCHAR(50),
    color VARCHAR(20),
    descripcion VARCHAR(255)
);




CREATE TYPE estado_documento AS ENUM ('active', 'archived', 'obsolete');


CREATE TABLE DOCUMENTO (
    documento_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    disciplina_id INT NOT NULL,         -- Relación con DISCIPLINA
    planta_id INT,                      -- Relación opcional con PLANTA
    maquina_id INT,                     -- Relación opcional con MAQUINA
    usuario_id INT NOT NULL,            -- Quién subió el archivo (USUARIO)
    titulo VARCHAR(200) NOT NULL,
    tipo VARCHAR(40),                   -- 'manual', 'diagrama', 'guía rápida'
    url_archivo VARCHAR(500) NOT NULL,
    tamano_bytes BIGINT,
    mime_type VARCHAR(80),              -- Ejemplo: 'application/pdf'
    version VARCHAR(20),
    fecha_subida TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado estado_documento NOT NULL DEFAULT 'active',
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_doc_disciplina FOREIGN KEY (disciplina_id) REFERENCES DISCIPLINA(disciplina_id),
    CONSTRAINT fk_doc_planta FOREIGN KEY (planta_id) REFERENCES PLANTA(planta_id),
    CONSTRAINT fk_doc_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_doc_usuario FOREIGN KEY (usuario_id) REFERENCES USUARIO(usuario_id)
);


CREATE TYPE prioridad_sesion AS ENUM ('low', 'medium', 'high');
CREATE TYPE estado_sesion AS ENUM ('active', 'completed', 'closed');




CREATE TABLE SESION_DEBUG (
    sesion_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    maquina_id INT NOT NULL,         -- Relación con MAQUINA
    tecnico_id INT NOT NULL,         -- Relación con USUARIO
    issue_description TEXT,
    priority prioridad_sesion NOT NULL, -- Usa el ENUM de prioridad
    start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    duration_minutes INT,
    resolution TEXT,
    summary TEXT,
    estado estado_sesion NOT NULL DEFAULT 'active', -- Usa el ENUM de estado
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_debug_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_debug_tecnico FOREIGN KEY (tecnico_id) REFERENCES USUARIO(usuario_id)
);


CREATE TYPE tipo_conversacion AS ENUM ('document_chat', 'debug_chat');




CREATE TABLE CONVERSACION (
    conversacion_id SERIAL PRIMARY KEY, -- Traducido de BIGINT AUTO_INCREMENT
    usuario_id INT NOT NULL,            -- Quién chatea
    tipo tipo_conversacion NOT NULL,    -- ¿Es sobre un documento o un debug?
    disciplina_id INT,                  -- Opcional: Filtro por área
    planta_id INT,                      -- Opcional: Filtro por planta
    maquina_id INT,                     -- Opcional: Filtro por máquina
    sesion_debug_id INT,                -- Si es debug_chat, se conecta a la sesión anterior
    fecha_inicio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_fin TIMESTAMP,
    estado estado_sesion NOT NULL DEFAULT 'active', -- Reutilizamos el ENUM anterior
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_conv_usuario FOREIGN KEY (usuario_id) REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_conv_disciplina FOREIGN KEY (disciplina_id) REFERENCES DISCIPLINA(disciplina_id),
    CONSTRAINT fk_conv_planta FOREIGN KEY (planta_id) REFERENCES PLANTA(planta_id),
    CONSTRAINT fk_conv_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_conv_debug FOREIGN KEY (sesion_debug_id) REFERENCES SESION_DEBUG(sesion_id)
);



CREATE TYPE emisor_mensaje AS ENUM ('user', 'assistant');


CREATE TABLE MENSAJE (
    mensaje_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    conversacion_id INT NOT NULL,     -- Relación con CONVERSACION
    tipo emisor_mensaje NOT NULL,     -- 'user' o 'assistant'
    contenido TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    suggested_questions JSONB,        -- Preguntas sugeridas por la IA
    sensor_data_snapshot JSONB,       -- Foto de los sensores en ese momento
    
    -- Relación con borrado en cascada (si borras el chat, se borran los mensajes)
    CONSTRAINT fk_mensaje_conv 
        FOREIGN KEY (conversacion_id) 
        REFERENCES CONVERSACION(conversacion_id) 
        ON DELETE CASCADE
);



CREATE TABLE FUENTE_MENSAJE (
    fuente_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    mensaje_id INT NOT NULL,         -- Relación con el mensaje de la IA
    documento_id INT NOT NULL,       -- Relación con el archivo PDF/Manual
    page_number INT,                 -- Página exacta del manual
    section VARCHAR(120),            -- Sección (ej. "Mantenimiento Preventivo")
    excerpt TEXT,                    -- El fragmento de texto citado
    relevance_score DECIMAL(5,4),    -- Puntaje de qué tan útil fue esta fuente (0.0 a 1.0)
    
    -- Relaciones
    CONSTRAINT fk_fuente_mensaje 
        FOREIGN KEY (mensaje_id) 
        REFERENCES MENSAJE(mensaje_id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_fuente_documento 
        FOREIGN KEY (documento_id) 
        REFERENCES DOCUMENTO(documento_id)
);


CREATE TYPE tipo_adjunto AS ENUM ('image', 'video', 'audio', 'document');


CREATE TABLE ADJUNTO (
    adjunto_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    mensaje_id INT,                  -- Opcional: si se envió en un chat
    sesion_id INT,                   -- Opcional: si pertenece a un ticket de reparación
    usuario_id INT NOT NULL,         -- Quién lo subió
    tipo tipo_adjunto NOT NULL,      -- El ENUM que acabamos de crear
    url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    filename VARCHAR(200),
    size_bytes BIGINT,
    mime_type VARCHAR(80),
    descripcion VARCHAR(255),
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_adjunto_mensaje FOREIGN KEY (mensaje_id) REFERENCES MENSAJE(mensaje_id),
    CONSTRAINT fk_adjunto_sesion FOREIGN KEY (sesion_id) REFERENCES SESION_DEBUG(sesion_id),
    CONSTRAINT fk_adjunto_usuario FOREIGN KEY (usuario_id) REFERENCES USUARIO(usuario_id)
);



CREATE TYPE nivel_severidad AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE nivel_urgencia AS ENUM ('low', 'medium', 'high');



CREATE TABLE DIAGNOSTICO (
    diagnostico_id SERIAL PRIMARY KEY, -- Traducido de BIGINT AUTO_INCREMENT
    sesion_id INT NOT NULL,            -- Relación con la sesión de debug
    maquina_id INT NOT NULL,           -- Relación con la máquina afectada
    mensaje_id INT,                    -- El mensaje específico de la IA que generó esto
    descripcion_problema TEXT NOT NULL,
    severity nivel_severidad NOT NULL, -- Usa el ENUM de severidad
    urgency nivel_urgencia NOT NULL,   -- Usa el ENUM de urgencia
    fecha_generacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_diag_sesion FOREIGN KEY (sesion_id) REFERENCES SESION_DEBUG(sesion_id),
    CONSTRAINT fk_diag_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_diag_mensaje FOREIGN KEY (mensaje_id) REFERENCES MENSAJE(mensaje_id)
);




CREATE TABLE DIAGNOSTICO_CAUSA (
    causa_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    diagnostico_id INT NOT NULL,     -- Relación con el diagnóstico principal
    descripcion VARCHAR(255) NOT NULL,
    orden INT NOT NULL,              -- Para mostrar las causas en un orden lógico
    
    -- Relación con borrado en cascada
    CONSTRAINT fk_causa_diagnostico 
        FOREIGN KEY (diagnostico_id) 
        REFERENCES DIAGNOSTICO(diagnostico_id) 
        ON DELETE CASCADE
);





CREATE TABLE DIAGNOSTICO_ACCION (
    accion_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    diagnostico_id INT NOT NULL,     -- Relación con el diagnóstico
    accion VARCHAR(255) NOT NULL,    -- La instrucción (ej. "Reemplazar rodamiento")
    priority INT NOT NULL,           -- Orden de importancia
    estimated_time VARCHAR(40),      -- Ej: "30-45 mins"
    required_parts JSONB,            -- Listado de repuestos en formato JSON
    
    -- Relación con borrado en cascada
    CONSTRAINT fk_accion_diagnostico 
        FOREIGN KEY (diagnostico_id) 
        REFERENCES DIAGNOSTICO(diagnostico_id) 
        ON DELETE CASCADE
);




CREATE TYPE estado_reporte AS ENUM ('draft', 'generated', 'uploaded', 'approved', 'archived');


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
    actions_taken JSONB, -- Usamos JSONB para mayor flexibilidad
    additional_notes TEXT,
    severity nivel_severidad NOT NULL, -- Reutilizamos el ENUM creado anteriormente
    downtime_minutes INT,
    pdf_url VARCHAR(500),
    repository_url VARCHAR(500),
    estado estado_reporte NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_at TIMESTAMP,
    approved_by INT,
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_reporte_sesion FOREIGN KEY (sesion_id) REFERENCES SESION_DEBUG(sesion_id),
    CONSTRAINT fk_reporte_diag FOREIGN KEY (diagnostico_id) REFERENCES DIAGNOSTICO(diagnostico_id),
    CONSTRAINT fk_reporte_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_reporte_tecnico FOREIGN KEY (tecnico_id) REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_reporte_aprobador FOREIGN KEY (approved_by) REFERENCES USUARIO(usuario_id)
);


CREATE TYPE tipo_mantenimiento AS ENUM ('corrective', 'preventive', 'predictive', 'inspection');
CREATE TYPE prioridad_ot AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE estado_ot AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue');





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
    severity nivel_severidad, -- Reutilizamos el tipo creado en DIAGNOSTICO
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_inicio TIMESTAMP,
    fecha_cierre TIMESTAMP,
    fecha_vencimiento TIMESTAMP,
    tiempo_reparacion_min INT,
    downtime_minutes INT,
    costo_estimado DECIMAL(12,2),
    costo_real DECIMAL(12,2),
    estado estado_ot NOT NULL DEFAULT 'pending',
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_ot_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_ot_tecnico FOREIGN KEY (tecnico_id) REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_ot_creador FOREIGN KEY (creado_por) REFERENCES USUARIO(usuario_id),
    CONSTRAINT fk_ot_diagnostico FOREIGN KEY (diagnostico_id) REFERENCES DIAGNOSTICO(diagnostico_id),
    CONSTRAINT fk_ot_reporte FOREIGN KEY (reporte_id) REFERENCES REPORTE(reporte_id)
);



CREATE TABLE OT_REPUESTO (
    ot_repuesto_id SERIAL PRIMARY KEY, -- Traducido de BIGINT AUTO_INCREMENT
    ot_id INT NOT NULL,                -- Relación con ORDEN_TRABAJO
    repuesto_id INT NOT NULL,          -- Relación con REPUESTO
    cantidad DECIMAL(10,2) NOT NULL,
    costo_unitario DECIMAL(12,2),
    notas VARCHAR(255),
    fecha_uso TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Relaciones
    CONSTRAINT fk_ot_repuesto_ot 
        FOREIGN KEY (ot_id) 
        REFERENCES ORDEN_TRABAJO(ot_id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_ot_repuesto_item 
        FOREIGN KEY (repuesto_id) 
        REFERENCES REPUESTO(repuesto_id)
);



CREATE TYPE estado_repuesto AS ENUM ('active', 'discontinued', 'out_of_stock');





CREATE TABLE REPUESTO (
    repuesto_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    codigo VARCHAR(50) UNIQUE NOT NULL,
    part_number VARCHAR(80),
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    tipo VARCHAR(60),
    categoria VARCHAR(60),
    unidad VARCHAR(20) NOT NULL,       -- Ej: 'Unidades', 'Litros', 'Metros'
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





CREATE TABLE OT_REPUESTO (
    ot_repuesto_id SERIAL PRIMARY KEY, -- Traducido de BIGINT AUTO_INCREMENT
    ot_id INT NOT NULL,                -- Relación con ORDEN_TRABAJO
    repuesto_id INT NOT NULL,          -- Relación con REPUESTO
    cantidad DECIMAL(10,2) NOT NULL,
    costo_unitario DECIMAL(12,2),
    notas VARCHAR(255),
    fecha_uso TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_ot_repuesto_ot 
        FOREIGN KEY (ot_id) 
        REFERENCES ORDEN_TRABAJO(ot_id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_ot_repuesto_item 
        FOREIGN KEY (repuesto_id) 
        REFERENCES REPUESTO(repuesto_id)
);




CREATE TABLE OT_AUDIT_LOG (
    audit_id SERIAL PRIMARY KEY,      -- Traducido de BIGINT AUTO_INCREMENT
    ot_id INT NOT NULL,               -- Relación con la Orden de Trabajo
    usuario_id INT NOT NULL,          -- Quién realizó el cambio
    estado_anterior VARCHAR(40),      -- El estado antes del cambio
    estado_nuevo VARCHAR(40) NOT NULL, -- El estado después del cambio
    comentario VARCHAR(500),          -- Justificación del cambio
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Relaciones
    CONSTRAINT fk_audit_ot 
        FOREIGN KEY (ot_id) 
        REFERENCES ORDEN_TRABAJO(ot_id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_audit_usuario 
        FOREIGN KEY (usuario_id) 
        REFERENCES USUARIO(usuario_id)
);


CREATE TYPE tipo_nodo AS ENUM ('machine', 'controller', 'sensor', 'hub');
CREATE TYPE estado_nodo AS ENUM ('operational', 'warning', 'error', 'offline');



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
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_nodo_planta FOREIGN KEY (planta_id) REFERENCES PLANTA(planta_id),
    CONSTRAINT fk_nodo_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_nodo_sensor FOREIGN KEY (sensor_id) REFERENCES SENSOR(sensor_id)
);



CREATE TYPE tipo_conexion AS ENUM ('electrical', 'mechanical', 'data', 'hydraulic', 'pneumatic');
CREATE TYPE estado_conexion AS ENUM ('active', 'inactive');




CREATE TABLE TOPOLOGIA_CONEXION (
    conexion_id SERIAL PRIMARY KEY,
    nodo_origen_id INT NOT NULL,
    nodo_destino_id INT NOT NULL,
    tipo tipo_conexion NOT NULL,
    label VARCHAR(120),
    bidirectional BOOLEAN NOT NULL DEFAULT FALSE,
    bandwidth VARCHAR(40), -- Útil para conexiones de tipo 'data'
    strength INT,           -- Puede representar voltaje, presión o prioridad
    estado estado_conexion NOT NULL DEFAULT 'active',
    
    -- Relaciones con borrado en cascada (si borras un nodo, se borra su conexión)
    CONSTRAINT fk_conexion_origen 
        FOREIGN KEY (nodo_origen_id) 
        REFERENCES TOPOLOGIA_NODO(nodo_id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_conexion_destino 
        FOREIGN KEY (nodo_destino_id) 
        REFERENCES TOPOLOGIA_NODO(nodo_id) 
        ON DELETE CASCADE
);



CREATE TABLE TOPOLOGIA_ZONA (
    zona_id SERIAL PRIMARY KEY,      -- Traducido de BIGINT AUTO_INCREMENT
    planta_id INT NOT NULL,          -- Relación con la planta física
    nombre VARCHAR(120) NOT NULL,
    color VARCHAR(20),               -- Código hexadecimal o nombre del color para el mapa
    descripcion VARCHAR(255),
    
    -- Relación (Foreign Key)
    CONSTRAINT fk_zona_planta 
        FOREIGN KEY (planta_id) 
        REFERENCES PLANTA(planta_id)
);




CREATE TABLE ZONA_NODO (
    zona_id INT NOT NULL,
    nodo_id INT NOT NULL,
    
    -- Definimos la llave primaria compuesta
    PRIMARY KEY (zona_id, nodo_id),
    
    -- Relaciones con borrado en cascada
    CONSTRAINT fk_zn_zona 
        FOREIGN KEY (zona_id) 
        REFERENCES TOPOLOGIA_ZONA(zona_id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_zn_nodo 
        FOREIGN KEY (nodo_id) 
        REFERENCES TOPOLOGIA_NODO(nodo_id) 
        ON DELETE CASCADE
);



CREATE TYPE frecuencia_mant AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom');
CREATE TYPE prioridad_mant AS ENUM ('low', 'medium', 'high');
CREATE TYPE estado_programa AS ENUM ('active', 'paused', 'inactive');




CREATE TABLE PROGRAMA_MANTENIMIENTO (
    programa_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    maquina_id INT NOT NULL,           -- Máquina a la que se le aplica
    creado_por INT NOT NULL,           -- El ingeniero que diseñó el plan
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    instrucciones TEXT,                -- El "paso a paso" para el técnico
    frecuencia frecuencia_mant NOT NULL,
    intervalo_dias INT,                -- Se usa si la frecuencia es 'custom'
    priority prioridad_mant NOT NULL,
    duracion_estimada_min INT,
    costo_estimado DECIMAL(12,2),
    fecha_inicio DATE NOT NULL,
    proxima_ejecucion TIMESTAMP,
    ultima_ejecucion TIMESTAMP,
    estado estado_programa NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_prog_maquina FOREIGN KEY (maquina_id) REFERENCES MAQUINA(maquina_id),
    CONSTRAINT fk_prog_usuario FOREIGN KEY (creado_por) REFERENCES USUARIO(usuario_id)
);



CREATE TYPE estado_ejecucion AS ENUM ('scheduled', 'completed', 'skipped', 'overdue');



CREATE TABLE EJECUCION_PROGRAMA (
    ejecucion_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    programa_id INT NOT NULL,           -- El plan al que pertenece
    ot_id INT,                          -- La Orden de Trabajo que se generó
    tecnico_id INT,                     -- El técnico que realizó la tarea
    fecha_programada TIMESTAMP NOT NULL,
    fecha_ejecutada TIMESTAMP,
    estado estado_ejecucion NOT NULL DEFAULT 'scheduled',
    notas TEXT,
    
    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_ejec_programa 
        FOREIGN KEY (programa_id) 
        REFERENCES PROGRAMA_MANTENIMIENTO(programa_id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_ejec_ot 
        FOREIGN KEY (ot_id) 
        REFERENCES ORDEN_TRABAJO(ot_id),
    CONSTRAINT fk_ejec_tecnico 
        FOREIGN KEY (tecnico_id) 
        REFERENCES USUARIO(usuario_id)
);



CREATE TYPE estado_lectura AS ENUM ('normal', 'warning', 'critical');


CREATE TABLE LECTURA_SENSOR (
    lectura_id SERIAL PRIMARY KEY,    -- Traducido de BIGINT AUTO_INCREMENT
    sensor_id INT NOT NULL,           -- Relación con el sensor físico
    valor DECIMAL(14,4) NOT NULL,     -- Alta precisión para datos técnicos
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado estado_lectura NOT NULL DEFAULT 'normal',
    
    -- Relación con borrado en cascada
    CONSTRAINT fk_lectura_sensor 
        FOREIGN KEY (sensor_id) 
        REFERENCES SENSOR(sensor_id) 
        ON DELETE CASCADE
);










