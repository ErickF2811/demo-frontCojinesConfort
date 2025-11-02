import base64
import mimetypes
import os
from collections import defaultdict, deque
from datetime import datetime
from decimal import Decimal
from typing import Any, Deque, Dict, List
from uuid import uuid4

from flask import Flask, jsonify, render_template, request

from db import get_connection
from services.catalogs import create_catalog_entry, list_catalog_entries, set_catalog_stack

try:  # Optional dependency for Azure Blob Storage
    from azure.storage.blob import BlobServiceClient  # type: ignore
except Exception:  # pragma: no cover - azure library might be missing
    BlobServiceClient = None  # type: ignore


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
                SUM(CASE WHEN LOWER(tipo) = 'entrada' THEN cantidad ELSE 0 END) AS total_entradas,
                SUM(CASE WHEN LOWER(tipo) = 'salida' THEN cantidad ELSE 0 END) AS total_salidas
            FROM vista_movimientos_materiales
            GROUP BY id_material
        ),
        movement_history AS (
            SELECT
                id_material,
                tipo,
                SUM(cantidad) AS total_por_tipo
            FROM vista_movimientos_materiales
            GROUP BY id_material, tipo
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
                    'tipo_movimiento', mh.tipo,
                    'total_por_tipo', mh.total_por_tipo
                )
                ORDER BY mh.tipo
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


def fetch_material_list(
    filters: Dict[str, str],
    sort_by: str | None = None,
    sort_dir: str | None = None,
) -> List[Dict[str, Any]]:
    """Fetch materials from the database view with provider and image URL.

    Supports sorting by: id (id_material), stock (stock_actual), name (material_name).
    """
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

    # Sort handling (whitelist to avoid SQL injection)
    sort_map = {
        "id": "id_material",
        "stock": "stock_actual",
        "name": "material_name",
    }
    order_expr = sort_map.get((sort_by or "").lower(), "id_material")
    direction = "DESC" if (sort_dir or "").lower() == "desc" else "ASC"

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
            CASE
                WHEN COALESCE(NULLIF(TRIM(storage_account), ''), '') ~* '^(http|https)://' THEN COALESCE(NULLIF(TRIM(storage_account), ''), '')
                WHEN COALESCE(NULLIF(TRIM(storage_account), ''), '') <> '' AND COALESCE(NULLIF(TRIM(imagen_name), ''), '') <> '' THEN
                    COALESCE(NULLIF(TRIM(storage_account), ''), '') || '/' || COALESCE(NULLIF(TRIM(imagen_name), ''), '')
                ELSE COALESCE(NULLIF(TRIM(storage_account), ''), '')
            END AS image_url,
            COALESCE(stock_actual, 0) AS stock_actual
        FROM vista_materiales_proveedores
        {where_sql}
        ORDER BY {order_expr} {direction}, id_material ASC
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


def fetch_material_list_with_total(
    filters: Dict[str, str],
    sort_by: str | None,
    sort_dir: str | None,
    page: int,
    per_page: int,
) -> Dict[str, Any]:
    """Fetch paginated materials and total count."""
    where_clauses = []
    params: List[Any] = []

    mapping = {
        "material_name": ("COALESCE(NULLIF(TRIM(material_name), ''), 'Sin nombre')", "ILIKE"),
        "color": ("COALESCE(NULLIF(TRIM(color), ''), 'Sin color')", "ILIKE"),
        "tipo": ("COALESCE(NULLIF(TRIM(tipo), ''), 'Sin tipo')", "ILIKE"),
        "categoria": ("COALESCE(NULLIF(TRIM(categoria), ''), 'Sin categoría')", "ILIKE"),
        "provider_name": ("COALESCE(NULLIF(TRIM(proveedor), ''), 'Sin proveedor')", "ILIKE"),
    }

    for key, values in filters.items():
        if not values or key not in mapping:
            continue
        expression, operator = mapping[key]
        ors = []
        for v in values:
            ors.append(f"{expression} {operator} %s")
            params.append(f"%{v}%")
        if ors:
            where_clauses.append("(" + " OR ".join(ors) + ")")

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    sort_map = {
        "id": "id_material",
        "stock": "stock_actual",
        "name": "material_name",
    }
    order_expr = sort_map.get((sort_by or "").lower(), "id_material")
    direction = "DESC" if (sort_dir or "").lower() == "desc" else "ASC"

    # Total count
    count_sql = f"SELECT COUNT(*) AS total FROM vista_materiales_proveedores {where_sql}"

    offset = max(0, (page - 1) * per_page)
    data_sql = f"""
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
            CASE
                WHEN COALESCE(NULLIF(TRIM(storage_account), ''), '') ~* '^(http|https)://' THEN COALESCE(NULLIF(TRIM(storage_account), ''), '')
                WHEN COALESCE(NULLIF(TRIM(storage_account), ''), '') <> '' AND COALESCE(NULLIF(TRIM(imagen_name), ''), '') <> '' THEN
                    COALESCE(NULLIF(TRIM(storage_account), ''), '') || '/' || COALESCE(NULLIF(TRIM(imagen_name), ''), '')
                ELSE COALESCE(NULLIF(TRIM(storage_account), ''), '')
            END AS image_url,
            COALESCE(stock_actual, 0) AS stock_actual
        FROM vista_materiales_proveedores
        {where_sql}
        ORDER BY {order_expr} {direction}, id_material ASC
        LIMIT %s OFFSET %s
    """

    with get_connection() as conn, conn.cursor() as cur:
        # total
        cur.execute(count_sql, params)
        total = int(cur.fetchone()["total"])
        # page data
        cur.execute(data_sql, params + [per_page, offset])
        rows = list(cur.fetchall())

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "data": [
            {key: normalize_value(value) for key, value in row.items()}
            for row in rows
        ],
    }


def normalize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [normalize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_value(item) for key, item in value.items()}
    return value


def fetch_material_detail(material_id: str) -> Dict[str, Any] | None:
    """Fetch single material info from the view by id."""
    query = """
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
            CASE
                WHEN COALESCE(NULLIF(TRIM(storage_account), ''), '') ~* '^(http|https)://' THEN COALESCE(NULLIF(TRIM(storage_account), ''), '')
                WHEN COALESCE(NULLIF(TRIM(storage_account), ''), '') <> '' AND COALESCE(NULLIF(TRIM(imagen_name), ''), '') <> '' THEN
                    COALESCE(NULLIF(TRIM(storage_account), ''), '') || '/' || COALESCE(NULLIF(TRIM(imagen_name), ''), '')
                ELSE COALESCE(NULLIF(TRIM(storage_account), ''), '')
            END AS image_url,
            COALESCE(stock_actual, 0) AS stock_actual
        FROM vista_materiales_proveedores
        WHERE id_material = %s
        LIMIT 1
    """

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, (material_id,))
        row = cur.fetchone()
        if not row:
            return None
        return {key: normalize_value(value) for key, value in row.items()}


def fetch_material_movements(material_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Fetch last N movements for a material from vista_movimientos."""
    query = """
        SELECT id_movimiento, fecha, tipo, id_material, cantidad, unidad, motivo, observaciones, funda
        FROM vista_movimientos
        WHERE id_material = %s
        ORDER BY fecha DESC
        LIMIT %s
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(query, (material_id, limit))
        rows = cur.fetchall()
        return [
            {key: normalize_value(value) for key, value in row.items()}
            for row in rows
        ]


# -------------------------------
# Azure Blob Storage helpers
# -------------------------------
DEFAULT_CHAT_WEBHOOK_URL = (
    "error: no webhook configured"
)

AZURE_BLOB_CONNECTION_STRING = os.environ.get(
    "AZURE_BLOB_CONNECTION_STRING"
)
AZURE_BLOB_CONTAINER = os.environ.get("AZURE_BLOB_CONTAINER", "blobchat")
AZURE_BLOB_CATALOG_CONTAINER = os.environ.get("AZURE_BLOB_CATALOG_CONTAINER", "blobcatalogos")

_blob_service_client = None
_blob_container_clients: Dict[str, Any] = {}


def get_chat_webhook_url() -> str:
    """Return webhook URL for chat, falling back to default."""
    return os.environ.get("CHAT_WEBHOOK_URL", DEFAULT_CHAT_WEBHOOK_URL).strip() or DEFAULT_CHAT_WEBHOOK_URL


def get_blob_container_client(container_name: str):
    """Return (and lazily initialise) a container client for uploads."""
    global _blob_service_client, _blob_container_clients
    if BlobServiceClient is None:
        raise RuntimeError(
            "El paquete azure-storage-blob no está instalado. "
            "Instálalo con `pip install azure-storage-blob`."
        )
    if not AZURE_BLOB_CONNECTION_STRING:
        raise RuntimeError("AZURE_BLOB_CONNECTION_STRING no está configurado.")

    if _blob_service_client is None:
        _blob_service_client = BlobServiceClient.from_connection_string(
            AZURE_BLOB_CONNECTION_STRING
        )
    if container_name not in _blob_container_clients:
        client = _blob_service_client.get_container_client(container_name)
        try:
            client.create_container()
        except Exception as exc:  # pragma: no cover - ignore already exists
            error_code = getattr(exc, "error_code", None)
            if error_code not in {None, "ContainerAlreadyExists"}:
                raise
        _blob_container_clients[container_name] = client
    return _blob_container_clients[container_name]


def build_blob_name(original_name: str | None, content_type: str | None) -> str:
    """Generate a unique blob filename preserving extension when possible."""
    suffix = ""
    if original_name and "." in original_name:
        suffix = original_name.rsplit(".", 1)[-1].strip()
    if not suffix:
        if content_type:
            guessed = mimetypes.guess_extension(content_type.split(";")[0].strip())
            if guessed:
                suffix = guessed.lstrip(".")
    if not suffix:
        suffix = "bin"
    return f"{uuid4().hex}.{suffix}"


def upload_blob_from_base64(
    data_base64: str,
    *,
    filename: str | None,
    content_type: str | None,
    media_kind: str | None = None,
) -> str:
    """Upload a base64 string to Azure Blob Storage and return the public URL."""
    if not data_base64:
        raise ValueError("No se proporcionó data para subir al blob.")

    if "," in data_base64:
        data_base64 = data_base64.split(",", 1)[1]
    try:
        binary = base64.b64decode(data_base64)
    except Exception as exc:
        raise ValueError("No se pudo decodificar el contenido base64.") from exc

    kind = (media_kind or "").lower()
    folder_map = {
        "image": "images",
        "img": "images",
        "audio": "audio",
        "voice": "audio",
        "video": "video",
    }
    folder = folder_map.get(kind, "files")

    blob_name = build_blob_name(filename, content_type)
    blob_path = f"{folder}/{blob_name}"

    container_client = get_blob_container_client(AZURE_BLOB_CONTAINER)
    container_client.upload_blob(
        name=blob_path,
        data=binary,
        overwrite=True,
        content_type=content_type or "application/octet-stream",
    )
    return f"{container_client.url}/{blob_path}"


def classify_media_kind(declared_type: str | None, content_type: str | None) -> str:
    """Return a simplified media kind (image, voice, video, file)."""
    declared = (declared_type or "").lower()
    mime = (content_type or "").lower()
    if declared in {"image", "img"} or mime.startswith("image/"):
        return "image"
    if declared in {"audio", "voz", "voice"} or mime.startswith("audio/"):
        return "voice"
    if declared in {"video"} or mime.startswith("video/"):
        return "video"
    return "file"


def upload_blob_stream(
    file_obj,
    *,
    filename: str | None,
    content_type: str | None,
    container_name: str,
    prefix: str = "",
) -> str:
    """Upload a binary stream (e.g., PDF) to Azure Blob Storage."""
    if not file_obj:
        raise ValueError("Archivo inválido.")

    blob_name = build_blob_name(filename, content_type or "application/octet-stream")
    blob_path = f"{prefix.strip('/') + '/' if prefix else ''}{blob_name}"

    container_client = get_blob_container_client(container_name)
    container_client.upload_blob(
        name=blob_path,
        data=file_obj,
        overwrite=True,
        content_type=content_type or "application/octet-stream",
        metadata={"original_name": filename or blob_name},
    )
    return f"{container_client.url}/{blob_path}"


def serialize_catalog_row(
    row: Dict[str, Any],
    *,
    container=None,
    size_override: int | None = None,
    last_modified_override: str | None = None,
) -> Dict[str, Any]:
    """Normalize catalog row for JSON responses including blob properties when possible."""
    data = {
        "catalog_id": row.get("catalog_id"),
        "catalog_name": row.get("catalog_name"),
        "description": row.get("description") or "",
        "collection": row.get("collection") or "",
        "stack": bool(row.get("stack")),
        "url": row.get("url_catalogo") or "",
        "created_at": (
            row.get("created_at").isoformat()
            if isinstance(row.get("created_at"), datetime)
            else row.get("created_at")
        ),
    }
    data["display_name"] = data["catalog_name"]

    size = size_override
    last_modified = last_modified_override

    if container and data["url"] and size is None and last_modified is None:
        prefix = container.url.rstrip("/") + "/"
        if data["url"].startswith(prefix):
            blob_name = data["url"][len(prefix):]
            try:
                props = container.get_blob_client(blob_name).get_blob_properties()
                size = props.size
                last_modified = props.last_modified.isoformat() if props.last_modified else None
            except Exception:  # pragma: no cover - blob may not exist
                size = None
                last_modified = None

    data["size"] = size
    data["last_modified"] = last_modified
    return data
# -------------------------------
# Chat inbox (in-memory)
# -------------------------------
CHAT_INBOX: Dict[str, Deque[Dict[str, Any]]] = defaultdict(deque)
CHAT_INBOX_MAX = 100


def push_chat_messages(session_id: str, messages: List[Dict[str, Any]]) -> int:
    """Store bot messages grouped by session. Returns number stored."""
    if not session_id or not isinstance(session_id, str):
        return 0
    inbox = CHAT_INBOX[session_id]
    stored = 0
    for message in messages:
        if not isinstance(message, dict):
            continue
        role = message.get("role") or "bot"
        content = (
            message.get("content")
            or message.get("text")
            or message.get("message")
            or ""
        ).strip()
        attachments = message.get("attachments")
        if not isinstance(attachments, list):
            attachments = []
        timestamp = message.get("timestamp")
        if not timestamp:
            timestamp = datetime.utcnow().isoformat() + "Z"
        entry = {
            "role": role if role in {"bot", "user"} else "bot",
            "content": content,
            "attachments": attachments,
            "timestamp": timestamp,
        }
        inbox.append(entry)
        stored += 1
        while len(inbox) > CHAT_INBOX_MAX:
            inbox.popleft()
    return stored


def pull_chat_messages(session_id: str) -> List[Dict[str, Any]]:
    """Return and clear queued messages for a session."""
    if not session_id or session_id not in CHAT_INBOX:
        return []
    inbox = CHAT_INBOX[session_id]
    items: List[Dict[str, Any]] = []
    while inbox:
        items.append(inbox.popleft())
    if not inbox:
        CHAT_INBOX.pop(session_id, None)
    return items


app = Flask(__name__)


@app.route("/")
def index() -> str:
    """Render materials page as the home."""
    return render_template("materiales.html", chat_webhook_url=get_chat_webhook_url())


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
    return render_template("materiales.html", chat_webhook_url=get_chat_webhook_url())


@app.route("/api/materiales")
def api_materiales():
    """Return the materials list coming from the DB view."""
    def get_multi(name: str) -> list[str]:
        vals = [v for v in request.args.getlist(name) if v and v.strip()]
        if len(vals) == 1 and "," in vals[0]:
            vals = [p.strip() for p in vals[0].split(",") if p.strip()]
        return vals

    filters = {
        "material_name": get_multi("material_name"),
        "color": get_multi("color"),
        "tipo": get_multi("tipo"),
        "categoria": get_multi("categoria"),
        "provider_name": get_multi("provider_name"),
    }
    sort_by = request.args.get("sort_by", type=str, default="id")
    sort_dir = request.args.get("sort_dir", type=str, default="asc")
    page = request.args.get("page", type=int, default=1)
    per_page = request.args.get("per_page", type=int, default=20)

    try:
        result = fetch_material_list_with_total(
            filters, sort_by=sort_by, sort_dir=sort_dir, page=max(1, page), per_page=max(1, min(per_page, 200))
        )
        return jsonify(result)
    except Exception as exc:  # pragma: no cover - used for runtime error reporting
        return jsonify({"error": str(exc)}), 500


@app.route("/api/materiales/<material_id>")
def api_material_detail(material_id: str):
    """Return a single material info (for detail modal header)."""
    try:
        detail = fetch_material_detail(material_id)
        if not detail:
            return jsonify({"error": "Material no encontrado"}), 404
        return jsonify(detail)
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": str(exc)}), 500


@app.route("/api/materiales/<material_id>/movimientos")
def api_material_movements(material_id: str):
    """Return last movements for a material from vista_movimientos."""
    try:
        limit = request.args.get("limit", default=5, type=int)
        data = fetch_material_movements(material_id, limit=limit)
        return jsonify(data)
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": str(exc)}), 500


@app.route("/api/catalogs", methods=["GET", "POST"])
def api_catalogs():
    """Manage PDF catalog uploads and listing."""
    if request.method == "POST":
        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"error": "Selecciona un archivo PDF."}), 400

        catalog_name = (request.form.get("catalog_name") or "").strip()
        description = (request.form.get("description") or "").strip()
        collection = (request.form.get("collection") or "").strip() or None
        stack_flag = (request.form.get("stack") or "0").strip().lower()
        stack = stack_flag in {"1", "true", "on", "yes"}

        if not catalog_name:
            return jsonify({"error": "El nombre del catálogo es obligatorio."}), 400
        if not description:
            return jsonify({"error": "La descripción es obligatoria."}), 400

        mimetype = (file.mimetype or "").lower()
        if "pdf" not in mimetype:
            return jsonify({"error": "Solo se permiten archivos PDF."}), 400

        filename = file.filename
        file.stream.seek(0, os.SEEK_END)
        size_bytes = file.stream.tell()
        file.stream.seek(0)

        try:
            url = upload_blob_stream(
                file.stream,
                filename=filename,
                content_type=file.mimetype,
                container_name=AZURE_BLOB_CATALOG_CONTAINER,
                prefix="catalogs",
            )
            record = create_catalog_entry(
                catalog_name=catalog_name,
                description=description,
                collection=collection,
                stack=stack,
                url_catalogo=url,
            )
            record = normalize_value(record)
            container = get_blob_container_client(AZURE_BLOB_CATALOG_CONTAINER)
            payload = serialize_catalog_row(
                record,
                container=container,
                size_override=size_bytes,
                last_modified_override=None,
            )
            return jsonify({"message": "Catálogo cargado correctamente.", "catalog": payload}), 201
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:  # pragma: no cover
            return jsonify({"error": str(exc)}), 500

    try:
        records = [normalize_value(row) for row in list_catalog_entries()]
        container = get_blob_container_client(AZURE_BLOB_CATALOG_CONTAINER)
        items = [serialize_catalog_row(row, container=container) for row in records]
        return jsonify({"catalogs": items})
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": str(exc)}), 500


@app.route("/api/catalogs/<int:catalog_id>/stack", methods=["POST"])
def api_catalog_stack(catalog_id: int):
    """Mark a catalog as the featured (stack=1) entry."""
    try:
        record = set_catalog_stack(catalog_id)
        record = normalize_value(record)
        container = get_blob_container_client(AZURE_BLOB_CATALOG_CONTAINER)
        payload = serialize_catalog_row(record, container=container)
        return jsonify({"message": "Catálogo destacado actualizado.", "catalog": payload})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": str(exc)}), 500


@app.route("/api/chat/upload", methods=["POST"])
def api_chat_upload():
    """Receive a base64 attachment and upload it to Azure Blob Storage."""
    payload = request.get_json(silent=True) or {}
    data = payload.get("data")
    if not data:
        return jsonify({"error": "data es requerido"}), 400

    name = payload.get("name")
    content_type = payload.get("contentType") or payload.get("mimeType")
    declared_type = payload.get("type")

    media_kind = classify_media_kind(declared_type, content_type)

    try:
        url = upload_blob_from_base64(
            data,
            filename=name,
            content_type=content_type,
            media_kind=media_kind,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": str(exc)}), 500

    return jsonify(
        {
            "url": url,
            "name": name,
            "type": declared_type or media_kind,
            "media_kind": media_kind,
            "contentType": content_type,
        }
    )


@app.route("/api/chat/incoming", methods=["POST"])
def api_chat_incoming():
    """Receive asynchronous responses from the assistant/webhook service."""
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("sessionId") or payload.get("session_id")
    if not session_id:
        return jsonify({"error": "sessionId es requerido"}), 400

    messages_raw = payload.get("messages")
    messages: List[Dict[str, Any]] = []

    if isinstance(messages_raw, dict):
        messages_raw = [messages_raw]
    if isinstance(messages_raw, list):
        messages = [m for m in messages_raw if isinstance(m, dict)]
    else:
        attachments = payload.get("attachments")
        if not isinstance(attachments, list):
            attachments = []
        text = (
            payload.get("message")
            or payload.get("reply")
            or payload.get("text")
            or ""
        )
        if text or attachments:
            messages = [{
                "role": payload.get("role", "bot"),
                "content": text,
                "attachments": attachments,
                "timestamp": payload.get("timestamp"),
            }]

    stored = push_chat_messages(session_id, messages)
    status_code = 202 if stored else 200
    return jsonify({"accepted": stored}), status_code


@app.route("/api/chat/messages")
def api_chat_messages():
    """Return queued bot messages for the given sessionId."""
    session_id = request.args.get("sessionId") or request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "sessionId es requerido"}), 400

    messages = pull_chat_messages(session_id)
    return jsonify({"messages": messages})

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
