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
export DATABASE_URL="postgresql://admin:admin@postgre_dev:5432/cojines"
$env:DATABASE_URL= "postgresql://admin:admin@postgre_dev/cojines"
```

### Variables de entorno adicionales

La aplicación consume otras variables para el chat y Azure Blob Storage:

- `CHAT_WEBHOOK_URL`: URL del webhook que recibe los mensajes del widget de chat. Si no se define, se usa el endpoint de pruebas configurado en el código.
- `AZURE_BLOB_CONNECTION_STRING`: cadena de conexión del Storage Account donde se guardan los adjuntos enviados desde el chat.
- `AZURE_BLOB_CONTAINER`: contenedor destino en Azure Blob (por defecto `blobchat`).
- `AZURE_BLOB_CATALOG_CONTAINER`: contenedor donde se almacenan los catálogos PDF (por defecto `blobcatalogos`).

Ejemplo (PowerShell):

```powershell
$env:CHAT_WEBHOOK_URL = "https://tu-servidor/webhook"
$env:AZURE_BLOB_CONNECTION_STRING = "DefaultEndpointsProtocol=...;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"
$env:AZURE_BLOB_CONTAINER = "blobchat"
$env:AZURE_BLOB_CATALOG_CONTAINER = "blobcatalogos"
```

En Bash:

```bash
export CHAT_WEBHOOK_URL="https://tu-servidor/webhook"
export AZURE_BLOB_CONNECTION_STRING="DefaultEndpointsProtocol=...;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"
export AZURE_BLOB_CONTAINER="blobchat"
export AZURE_BLOB_CATALOG_CONTAINER="blobcatalogos"
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
- `GET /api/materiales`: listado paginado de materiales desde la vista `public.vista_materiales_proveedores`.
- `GET /api/materiales/{id}`: detalle de un material con `image_url` y `stock_actual` desde `public.vista_materiales_proveedores`.
- `GET /api/materiales/{id}/movimientos?limit=5`: últimos movimientos desde `public.vista_movimientos`.
- Adjuntos por material (Azure Blob, contenedor `AZURE_BLOB_CATALOG_CONTAINER`):
  - `GET /api/materiales/{id}/attachments`: lista blobs bajo `files/{id}/` devolviendo `{ items: [{ name, url, size, content_type }] }`.
  - `POST /api/materiales/{id}/attachments/upload`: sube un archivo en base64 al prefijo `files/{id}/`.
    Cuerpo JSON: `{ "name": "archivo.ext", "contentType": "image/jpeg|video/mp4|application/pdf", "data": "data:...;base64,..." }`.
    Respuesta: `{ url, name, contentType }`.

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

### Vistas y procedimientos usados

- Vistas:
  - `public.vista_materiales_proveedores`: base del listado y del detalle de materiales.
  - `public.vista_movimientos`: movimientos recientes para el modal de detalle.
- Procedimientos almacenados (SP): la aplicación no llama a ningún SP para adjuntos. Los
  archivos se manejan directamente en Azure Blob Storage. Si deseas registrar cada archivo
  también en la base de datos, puedes usar un SP propio como el que muestras (`sp_insert_file`)
  al completar la subida (p. ej., con los campos `id_material`, `path`, `descripcion`, `url`, `tipo`).

### Adjuntos en la interfaz

En el modal de detalle se añadió la sección “Archivos adjuntos”:
- Botón “Adjuntar”: abre el selector de archivos. El archivo se sube al contenedor configurado
  en `AZURE_BLOB_CATALOG_CONTAINER`, bajo `files/{ID_MATERIAL}/`.
- Lista de adjuntos: muestra nombre + acciones “Ver” y “Abrir”.
  - Imagen/Video: se previsualizan dentro del modal.
  - PDF: no se previsualiza; se abre en una pestaña nueva.

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

```powershell
$IMAGE_NAME = "cojines-app"
$VERSION = "v5.0"
$REGISTRY_USER = "erifcamp"
docker build -t ${IMAGE_NAME}:${VERSION} .
docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY_USER}/${IMAGE_NAME}:${VERSION}
docker push ${REGISTRY_USER}/${IMAGE_NAME}:${VERSION}
```

## Panel de Catálogos (PDF)

El panel “Catálogos PDF” permite subir, listar y marcar como destacados los catálogos en formato PDF almacenados en Azure Blob Storage.

- Tabla utilizada: `public.tbl_catalogo`
  - `catalog_id` BIGSERIAL PK
  - `created_at` TIMESTAMP NOT NULL DEFAULT now()
  - `catalog_name` VARCHAR(255) NOT NULL
  - `description` VARCHAR(255) NOT NULL
  - `collection` VARCHAR(255)
  - `stack` SMALLINT NOT NULL DEFAULT 0 — indicador “Destacado” (0/1). Se permiten múltiples destacados a la vez.
  - `url_catalogo` TEXT NOT NULL — URL pública del PDF en Azure Blob (`catalogs/<uuid>.pdf`)
  - `url_portada` TEXT NULL — URL pública de la portada en Azure Blob (`portadas_catalogo/<uuid>.<ext>`)

DDL de referencia (PostgreSQL):

```sql
CREATE TABLE IF NOT EXISTS public.tbl_catalogo (
  catalog_id   BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  catalog_name VARCHAR(255) NOT NULL,
  description  VARCHAR(255) NOT NULL,
  collection   VARCHAR(255),
  stack        SMALLINT NOT NULL DEFAULT 0,
  url_catalogo TEXT NOT NULL,
  url_portada  TEXT
);
CREATE INDEX IF NOT EXISTS idx_tbl_catalogo_created_at ON public.tbl_catalogo (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tbl_catalogo_stack ON public.tbl_catalogo (stack);
```

Variables de entorno (catálogos):

- `AZURE_BLOB_CONNECTION_STRING`: cadena de conexión del Storage Account.
- `AZURE_BLOB_CATALOG_CONTAINER`: contenedor para catálogos (por defecto `blobcatalogos`).

Convenciones en Azure Blob

- PDFs: carpeta `catalogs/`
- Portadas (imágenes): carpeta `portadas_catalogo/`

Endpoints del módulo

- `GET /api/catalogs`: devuelve `{ catalogs: [...] }` con filas de `tbl_catalogo` y, cuando es posible, `size` y `last_modified` del blob.
- `POST /api/catalogs`: crea un catálogo. Campos de formulario:
  - `catalog_name`, `description` (requeridos)
  - `collection` (opcional)
  - `stack` (“1”|“0”, opcional)
  - `file` (PDF requerido)
  - `cover` (imagen opcional)
  Sube `file` a `catalogs/` y `cover` a `portadas_catalogo/` y guarda sus URLs en la tabla.
- `POST /api/catalogs/<catalog_id>/stack`: marca o desmarca “Destacado” sin afectar a otros. Body JSON: `{ "value": true|false }`.

Notas

- Para evitar errores `InvalidMetadata` en Azure, los blobs se suben sin metadatos personalizados.
- El frontend usa checkboxes para permitir múltiples destacados.
- La API incluye `cover_url` (alias de `url_portada`) y `url` (alias de `url_catalogo`).
