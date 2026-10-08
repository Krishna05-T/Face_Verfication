"""
Face Vault - Database Manager
Handles SQLite database operations for storing face embeddings, user profiles, and verification logs.
"""

import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any

DB_PATH = os.path.join(os.path.dirname(__file__), "face_vault.db")


def get_db_connection() -> sqlite3.Connection:
    """Create and return a database connection with dict-like row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables and default configuration."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Table for registered users and their 512-D embeddings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            department TEXT DEFAULT 'General',
            email TEXT DEFAULT '',
            embedding_json TEXT NOT NULL,
            photo_base64 TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table for audit logs of every verification attempt
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS verification_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            user_name TEXT,
            mode TEXT NOT NULL,
            matched INTEGER NOT NULL,
            similarity_score REAL NOT NULL,
            cosine_distance REAL NOT NULL,
            threshold REAL NOT NULL,
            snapshot_base64 TEXT DEFAULT '',
            liveness_passed INTEGER DEFAULT 1,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Settings table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)

    # Insert default settings if not exists
    default_settings = {
        "similarity_threshold": "0.38",  # Cosine distance threshold for Facenet512 (~62% similarity)
        "model_name": "Facenet512",
        "detector_backend": "opencv"
    }

    for key, val in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))

    conn.commit()
    conn.close()


def save_user(user_id: str, name: str, embedding: List[float], department: str = "General", email: str = "", photo_base64: str = "") -> bool:
    """Register or update a user with their face embedding."""
    conn = get_db_connection()
    cursor = conn.cursor()
    embedding_json = json.dumps(embedding)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        INSERT INTO users (user_id, name, department, email, embedding_json, photo_base64, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            name = excluded.name,
            department = excluded.department,
            email = excluded.email,
            embedding_json = excluded.embedding_json,
            photo_base64 = excluded.photo_base64,
            updated_at = excluded.updated_at
    """, (user_id.strip(), name.strip(), department.strip(), email.strip(), embedding_json, photo_base64, now, now))

    conn.commit()
    conn.close()
    return True


def get_all_users() -> List[Dict[str, Any]]:
    """Retrieve all users with parsed embeddings."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, user_id, name, department, email, embedding_json, photo_base64, created_at FROM users ORDER BY created_at DESC")
    rows = cursor.fetchall()
    users = []
    for row in rows:
        users.append({
            "id": row["id"],
            "user_id": row["user_id"],
            "name": row["name"],
            "department": row["department"],
            "email": row["email"],
            "embedding": json.loads(row["embedding_json"]),
            "photo_base64": row["photo_base64"],
            "created_at": row["created_at"]
        })
    conn.close()
    return users


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific user by user_id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, user_id, name, department, email, embedding_json, photo_base64, created_at FROM users WHERE user_id = ?", (user_id.strip(),))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "name": row["name"],
        "department": row["department"],
        "email": row["email"],
        "embedding": json.loads(row["embedding_json"]),
        "photo_base64": row["photo_base64"],
        "created_at": row["created_at"]
    }


def delete_user(user_id: str) -> bool:
    """Delete a user from the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE user_id = ?", (user_id.strip(),))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def log_verification(user_id: Optional[str], user_name: Optional[str], mode: str, matched: bool,
                     similarity_score: float, cosine_distance: float, threshold: float,
                     snapshot_base64: str = "") -> int:
    """Log a verification attempt into the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO verification_logs (user_id, user_name, mode, matched, similarity_score, cosine_distance, threshold, snapshot_base64, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id or "UNKNOWN", user_name or "Unknown Person", mode, 1 if matched else 0,
          round(similarity_score, 2), round(cosine_distance, 4), round(threshold, 4), snapshot_base64, now))
    log_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return log_id


def get_verification_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve recent verification logs."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, user_id, user_name, mode, matched, similarity_score, cosine_distance, threshold, snapshot_base64, timestamp FROM verification_logs ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    logs = []
    for row in rows:
        logs.append({
            "id": row["id"],
            "user_id": row["user_id"],
            "user_name": row["user_name"],
            "mode": row["mode"],
            "matched": bool(row["matched"]),
            "similarity_score": row["similarity_score"],
            "cosine_distance": row["cosine_distance"],
            "threshold": row["threshold"],
            "snapshot_base64": row["snapshot_base64"],
            "timestamp": row["timestamp"]
        })
    conn.close()
    return logs


def get_stats() -> Dict[str, Any]:
    """Calculate summary statistics."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as count FROM users")
    total_users = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) as count FROM verification_logs")
    total_verifications = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) as count FROM verification_logs WHERE matched = 1")
    matched_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) as count FROM verification_logs WHERE DATE(timestamp) = DATE('now')")
    today_count = cursor.fetchone()["count"]

    conn.close()

    match_rate = round((matched_count / total_verifications * 100), 1) if total_verifications > 0 else 100.0

    return {
        "total_users": total_users,
        "total_verifications": total_verifications,
        "today_verifications": today_count,
        "match_rate": match_rate
    }


def get_setting(key: str, default: str = "") -> str:
    """Get a configuration setting."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default


def update_setting(key: str, value: str):
    """Update a configuration setting."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully!")
    stats = get_stats()
    print("Current Stats:", stats)
