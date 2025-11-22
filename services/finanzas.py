from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from db import get_connection


def _build_date_filter(field: str, date_from: Optional[str], date_to: Optional[str]) -> Tuple[List[str], List[Any]]:
    clauses: List[str] = []
    params: List[Any] = []
    if date_from:
        clauses.append(f"{field} >= %s")
        params.append(date_from)
    if date_to:
        clauses.append(f"{field} <= %s")
        params.append(date_to)
    return clauses, params


def fetch_resumen(date_from: Optional[str], date_to: Optional[str], tipo: Optional[str]) -> Dict[str, Any]:
    """Aggregates ingresos/egresos and monthly series."""
    tipo = (tipo or "").strip().lower()

    # ingresos
    clauses_ing, params_ing = _build_date_filter("fecha", date_from, date_to)
    if tipo and tipo in {"ventas", "servicios", "otro"}:
        clauses_ing.append("LOWER(tipo_ingreso) = %s")
        params_ing.append(tipo)
    where_ing = f"WHERE {' AND '.join(clauses_ing)}" if clauses_ing else ""

    # egresos
    clauses_egr, params_egr = _build_date_filter("fecha", date_from, date_to)
    if tipo and tipo in {"compras", "gastos", "impuestos", "otro"}:
        clauses_egr.append("LOWER(tipo_egreso) = %s")
        params_egr.append(tipo)
    where_egr = f"WHERE {' AND '.join(clauses_egr)}" if clauses_egr else ""

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS count FROM fin_ingresos {where_ing}",
            params_ing,
        )
        ing_row = cur.fetchone() or {"total": 0, "count": 0}

        cur.execute(
            f"SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS count FROM fin_egresos {where_egr}",
            params_egr,
        )
        egr_row = cur.fetchone() or {"total": 0, "count": 0}

        # Monthly series from view fin_resumen_mensual
        clauses_series: List[str] = []
        params_series: List[Any] = []
        if date_from:
            clauses_series.append("mes >= date_trunc('month', %s::date)")
            params_series.append(date_from)
        if date_to:
            clauses_series.append("mes <= date_trunc('month', %s::date)")
            params_series.append(date_to)
        where_series = f"WHERE {' AND '.join(clauses_series)}" if clauses_series else ""

        cur.execute(
            f"""
            SELECT mes, SUM(ingresos_total) AS ingresos, SUM(egresos_total) AS egresos
            FROM fin_resumen_mensual
            {where_series}
            GROUP BY mes
            ORDER BY mes
            """,
            params_series,
        )
        serie = [
            {
                "mes": row["mes"].strftime("%Y-%m"),
                "ingresos": float(row["ingresos"] or 0),
                "egresos": float(row["egresos"] or 0),
            }
            for row in cur.fetchall()
        ]

        # Caja desde vista fin_flujo_caja
        cur.execute("SELECT COALESCE(SUM(saldo_actual),0) AS saldo FROM fin_flujo_caja")
        caja_row = cur.fetchone() or {"saldo": 0}

    ingresos_total = float(ing_row.get("total") or 0)
    egresos_total = float(egr_row.get("total") or 0)
    utilidad = ingresos_total - egresos_total

    return {
        "ingresos_total": ingresos_total,
        "ingresos_count": int(ing_row.get("count") or 0),
        "egresos_total": egresos_total,
        "egresos_count": int(egr_row.get("count") or 0),
        "utilidad": utilidad,
        "caja": float(caja_row.get("saldo") or 0),
        "serie": serie,
    }


def fetch_ingresos(date_from: Optional[str], date_to: Optional[str], tipo: Optional[str]) -> List[Dict[str, Any]]:
    clauses, params = _build_date_filter("fecha", date_from, date_to)
    if tipo and tipo.strip():
        clauses.append("LOWER(tipo_ingreso) = %s")
        params.append(tipo.strip().lower())
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"""
        SELECT id_ingreso, fecha, cliente, tipo_ingreso, factura, subtotal, impuestos, total, estado, metodo_pago
        FROM fin_ingresos
        {where}
        ORDER BY fecha DESC, id_ingreso DESC
        LIMIT 200
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
    return [dict(row) for row in rows]


def fetch_egresos(date_from: Optional[str], date_to: Optional[str], tipo: Optional[str]) -> List[Dict[str, Any]]:
    clauses, params = _build_date_filter("fecha", date_from, date_to)
    if tipo and tipo.strip():
        clauses.append("LOWER(tipo_egreso) = %s")
        params.append(tipo.strip().lower())
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"""
        SELECT id_egreso, fecha, proveedor, tipo_egreso, factura, subtotal, impuestos, total, metodo_pago, afecta_inventario
        FROM fin_egresos
        {where}
        ORDER BY fecha DESC, id_egreso DESC
        LIMIT 200
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
    return [dict(row) for row in rows]


def fetch_config() -> Dict[str, List[Dict[str, Any]]]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id_categoria, nombre, tipo, activo FROM fin_categorias ORDER BY nombre")
        categorias = [dict(row) for row in cur.fetchall()]

        cur.execute("SELECT id_impuesto, nombre, tasa, aplica_a, activo FROM fin_impuestos ORDER BY nombre")
        impuestos = [dict(row) for row in cur.fetchall()]

        cur.execute("SELECT id_cuenta, nombre, tipo, moneda, saldo_inicial, activo FROM fin_cuentas ORDER BY nombre")
        cuentas = [dict(row) for row in cur.fetchall()]

        cur.execute("SELECT id_regla, nombre, origen, accion, activo FROM fin_reglas ORDER BY id_regla DESC")
        reglas = [dict(row) for row in cur.fetchall()]

    return {
        "categorias": categorias,
        "impuestos": impuestos,
        "cuentas": cuentas,
        "reglas": reglas,
    }
