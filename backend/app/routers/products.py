import uuid

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile

from app import config, db, vision
from app.schemas import ProductOut, ProductUpdate

router = APIRouter(prefix="/api/products", tags=["products"])

_COVER_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_COVER_MAX_BYTES = 8 * 1024 * 1024
_COVER_MAX_DIM = 1600

_VIDEO_EXTENSIONS = {"video/mp4": ".mp4", "video/webm": ".webm", "video/ogg": ".ogv"}
_VIDEO_MAX_BYTES = 200 * 1024 * 1024


@router.get("", response_model=list[ProductOut])
def list_products():
    stale = db.stale_product_ids()
    return [ProductOut(**dict(r), needs_reembed=r["id"] in stale) for r in db.list_products()]


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int):
    row = db.get_product(product_id)
    if not row:
        raise HTTPException(404, "Product not found")
    return ProductOut(**dict(row))


@router.patch("/{product_id}", response_model=ProductOut)
def patch_product(product_id: int, body: ProductUpdate):
    if not db.get_product(product_id):
        raise HTTPException(404, "Product not found")
    fields = body.model_dump(exclude_unset=True)
    if fields:
        db.update_product(product_id, **fields)
    # Metadata edits don't touch embeddings, so the match index is unaffected.
    return ProductOut(**dict(db.get_product(product_id)))


@router.post("/{product_id}/cover", response_model=ProductOut)
async def upload_cover_image(product_id: int, file: UploadFile = File(...)):
    """A polished photo for the kiosk display — deliberately separate from
    the raw webcam training frames, which are picked for AI recognition
    quality (varied angles, plain background) rather than looking good on
    screen."""
    if not db.get_product(product_id):
        raise HTTPException(404, "Product not found")
    if file.content_type not in _COVER_CONTENT_TYPES:
        raise HTTPException(400, "รองรับเฉพาะไฟล์ภาพ JPEG/PNG/WEBP")

    raw = await file.read()
    if len(raw) > _COVER_MAX_BYTES:
        raise HTTPException(400, "ไฟล์ใหญ่เกินไป (จำกัด 8MB)")

    img = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "ไฟล์ภาพไม่ถูกต้องหรือเปิดไม่ได้")

    h, w = img.shape[:2]
    if max(h, w) > _COVER_MAX_DIM:
        scale = _COVER_MAX_DIM / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    covers_dir = config.CAPTURES_DIR / "covers"
    covers_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.jpg"
    cv2.imwrite(str(covers_dir / filename), img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])

    db.set_cover_image(product_id, f"captures/covers/{filename}")
    return ProductOut(**dict(db.get_product(product_id)))


@router.post("/{product_id}/video", response_model=ProductOut)
async def upload_product_video(product_id: int, file: UploadFile = File(...)):
    """A short product video for the kiosk display — shown autoplaying in
    place of the cover photo whenever one's been uploaded (see kiosk.js)."""
    if not db.get_product(product_id):
        raise HTTPException(404, "Product not found")
    ext = _VIDEO_EXTENSIONS.get(file.content_type)
    if ext is None:
        raise HTTPException(400, "รองรับเฉพาะไฟล์วิดีโอ MP4/WEBM/OGG")

    raw = await file.read()
    if len(raw) > _VIDEO_MAX_BYTES:
        raise HTTPException(400, "ไฟล์ใหญ่เกินไป (จำกัด 200MB)")

    videos_dir = config.CAPTURES_DIR / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    (videos_dir / filename).write_bytes(raw)

    db.set_product_video(product_id, f"captures/videos/{filename}")
    return ProductOut(**dict(db.get_product(product_id)))


@router.delete("/{product_id}/video", response_model=ProductOut)
def remove_product_video(product_id: int):
    """Reverts the kiosk display back to the cover photo/thumbnail."""
    if not db.get_product(product_id):
        raise HTTPException(404, "Product not found")
    db.set_product_video(product_id, None)
    return ProductOut(**dict(db.get_product(product_id)))


@router.delete("/{product_id}")
def delete_product(product_id: int):
    row = db.get_product(product_id)
    if not row:
        raise HTTPException(404, "Product not found")
    db.delete_product(product_id)
    vision.refresh_match_index()
    return {"ok": True}
