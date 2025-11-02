from __future__ import annotations

from typing import Any, Dict, List, Optional

from db import get_connection


def list_catalog_entries() -> List[Dict[str, Any]]:
    """Return catalog records ordered by creation date (desc)."""
    query = """
        SELECT
            catalog_id,
            created_at,
            catalog_name,
            description,
            collection,
            stack,
            url_catalogo,
            url_portada
        FROM tbl_catalogo
        ORDER BY created_at DESC, catalog_id DESC
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()
    return rows


def create_catalog_entry(
    *,
    catalog_name: str,
    description: str,
    collection: Optional[str],
    stack: bool,
    url_catalogo: str,
    url_portada: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert a new catalog record. Allows multiple featured entries.

    Previously, when inserting with stack=True it would clear other featured
    rows. This behavior has been removed to support multiple selections.
    """
    stack_value = 1 if stack else 0
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO tbl_catalogo (catalog_name, description, collection, stack, url_catalogo, url_portada)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING catalog_id, created_at, catalog_name, description, collection, stack, url_catalogo, url_portada
            """,
            (catalog_name, description, collection, stack_value, url_catalogo, url_portada),
        )
        record = cur.fetchone()
        conn.commit()
    return record


def set_catalog_stack(catalog_id: int) -> Dict[str, Any]:
    """Legacy helper kept for compatibility: sets the given catalog as featured
    and does NOT unfeature others anymore.

    Use update_catalog_stack for explicit value control.
    """
    return update_catalog_stack(catalog_id, True)


def update_catalog_stack(catalog_id: int, value: bool) -> Dict[str, Any]:
    """Set stack flag for a single catalog without affecting others."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT catalog_id FROM tbl_catalogo WHERE catalog_id = %s;", (catalog_id,))
        if not cur.fetchone():
            raise ValueError("Catálogo no encontrado.")
        cur.execute(
            """
            UPDATE tbl_catalogo
            SET stack = %s
            WHERE catalog_id = %s
            """,
            (1 if value else 0, catalog_id),
        )
        cur.execute(
            """
            SELECT catalog_id, created_at, catalog_name, description, collection, stack, url_catalogo, url_portada
            FROM tbl_catalogo
            WHERE catalog_id = %s
            """,
            (catalog_id,),
        )
        record = cur.fetchone()
        conn.commit()
    return record
