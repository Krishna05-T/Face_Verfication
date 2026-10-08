"""
Face Vault - Application Server
Flask web application providing REST APIs and UI for Face Registration & Verification.
"""

import sys
import os
import sqlite3
from flask import Flask, render_template, request, jsonify

# Ensure UTF-8 output encoding for Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import database
import face_engine

app = Flask(__name__, static_folder="static", template_folder="templates")

# Initialize database on startup
database.init_db()

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', '*')
    response.headers.add('Access-Control-Allow-Methods', '*')
    return response


@app.route("/")
def index():
    """Render main application interface."""
    return render_template("index.html")


@app.route("/api/register", methods=["POST"])
def api_register():
    """Register a new user and extract + store face embedding."""
    try:
        data = request.get_json(force=True)
        user_id = (data.get("user_id") or "").strip()
        name = (data.get("name") or "").strip()
        department = (data.get("department") or "General").strip()
        email = (data.get("email") or "").strip()
        image_data = data.get("image", "")

        if not user_id:
            return jsonify({"success": False, "error": "User ID is required."}), 400
        if not name:
            return jsonify({"success": False, "error": "Full Name is required."}), 400
        if not image_data:
            return jsonify({"success": False, "error": "Face photo is required."}), 400

        result = face_engine.register_new_face(
            user_id=user_id,
            name=name,
            img_input=image_data,
            department=department,
            email=email
        )
        return jsonify(result), 200

    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/api/verify", methods=["POST"])
def api_verify():
    """Verify live captured photo against stored embeddings."""
    try:
        data = request.get_json(force=True)
        image_data = data.get("image", "")
        target_user_id = (data.get("user_id") or "").strip() or None
        custom_threshold = data.get("threshold", None)

        if not image_data:
            return jsonify({"success": False, "error": "Live image is required for verification."}), 400

        threshold_val = float(custom_threshold) if custom_threshold is not None else None

        result = face_engine.verify_live_face(
            live_img_input=image_data,
            target_user_id=target_user_id,
            threshold=threshold_val
        )
        return jsonify(result), 200

    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route("/api/users", methods=["GET"])
def api_get_users():
    """List all registered users."""
    try:
        users = database.get_all_users()
        # Clean response to omit full 512-dim embedding to keep payload light
        light_users = []
        for u in users:
            light_users.append({
                "id": u["id"],
                "user_id": u["user_id"],
                "name": u["name"],
                "department": u["department"],
                "email": u["email"],
                "photo_base64": u["photo_base64"],
                "created_at": u["created_at"],
                "embedding_dimensions": len(u["embedding"])
            })
        return jsonify({"success": True, "users": light_users, "total": len(light_users)}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/users/<user_id>", methods=["GET"])
def api_get_user(user_id):
    """Get single user profile with embedding snippet."""
    try:
        user = database.get_user_by_id(user_id)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404
        
        # Add embedding preview (first 10 values)
        emb = user["embedding"]
        user_data = {
            "id": user["id"],
            "user_id": user["user_id"],
            "name": user["name"],
            "department": user["department"],
            "email": user["email"],
            "photo_base64": user["photo_base64"],
            "created_at": user["created_at"],
            "embedding_dimensions": len(emb),
            "embedding_preview": [round(x, 4) for x in emb[:12]]
        }
        return jsonify({"success": True, "user": user_data}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/users/<user_id>", methods=["DELETE"])
def api_delete_user(user_id):
    """Delete a user from database."""
    try:
        success = database.delete_user(user_id)
        if success:
            return jsonify({"success": True, "message": f"User '{user_id}' deleted successfully."}), 200
        else:
            return jsonify({"success": False, "error": "User not found or already deleted."}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/logs", methods=["GET"])
def api_get_logs():
    """Get recent verification logs."""
    try:
        limit = request.args.get("limit", 50, type=int)
        logs = database.get_verification_logs(limit=limit)
        return jsonify({"success": True, "logs": logs}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/clear_logs", methods=["POST"])
def api_clear_logs():
    """Clear all verification logs."""
    try:
        conn = database.get_db_connection()
        conn.execute("DELETE FROM verification_logs")
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Verification logs cleared."}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/stats", methods=["GET"])
def api_get_stats():
    """Get system stats."""
    try:
        stats = database.get_stats()
        return jsonify({"success": True, "stats": stats}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    """Get or update settings."""
    if request.method == "GET":
        threshold = database.get_setting("similarity_threshold", "0.38")
        model = database.get_setting("model_name", "Facenet512")
        detector = database.get_setting("detector_backend", "opencv")
        return jsonify({
            "success": True,
            "settings": {
                "similarity_threshold": float(threshold),
                "model_name": model,
                "detector_backend": detector
            }
        }), 200
    else:
        try:
            data = request.get_json(force=True)
            if "similarity_threshold" in data:
                database.update_setting("similarity_threshold", str(data["similarity_threshold"]))
            if "model_name" in data:
                database.update_setting("model_name", str(data["model_name"]))
            if "detector_backend" in data:
                database.update_setting("detector_backend", str(data["detector_backend"]))
            return jsonify({"success": True, "message": "Settings updated successfully."}), 200
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    print("=====================================================")
    print("🚀 Face Vault - Biometric Face Verification System")
    print("🌐 Running on http://0.0.0.0:5000 (accessible from local network)")
    print("=====================================================")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
