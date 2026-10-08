"""
Face Vault - Face Recognition Engine
Extracts face embeddings using DeepFace (Facenet512) and performs 1:1 Verification and 1:N Identification.
"""

import sys
import os
import time
import base64
import json
import numpy as np
import cv2

# Ensure UTF-8 output encoding for Windows terminals
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Suppress TensorFlow verbose logging
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

from deepface import DeepFace
import database

# Default algorithm settings
DEFAULT_MODEL = "Facenet512"
DEFAULT_DETECTOR = "opencv"
DEFAULT_THRESHOLD = 0.38  # Cosine distance threshold for Facenet512


def base64_to_cv2_image(b64_string: str) -> np.ndarray:
    """Convert base64 data URL or raw string to OpenCV BGR image."""
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    
    img_bytes = base64.b64decode(b64_string)
    np_arr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image from base64 data.")
    return img


def cv2_image_to_base64(img: np.ndarray, format: str = "jpeg") -> str:
    """Convert OpenCV BGR image to base64 data URL."""
    ext = ".jpg" if format in ["jpeg", "jpg"] else ".png"
    _, buffer = cv2.imencode(ext, img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    b64_str = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/{format};base64,{b64_str}"


def compute_cosine_distance(embedding1: list, embedding2: list) -> float:
    """Compute cosine distance between two embedding vectors: 1 - cosine_similarity."""
    a = np.array(embedding1, dtype=np.float32)
    b = np.array(embedding2, dtype=np.float32)
    
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    
    if norm_a == 0 or norm_b == 0:
        return 1.0
    
    cosine_sim = np.dot(a, b) / (norm_a * norm_b)
    # Clip to valid cosine range [-1.0, 1.0]
    cosine_sim = float(np.clip(cosine_sim, -1.0, 1.0))
    cosine_dist = 1.0 - cosine_sim
    return float(max(0.0, cosine_dist))


def distance_to_confidence_score(distance: float, threshold: float) -> float:
    """
    Convert cosine distance to an intuitive 0-100% confidence/similarity score.
    When distance is 0 -> 100% match.
    When distance equals threshold -> 75% match.
    When distance > threshold -> decreases rapidly towards 0%.
    """
    if distance <= threshold:
        # Range [0, threshold] maps to [100%, 75%]
        ratio = distance / threshold
        score = 100.0 - (ratio * 25.0)
    else:
        # Range (threshold, 1.0] maps to (75%, 0%]
        rem_range = max(0.001, 1.0 - threshold)
        over = distance - threshold
        score = max(0.0, 75.0 - ((over / rem_range) * 75.0))
    
    return round(float(score), 2)


def extract_face_embedding(img_input, model_name: str = DEFAULT_MODEL, detector_backend: str = DEFAULT_DETECTOR) -> tuple:
    """
    Detect face and extract high-dimensional embedding.
    Accepts base64 string, file path, or cv2 numpy array.
    Returns: (embedding_list, facial_area_dict, face_crop_base64)
    """
    if isinstance(img_input, str):
        if img_input.startswith("data:") or len(img_input) > 200:
            img = base64_to_cv2_image(img_input)
        else:
            img = cv2.imread(img_input)
    else:
        img = img_input

    if img is None:
        raise ValueError("Invalid image input.")

    # Try extracting with detector
    try:
        results = DeepFace.represent(
            img_path=img,
            model_name=model_name,
            detector_backend=detector_backend,
            enforce_detection=True
        )
    except Exception as e:
        # Fallback with opencv or without enforce_detection if strict detection failed
        try:
            results = DeepFace.represent(
                img_path=img,
                model_name=model_name,
                detector_backend="opencv",
                enforce_detection=False
            )
        except Exception as inner_e:
            raise ValueError(f"No face detected in the image: {str(e)}")

    if not results or len(results) == 0:
        raise ValueError("No face detected in the image.")

    # Get primary face (first detected)
    primary = results[0]
    embedding = primary["embedding"]
    facial_area = primary.get("facial_area", {})

    # Create a nice crop of the detected face for UI preview
    face_crop_base64 = ""
    if facial_area and "x" in facial_area and "w" in facial_area and facial_area["w"] > 0:
        x, y, w, h = facial_area["x"], facial_area["y"], facial_area["w"], facial_area["h"]
        # Add slight margin
        pad = int(0.15 * max(w, h))
        h_img, w_img = img.shape[:2]
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(w_img, x + w + pad)
        y2 = min(h_img, y + h + pad)
        crop = img[y1:y2, x1:x2]
        if crop.size > 0:
            face_crop_base64 = cv2_image_to_base64(crop, "jpeg")

    return embedding, facial_area, face_crop_base64


def verify_live_face(live_img_input, target_user_id: str = None, threshold: float = None) -> dict:
    """
    Verify live captured face against stored embeddings.
    If target_user_id is provided: performs 1:1 Verification against that user.
    If target_user_id is None: performs 1:N Identification against ALL users in database.
    """
    start_time = time.time()
    
    if threshold is None:
        try:
            threshold = float(database.get_setting("similarity_threshold", str(DEFAULT_THRESHOLD)))
        except Exception:
            threshold = DEFAULT_THRESHOLD

    model_name = database.get_setting("model_name", DEFAULT_MODEL)
    detector_backend = database.get_setting("detector_backend", DEFAULT_DETECTOR)

    # Extract embedding from live image
    live_embedding, facial_area, face_crop = extract_face_embedding(
        live_img_input, model_name=model_name, detector_backend=detector_backend
    )

    all_users = database.get_all_users()
    if not all_users:
        elapsed = round((time.time() - start_time) * 1000, 1)
        return {
            "success": False,
            "error": "No registered users in the database. Please register a face first.",
            "matched": False,
            "execution_time_ms": elapsed
        }

    # Case 1: 1:1 Verification (Specific Target User)
    if target_user_id:
        target_user = database.get_user_by_id(target_user_id)
        if not target_user:
            elapsed = round((time.time() - start_time) * 1000, 1)
            return {
                "success": False,
                "error": f"User ID '{target_user_id}' not found in database.",
                "matched": False,
                "execution_time_ms": elapsed
            }

        distance = compute_cosine_distance(live_embedding, target_user["embedding"])
        score = distance_to_confidence_score(distance, threshold)
        matched = (distance <= threshold)

        elapsed = round((time.time() - start_time) * 1000, 1)

        # Log audit trail
        database.log_verification(
            user_id=target_user["user_id"],
            user_name=target_user["name"],
            mode="1:1_VERIFY",
            matched=matched,
            similarity_score=score,
            cosine_distance=distance,
            threshold=threshold,
            snapshot_base64=face_crop
        )

        return {
            "success": True,
            "mode": "1:1_VERIFY",
            "matched": matched,
            "user": {
                "user_id": target_user["user_id"],
                "name": target_user["name"],
                "department": target_user["department"],
                "email": target_user["email"],
                "photo_base64": target_user["photo_base64"]
            },
            "similarity_score": score,
            "cosine_distance": round(distance, 4),
            "threshold": threshold,
            "facial_area": facial_area,
            "live_crop": face_crop,
            "execution_time_ms": elapsed
        }

    # Case 2: 1:N Identification (Search across entire database)
    best_match_user = None
    min_distance = 999.0
    scores_list = []

    for user in all_users:
        dist = compute_cosine_distance(live_embedding, user["embedding"])
        user_score = distance_to_confidence_score(dist, threshold)
        scores_list.append({
            "user_id": user["user_id"],
            "name": user["name"],
            "department": user["department"],
            "distance": round(dist, 4),
            "score": user_score,
            "photo_base64": user["photo_base64"]
        })
        if dist < min_distance:
            min_distance = dist
            best_match_user = user

    # Sort matches by score descending
    scores_list.sort(key=lambda x: x["distance"])

    matched = (min_distance <= threshold and best_match_user is not None)
    best_score = distance_to_confidence_score(min_distance, threshold) if best_match_user else 0.0

    elapsed = round((time.time() - start_time) * 1000, 1)

    # Log audit trail
    database.log_verification(
        user_id=best_match_user["user_id"] if matched else "UNKNOWN",
        user_name=best_match_user["name"] if matched else "Unknown Face",
        mode="1:N_IDENTIFY",
        matched=matched,
        similarity_score=best_score,
        cosine_distance=min_distance,
        threshold=threshold,
        snapshot_base64=face_crop
    )

    result_user = None
    if matched and best_match_user:
        result_user = {
            "user_id": best_match_user["user_id"],
            "name": best_match_user["name"],
            "department": best_match_user["department"],
            "email": best_match_user["email"],
            "photo_base64": best_match_user["photo_base64"]
        }

    return {
        "success": True,
        "mode": "1:N_IDENTIFY",
        "matched": matched,
        "user": result_user,
        "best_candidate": scores_list[0] if scores_list else None,
        "candidates": scores_list[:5],  # Top 5 matches
        "similarity_score": best_score,
        "cosine_distance": round(min_distance, 4) if min_distance != 999.0 else 1.0,
        "threshold": threshold,
        "facial_area": facial_area,
        "live_crop": face_crop,
        "execution_time_ms": elapsed
    }


def register_new_face(user_id: str, name: str, img_input, department: str = "General", email: str = "") -> dict:
    """
    Extract embedding from image and store user in SQLite database.
    """
    start_time = time.time()
    model_name = database.get_setting("model_name", DEFAULT_MODEL)
    detector_backend = database.get_setting("detector_backend", DEFAULT_DETECTOR)

    # Extract embedding & preview crop
    embedding, facial_area, face_crop = extract_face_embedding(
        img_input, model_name=model_name, detector_backend=detector_backend
    )

    # Save to SQLite
    database.save_user(
        user_id=user_id,
        name=name,
        embedding=embedding,
        department=department,
        email=email,
        photo_base64=face_crop or (img_input if isinstance(img_input, str) and img_input.startswith("data:") else "")
    )

    elapsed = round((time.time() - start_time) * 1000, 1)

    return {
        "success": True,
        "message": f"Face for '{name}' (ID: {user_id}) successfully enrolled in Database Vault!",
        "embedding_length": len(embedding),
        "face_crop": face_crop,
        "execution_time_ms": elapsed
    }
