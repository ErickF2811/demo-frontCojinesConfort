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
