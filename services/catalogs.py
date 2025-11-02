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
            url_catalogo
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
) -> Dict[str, Any]:
    """Insert a new catalog record and optionally mark it as the featured one."""
    stack_value = 1 if stack else 0
    with get_connection() as conn, conn.cursor() as cur:
        if stack_value:
            cur.execute("UPDATE tbl_catalogo SET stack = 0 WHERE stack = 1;")
        cur.execute(
            """
            INSERT INTO tbl_catalogo (catalog_name, description, collection, stack, url_catalogo)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING catalog_id, created_at, catalog_name, description, collection, stack, url_catalogo
            """,
            (catalog_name, description, collection, stack_value, url_catalogo),
        )
        record = cur.fetchone()
        conn.commit()
    return record


def set_catalog_stack(catalog_id: int) -> Dict[str, Any]:
    """Mark the given catalog as the featured one (stack=1)."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT catalog_id FROM tbl_catalogo WHERE catalog_id = %s;", (catalog_id,))
        if not cur.fetchone():
            raise ValueError("Catálogo no encontrado.")
        cur.execute(
            """
            UPDATE tbl_catalogo
            SET stack = CASE WHEN catalog_id = %s THEN 1 ELSE 0 END
            """,
            (catalog_id,),
        )
        cur.execute(
            """
            SELECT catalog_id, created_at, catalog_name, description, collection, stack, url_catalogo
            FROM tbl_catalogo
            WHERE catalog_id = %s
            """,
            (catalog_id,),
        )
        record = cur.fetchone()
        conn.commit()
    return record
