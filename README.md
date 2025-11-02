# Dashboard de stock para Cojines Confort

Aplicación web sencilla construida con Flask para consultar el inventario de materiales
en una base de datos PostgreSQL. El backend expone endpoints que unifican la información
de materiales con proveedores y calculan el stock agrupado por tipo de movimiento.

## Requisitos

- Python 3.11+
- PostgreSQL accesible y credenciales válidas
- Variables de entorno configuradas con la URL de conexión

Instala las dependencias:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Define la variable `DATABASE_URL` con tu cadena de conexión, por ejemplo:

```bash
export DATABASE_URL="postgresql://admin:admin@172.21.0.8:5432/cojines"
```

## Ejecutar el servidor

```bash
flask --app app run --debug
```

La aplicación quedará disponible en [http://localhost:5000](http://localhost:5000).

## Ejecutar con Docker

Construye la imagen:

```bash
docker build -t cojines-materiales:latest .
```

Ejecuta el contenedor indicando tu conexión a PostgreSQL mediante `DATABASE_URL` y exponiendo el puerto:

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://usuario:clave@host:5432/cojines" \
  -e PORT=5000 \
  -p 5000:5000 \
  cojines-materiales:latest
```

- La app quedará disponible en `http://localhost:5000`.
- Puedes cambiar el puerto externo (`-p 8080:5000`) o el interno con `-e PORT`.
- La imagen usa Gunicorn si está disponible; en caso contrario usa el server de Flask.

## Ejecutar con Docker Compose

Incluí `docker-compose.yml` para levantar la app junto a una base de datos Postgres local.

1) Levantar los servicios (app + db):

```bash
docker compose up --build
```

2) Variables que puedes ajustar (opcional, vía `.env` o al ejecutar):

- `HOST_PORT` (por defecto 5000): puerto en tu host.
- `PORT` (por defecto 5000): puerto interno del contenedor web.
- `POSTGRES_DB` (por defecto cojines)
- `POSTGRES_USER` (por defecto admin)
- `POSTGRES_PASSWORD` (por defecto admin123)
- `DB_PORT` (por defecto 5432)
- `DATABASE_URL` (por defecto `postgresql://admin:admin123@db:5432/cojines` apuntando al servicio `db`).

3) Acceso

- App: http://localhost:5000
- Postgres: localhost:5432 (usuario/clave definidos arriba)

4) Datos persistentes

- El volumen `pgdata` persiste los datos de Postgres entre reinicios.

## Endpoints disponibles

- `GET /api/filters`: devuelve listas de valores para poblar los filtros del dashboard.
- `GET /api/stock`: responde con el stock agrupado por material y tipo de movimiento.
  Acepta filtros opcionales mediante parámetros de consulta (`material_name`, `color`,
  `tipo`, `categoria`, `provider_name`).

## Estructura del proyecto

```
app.py               # Aplicación Flask y consultas a PostgreSQL
requirements.txt     # Dependencias del proyecto
static/              # Recursos estáticos (JS y CSS)
templates/           # Plantillas HTML
```

## Notas

- El cálculo del stock utiliza la diferencia entre las cantidades de entradas y salidas.
- Los nombres de proveedores se obtienen directamente desde la tabla `tbl_proveedores`.
- Los filtros buscan coincidencias parciales (uso de `ILIKE`) para facilitar la búsqueda.
- Los filtros del listado aceptan múltiples valores por clave (p. ej., `?tipo=Tela&tipo=relleno`).

## Tablas y vistas usadas (PostgreSQL)

La aplicación consulta los siguientes objetos de base de datos. Entre paréntesis se indica el campo esperado por la app cuando es relevante.

- Tablas base
  - `public.tbl_materiales`
    - Campos usados: `id_material`, `material_name`, `color`, `tipo`, `unidad`, `costo_unitario`, `categoria`, `proveedor`, `imagen_name`, `storage_account`, (opcional) `observaciones`.
  - `public.tbl_proveedores`
    - Campos usados: `id_proveedor`, `nombre_empresa`.
  - `public.tbl_movimientos`
    - Campos usados por la vista de movimientos: `id_movimiento`, `fecha`, `tipo`, `id_material`, `cantidad`, `unidad`, `motivo`, `observaciones`.

- Vistas requeridas
  - `public.vista_materiales_proveedores`
    - Une materiales con proveedor y resume el stock actual.
    - Campos esperados por la app: `id_material`, `material_name`, `color`, `tipo`, `unidad`, `costo_unitario`, `proveedor` (o `provider_name`), `categoria`, `imagen_name`, `storage_account`, `stock_actual`.
    - La app construye `image_url` a partir de `storage_account` y `imagen_name` cuando `storage_account` no es una URL completa.
  - `public.vista_movimientos`
    - Vista de conveniencia para los últimos movimientos por material. Definición sugerida:
      ```sql
      CREATE VIEW public.vista_movimientos AS
      SELECT 
          id_movimiento,
          fecha,
          tipo,
          id_material,
          cantidad,
          unidad,
          motivo,
          observaciones
      FROM public.tbl_movimientos
      ORDER BY fecha DESC;
      ```
    - La app consume `GET /api/materiales/{id}/movimientos?limit=5` sobre esta vista.
  - `public.vista_movimientos_materiales` (opcional para el tablero de stock)
    - Si utilizas la página de “Resumen de stock”, esta vista debe exponer al menos: `id_material`, `tipo` (entrada/salida), `cantidad`. La app agrega por `id_material` y `tipo`.

Notas de compatibilidad
- Los nombres y tipos deben coincidir; si tus vistas devuelven alias diferentes (p. ej., `provider_name` en vez de `proveedor`), mantén ambos o ajusta el SELECT en `app.py`.
- `tipo` en movimientos debe contener valores comparables en minúsculas (`entrada`/`salida`) o se normaliza con `LOWER(tipo)`.
