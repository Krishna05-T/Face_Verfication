"""
Face Vault - Database Manager (PostgreSQL Version)
"""

import os
import json
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any

import psycopg2
import psycopg2.extras

# Get DATABASE_URL from environment
DATABASE_URL = os.environ.get("DATABASE_URL")

def get_db_connection():
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable is not set! Please set it in Render Environment Variables.")
    
    # Connect to PostgreSQL
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS verification_logs (
            id SERIAL PRIMARY KEY,
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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)

    default_settings = {
        "similarity_threshold": "0.38",
        "model_name": "Facenet512",
        "detector_backend": "opencv"
    }

    for key, val in default_settings.items():
        cursor.execute("""
            INSERT INTO settings (key, value) 
            VALUES (%s, %s) 
            ON CONFLICT (key) DO NOTHING
        """, (key, val))

    conn.commit()
    conn.close()


def save_user(user_id: str, name: str, embedding: List[float], department: str = "General", email: str = "", photo_base64: str = "") -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    embedding_json = json.dumps(embedding)
    now = datetime.now()

    cursor.execute("""
        INSERT INTO users (user_id, name, department, email, embedding_json, photo_base64, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT(user_id) DO UPDATE SET
            name = EXCLUDED.name,
            department = EXCLUDED.department,
            email = EXCLUDED.email,
            embedding_json = EXCLUDED.embedding_json,
            photo_base64 = EXCLUDED.photo_base64,
            updated_at = EXCLUDED.updated_at
    """, (user_id.strip(), name.strip(), department.strip(), email.strip(), embedding_json, photo_base64, now, now))

    conn.commit()
    conn.close()
    return True


def get_all_users() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
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
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cursor.execute("SELECT id, user_id, name, department, email, embedding_json, photo_base64, created_at FROM users WHERE user_id = %s", (user_id.strip(),))
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
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE user_id = %s", (user_id.strip(),))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def log_verification(user_id: Optional[str], user_name: Optional[str], mode: str, matched: bool,
                     similarity_score: float, cosine_distance: float, threshold: float,
                     snapshot_base64: str = "") -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now()
    cursor.execute("""
        INSERT INTO verification_logs (user_id, user_name, mode, matched, similarity_score, cosine_distance, threshold, snapshot_base64, timestamp)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (user_id or "UNKNOWN", user_name or "Unknown Person", mode, 1 if matched else 0,
          round(similarity_score, 2), round(cosine_distance, 4), round(threshold, 4), snapshot_base64, now))
    log_id = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    return log_id


def get_verification_logs(limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cursor.execute("SELECT id, user_id, user_name, mode, matched, similarity_score, cosine_distance, threshold, snapshot_base64, timestamp FROM verification_logs ORDER BY id DESC LIMIT %s", (limit,))
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
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cursor.execute("SELECT COUNT(*) as count FROM users")
    total_users = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) as count FROM verification_logs")
    total_verifications = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) as count FROM verification_logs WHERE matched = 1")
    matched_count = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) as count FROM verification_logs WHERE DATE(timestamp) = CURRENT_DATE")
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
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cursor.execute("SELECT value FROM settings WHERE key = %s", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default


def update_setting(key: str, value: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO settings (key, value) VALUES (%s, %s)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    """, (key, str(value)))
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully!")
    stats = get_stats()
    print("Current Stats:", stats)
