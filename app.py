import os
from decimal import Decimal
from typing import Any, Dict, List

from flask import Flask, jsonify, render_template, request
import psycopg2
from psycopg2.extras import RealDictCursor


def get_database_url() -> str:
    """Return the database connection string from the environment."""
    database_url = "postgresql://admin:admin123@172.21.0.8:5432/cojines"
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. Please provide a valid "
            "PostgreSQL connection string, for example: "
            "postgresql://user:password@hostname:port/database"
        )
    return database_url


def get_connection() -> psycopg2.extensions.connection:
    """Create a new database connection using a dict-like cursor."""
    return psycopg2.connect(get_database_url(), cursor_factory=RealDictCursor)


def fetch_material_filters() -> Dict[str, List[str]]:
    """Fetch distinct filter values from the materials table."""
    query = """
        SELECT
            COALESCE(NULLIF(TRIM(material_name), ''), 'Sin nombre') AS material_name,
            COALESCE(NULLIF(TRIM(color), ''), 'Sin color') AS color,
            COALESCE(NULLIF(TRIM(tipo), ''), 'Sin tipo') AS tipo,
            COALESCE(NULLIF(TRIM(categoria), ''), 'Sin categoría') AS categoria,
            COALESCE(p.nombre_empresa, 'Sin proveedor') AS provider_name
        FROM tbl_materiales m
        LEFT JOIN tbl_proveedores p ON m.proveedor = p.id_proveedor
    """

    filters: Dict[str, set[str]] = {
        "material_name": set(),
        "color": set(),
        "tipo": set(),
        "categoria": set(),
        "provider_name": set(),
    }

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query)
        for row in cur.fetchall():
            filters["material_name"].add(row["material_name"])
            filters["color"].add(row["color"])
            filters["tipo"].add(row["tipo"])
            filters["categoria"].add(row["categoria"])
            filters["provider_name"].add(row["provider_name"])
    return {key: sorted(value) for key, value in filters.items()}


def fetch_stock_summary(filters: Dict[str, str]) -> List[Dict[str, Any]]:
    """Fetch the stock summary grouped by material and movement type."""
    where_clauses = []
    params: List[Any] = []

    mapping = {
        "material_name": ("COALESCE(NULLIF(TRIM(m.material_name), ''), 'Sin nombre')", "ILIKE"),
        "color": ("COALESCE(NULLIF(TRIM(m.color), ''), 'Sin color')", "ILIKE"),
        "tipo": ("COALESCE(NULLIF(TRIM(m.tipo), ''), 'Sin tipo')", "ILIKE"),
        "categoria": ("COALESCE(NULLIF(TRIM(m.categoria), ''), 'Sin categoría')", "ILIKE"),
        "provider_name": ("COALESCE(p.nombre_empresa, 'Sin proveedor')", "ILIKE"),
    }

    for key, value in filters.items():
        if value and key in mapping:
            expression, operator = mapping[key]
            where_clauses.append(f"{expression} {operator} %s")
            params.append(f"%{value}%")

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    query = f"""
        WITH movement_totals AS (
            SELECT
                id_material,
                SUM(CASE WHEN LOWER(tipo_movimiento) = 'entrada' THEN cantidad ELSE 0 END) AS total_entradas,
                SUM(CASE WHEN LOWER(tipo_movimiento) = 'salida' THEN cantidad ELSE 0 END) AS total_salidas
            FROM vista_movimientos_materiales
            GROUP BY id_material
        ),
        movement_history AS (
            SELECT
                id_material,
                tipo_movimiento,
                SUM(cantidad) AS total_por_tipo
            FROM vista_movimientos_materiales
            GROUP BY id_material, tipo_movimiento
        )
        SELECT
            m.id_material,
            COALESCE(NULLIF(TRIM(m.material_name), ''), 'Sin nombre') AS material_name,
            COALESCE(NULLIF(TRIM(m.color), ''), 'Sin color') AS color,
            COALESCE(NULLIF(TRIM(m.tipo), ''), 'Sin tipo') AS tipo,
            COALESCE(NULLIF(TRIM(m.categoria), ''), 'Sin categoría') AS categoria,
            COALESCE(p.nombre_empresa, 'Sin proveedor') AS provider_name,
            COALESCE(mt.total_entradas, 0) AS total_entradas,
            COALESCE(mt.total_salidas, 0) AS total_salidas,
            COALESCE(mt.total_entradas, 0) - COALESCE(mt.total_salidas, 0) AS stock_actual,
            COALESCE(json_agg(
                json_build_object(
                    'tipo_movimiento', mh.tipo_movimiento,
                    'total_por_tipo', mh.total_por_tipo
                )
                ORDER BY mh.tipo_movimiento
            ) FILTER (WHERE mh.id_material IS NOT NULL), '[]') AS movimientos_por_tipo
        FROM tbl_materiales m
        LEFT JOIN tbl_proveedores p ON m.proveedor = p.id_proveedor
        LEFT JOIN movement_totals mt ON m.id_material = mt.id_material
        LEFT JOIN movement_history mh ON m.id_material = mh.id_material
        {where_sql}
        GROUP BY
            m.id_material,
            m.material_name,
            m.color,
            m.tipo,
            m.categoria,
            p.nombre_empresa,
            mt.total_entradas,
            mt.total_salidas
        ORDER BY material_name
    """

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        raw_results = cur.fetchall()

    def normalize_value(value: Any) -> Any:
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, list):
            return [normalize_value(item) for item in value]
        if isinstance(value, dict):
            return {key: normalize_value(item) for key, item in value.items()}
        return value

    return [
        {key: normalize_value(value) for key, value in row.items()}
        for row in raw_results
    ]


def fetch_material_list(filters: Dict[str, str]) -> List[Dict[str, Any]]:
    """Fetch materials from the database view with provider and image URL."""
    where_clauses = []
    params: List[Any] = []

    mapping = {
        "material_name": ("COALESCE(NULLIF(TRIM(material_name), ''), 'Sin nombre')", "ILIKE"),
        "color": ("COALESCE(NULLIF(TRIM(color), ''), 'Sin color')", "ILIKE"),
        "tipo": ("COALESCE(NULLIF(TRIM(tipo), ''), 'Sin tipo')", "ILIKE"),
        "categoria": ("COALESCE(NULLIF(TRIM(categoria), ''), 'Sin categoría')", "ILIKE"),
        "provider_name": ("COALESCE(NULLIF(TRIM(proveedor), ''), 'Sin proveedor')", "ILIKE"),
    }

    for key, value in filters.items():
        if value and key in mapping:
            expression, operator = mapping[key]
            where_clauses.append(f"{expression} {operator} %s")
            params.append(f"%{value}%")

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    query = f"""
        SELECT
            id_material,
            COALESCE(NULLIF(TRIM(material_name), ''), 'Sin nombre') AS material_name,
            COALESCE(NULLIF(TRIM(color), ''), 'Sin color') AS color,
            COALESCE(NULLIF(TRIM(tipo), ''), 'Sin tipo') AS tipo,
            COALESCE(NULLIF(TRIM(categoria), ''), 'Sin categoría') AS categoria,
            COALESCE(NULLIF(TRIM(proveedor), ''), 'Sin proveedor') AS provider_name,
            COALESCE(NULLIF(TRIM(unidad), ''), '') AS unidad,
            costo_unitario,
            COALESCE(NULLIF(TRIM(imagen_name), ''), '') AS imagen_name,
            COALESCE(NULLIF(TRIM(storage_account), ''), '') AS storage_account,
            COALESCE(stock_actual, 0) AS stock_actual
        FROM vista_materiales_proveedores
        {where_sql}
        ORDER BY material_name
    """

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        rows = list(cur.fetchall())

    def normalize_value(value: Any) -> Any:
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, list):
            return [normalize_value(item) for item in value]
        if isinstance(value, dict):
            return {key: normalize_value(item) for key, item in value.items()}
        return value

    return [
        {key: normalize_value(value) for key, value in row.items()}
        for row in rows
    ]


app = Flask(__name__)


@app.route("/")
def index() -> str:
    """Render the main dashboard."""
    return render_template("index.html")


@app.route("/api/filters")
def api_filters():
    """Provide filter options for the frontend."""
    try:
        return jsonify(fetch_material_filters())
    except Exception as exc:  # pragma: no cover - used for runtime error reporting
        return jsonify({"error": str(exc)}), 500


@app.route("/api/stock")
def api_stock():
    """Return the stock summary with optional filters."""
    filters = {
        "material_name": request.args.get("material_name", type=str, default=""),
        "color": request.args.get("color", type=str, default=""),
        "tipo": request.args.get("tipo", type=str, default=""),
        "categoria": request.args.get("categoria", type=str, default=""),
        "provider_name": request.args.get("provider_name", type=str, default=""),
    }

    try:
        data = fetch_stock_summary(filters)
        return jsonify(data)
    except Exception as exc:  # pragma: no cover - used for runtime error reporting
        return jsonify({"error": str(exc)}), 500


@app.route("/materiales")
def materiales_page() -> str:
    """Render the materials-only page."""
    return render_template("materiales.html")


@app.route("/api/materiales")
def api_materiales():
    """Return the materials list coming from the DB view."""
    filters = {
        "material_name": request.args.get("material_name", type=str, default=""),
        "color": request.args.get("color", type=str, default=""),
        "tipo": request.args.get("tipo", type=str, default=""),
        "categoria": request.args.get("categoria", type=str, default=""),
        "provider_name": request.args.get("provider_name", type=str, default=""),
    }

    try:
        data = fetch_material_list(filters)
        return jsonify(data)
    except Exception as exc:  # pragma: no cover - used for runtime error reporting
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
