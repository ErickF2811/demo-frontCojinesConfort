import os

import psycopg2
from psycopg2.extras import RealDictCursor


def get_database_url() -> str:
    """Return the database connection string from the environment."""
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Provide a valid PostgreSQL URL, por ejemplo "
            "postgresql://user:password@hostname:5432/database"
        )
    return database_url


def get_connection() -> psycopg2.extensions.connection:
    """Create a new database connection using a dict-like cursor."""
    return psycopg2.connect(get_database_url(), cursor_factory=RealDictCursor)
