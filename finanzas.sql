-- Finanzas: estructura base para PostgreSQL (schema public)
-- Ejecuta en la base Cojines (p. ej. \c Cojines) antes de correr este script.

-- Cuentas donde se mueve el dinero
CREATE TABLE IF NOT EXISTS public.fin_cuentas (
  id_cuenta SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  tipo VARCHAR(50) CHECK (tipo IN ('caja','banco','billetera','otro')),
  moneda VARCHAR(10) DEFAULT 'MXN',
  saldo_inicial NUMERIC(14,2) DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Catálogo de categorías de ingresos/egresos
CREATE TABLE IF NOT EXISTS public.fin_categorias (
  id_categoria SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  tipo VARCHAR(20) CHECK (tipo IN ('ingreso','egreso')),
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Impuestos configurables (IVA, retenciones, etc.)
CREATE TABLE IF NOT EXISTS public.fin_impuestos (
  id_impuesto SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  tasa NUMERIC(6,4) NOT NULL, -- ej. 0.1600 para 16%
  aplica_a VARCHAR(20) CHECK (aplica_a IN ('ingreso','egreso','ambos')) DEFAULT 'ambos',
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ingresos (ventas/servicios)
CREATE TABLE IF NOT EXISTS public.fin_ingresos (
  id_ingreso SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  cliente VARCHAR(200),
  tipo_ingreso VARCHAR(50) DEFAULT 'venta',
  factura VARCHAR(120),
  subtotal NUMERIC(14,2) NOT NULL,
  impuestos NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) GENERATED ALWAYS AS (subtotal + impuestos) STORED,
  estado VARCHAR(20) CHECK (estado IN ('pendiente','pagado','anulado')) DEFAULT 'pendiente',
  metodo_pago VARCHAR(50),
  id_cuenta INT REFERENCES public.fin_cuentas(id_cuenta),
  id_categoria INT REFERENCES public.fin_categorias(id_categoria),
  cotizacion_id VARCHAR(64),
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Egresos (compras/gastos)
CREATE TABLE IF NOT EXISTS public.fin_egresos (
  id_egreso SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  proveedor VARCHAR(200),
  tipo_egreso VARCHAR(50) DEFAULT 'gasto',
  factura VARCHAR(120),
  subtotal NUMERIC(14,2) NOT NULL,
  impuestos NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) GENERATED ALWAYS AS (subtotal + impuestos) STORED,
  metodo_pago VARCHAR(50),
  id_cuenta INT REFERENCES public.fin_cuentas(id_cuenta),
  id_categoria INT REFERENCES public.fin_categorias(id_categoria),
  afecta_inventario BOOLEAN DEFAULT FALSE,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Detalle de impuestos aplicados (opcional)
CREATE TABLE IF NOT EXISTS public.fin_mov_impuestos (
  id_mov_impuesto SERIAL PRIMARY KEY,
  tipo_mov VARCHAR(10) CHECK (tipo_mov IN ('ingreso','egreso')) NOT NULL,
  id_mov INT NOT NULL,
  id_impuesto INT REFERENCES public.fin_impuestos(id_impuesto),
  base NUMERIC(14,2) NOT NULL,
  importe NUMERIC(14,2) NOT NULL,
  CONSTRAINT fk_ingreso_fin FOREIGN KEY (id_mov) REFERENCES public.fin_ingresos(id_ingreso) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_egreso_fin FOREIGN KEY (id_mov) REFERENCES public.fin_egresos(id_egreso) DEFERRABLE INITIALLY DEFERRED
);

-- Reglas de automatización (metadata)
CREATE TABLE IF NOT EXISTS public.fin_reglas (
  id_regla SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  origen VARCHAR(50) CHECK (origen IN ('cotizacion_facturada','compra_material','otro')),
  accion VARCHAR(50) CHECK (accion IN ('crear_ingreso','crear_egreso','actualizar_inventario')),
  activo BOOLEAN DEFAULT TRUE,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Vista de resumen mensual ingresos vs egresos
CREATE OR REPLACE VIEW public.fin_resumen_mensual AS
SELECT
  date_trunc('month', fecha) AS mes,
  SUM(CASE WHEN estado <> 'anulado' THEN total ELSE 0 END) AS ingresos_total,
  0::NUMERIC AS egresos_total
FROM public.fin_ingresos
GROUP BY 1
UNION ALL
SELECT
  date_trunc('month', fecha) AS mes,
  0::NUMERIC,
  SUM(total) AS egresos_total
FROM public.fin_egresos
GROUP BY 1;

-- Vista de flujo de caja por cuenta
CREATE OR REPLACE VIEW public.fin_flujo_caja AS
SELECT
  c.id_cuenta,
  c.nombre,
  c.moneda,
  c.saldo_inicial
    + COALESCE((SELECT SUM(total) FROM public.fin_ingresos i WHERE i.id_cuenta = c.id_cuenta AND i.estado = 'pagado'), 0)
    - COALESCE((SELECT SUM(total) FROM public.fin_egresos e WHERE e.id_cuenta = c.id_cuenta), 0) AS saldo_actual
FROM public.fin_cuentas c;
