import re
import shutil
import threading
import uuid
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.config import (
    ASPECT_RATIO_DIMENSIONS,
    ASSETS_IMAGES_DIR,
    DIST_DIR,
    MAX_ITEMS,
    OUTPUT_DIR,
    UPLOAD_DIR,
    get_gcs_bucket_name,
    is_gemini_configured,
)
from backend.gcs_service import upload_file_to_gcs
from backend.gemini_service import GeminiServiceError, enhance_jewelry_script
from backend.renderer import (
    compute_effective_duration,
    create_batch_zip,
    probe_media,
    render_single_video,
    split_script_into_blocks,
)

app = FastAPI(title="Jewelry Promo Studio API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_REGISTRY: dict[str, dict] = {}
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()

ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
ALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".webm", ".m4v", ".mkv"}
ALLOWED_AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}


def _safe_filename(name: str, fallback: str = "archivo") -> str:
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", name or fallback).strip("_.")
    return stem or fallback


def _slugify(text: str, fallback: str = "joya") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", (text or "").strip().lower()).strip("_")
    return cleaned[:48] or fallback


def _find_uploaded_file(file_id: Optional[str]) -> Optional[dict]:
    if not file_id:
        return None
    if file_id in UPLOAD_REGISTRY:
        info = UPLOAD_REGISTRY[file_id]
        if Path(info["path"]).exists():
            return info
    # Disk fallback by prefix
    matches = list(UPLOAD_DIR.glob(f"{file_id}.*"))
    if matches:
        p = matches[0]
        meta = probe_media(p)
        info = {
            "fileId": file_id,
            "path": str(p),
            "filename": p.name,
            "mediaType": meta["media_type"],
            "durationSec": meta["duration_sec"],
            "width": meta["width"],
            "height": meta["height"],
            "hasAudio": meta["has_audio"],
        }
        UPLOAD_REGISTRY[file_id] = info
        return info
    return None


class StyleConfig(BaseModel):
    fontPreset: Literal["serif", "sans", "condensed"] = "serif"
    fontSize: int = Field(default=46, ge=18, le=120)
    textColor: str = "#F5F2EB"
    boxColor: str = "#0A0A0C"
    boxOpacity: float = Field(default=68, ge=0, le=100)
    textPosition: Literal["top", "center", "bottom"] = "bottom"


class LogoConfig(BaseModel):
    fileId: Optional[str] = None
    corner: Literal["top-left", "top-right", "bottom-left", "bottom-right"] = "top-right"


class BackgroundMusicConfig(BaseModel):
    fileId: Optional[str] = None
    volume: float = Field(default=28, ge=0, le=100)


class RenderItemPayload(BaseModel):
    id: str
    name: str
    mediaFileId: str
    scriptText: str = ""
    voiceoverFileId: Optional[str] = None
    durationMode: Literal["auto", "manual"] = "auto"
    manualSeconds: float = Field(default=8.0, ge=2.0, le=120.0)


class RenderBatchRequest(BaseModel):
    aspectRatio: Literal["9:16", "16:9", "1:1"] = "9:16"
    style: StyleConfig
    logo: LogoConfig
    backgroundMusic: BackgroundMusicConfig
    items: list[RenderItemPayload]


class GeminiEnhanceRequest(BaseModel):
    pieceName: str = ""
    draftScript: str = ""


class SampleImportRequest(BaseModel):
    sampleFilename: str


@app.get("/api/health")
def health_check() -> dict:
    ffmpeg_ok = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
    gcs_bucket = get_gcs_bucket_name()
    return {
        "ok": True,
        "ffmpegReady": ffmpeg_ok,
        "geminiConfigured": is_gemini_configured(),
        "gcsEnabled": bool(gcs_bucket),
        "gcsBucket": gcs_bucket or None,
    }


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    kind: Literal["media", "voiceover", "music", "logo"] = Form("media"),
) -> dict:
    orig_name = file.filename or "archivo"
    ext = Path(orig_name).suffix.lower()

    if kind == "media":
        if ext not in ALLOWED_IMAGE_EXTS and ext not in ALLOWED_VIDEO_EXTS:
            raise HTTPException(
                status_code=400,
                detail="Formato no compatible. Sube fotos (.jpg, .png, .webp) o clips de video (.mp4, .mov, .webm).",
            )
    elif kind in ("voiceover", "music"):
        if ext not in ALLOWED_AUDIO_EXTS:
            raise HTTPException(
                status_code=400,
                detail="Formato de audio no compatible. Usa .mp3, .wav, .m4a, .aac u .ogg.",
            )
    elif kind == "logo":
        if ext not in ALLOWED_IMAGE_EXTS:
            raise HTTPException(
                status_code=400,
                detail="El logotipo debe ser una imagen (.png, .webp o .jpg).",
            )

    file_id = uuid.uuid4().hex[:16]
    dest_path = UPLOAD_DIR / f"{file_id}{ext}"

    with dest_path.open("wb") as out_f:
        while chunk := await file.read(1024 * 1024):
            out_f.write(chunk)

    try:
        meta = probe_media(dest_path)
    except Exception as exc:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"No se pudo procesar el archivo: {exc}")

    record = {
        "fileId": file_id,
        "path": str(dest_path),
        "filename": orig_name,
        "mediaType": meta["media_type"],
        "durationSec": meta["duration_sec"],
        "width": meta["width"],
        "height": meta["height"],
        "hasAudio": meta["has_audio"],
        "previewUrl": f"/api/files/{file_id}",
    }
    UPLOAD_REGISTRY[file_id] = record
    return record


@app.post("/api/import-sample")
def import_sample_asset(payload: SampleImportRequest) -> dict:
    safe_name = Path(payload.sampleFilename).name
    candidates = [
        ASSETS_IMAGES_DIR / safe_name,
        DIST_DIR / "src" / "assets" / "images" / safe_name,
    ]
    source_path = next((p for p in candidates if p.exists()), None)
    if source_path is None:
        raise HTTPException(status_code=404, detail="No se encontró la imagen de ejemplo solicitada.")

    file_id = uuid.uuid4().hex[:16]
    ext = source_path.suffix.lower() or ".jpg"
    dest_path = UPLOAD_DIR / f"{file_id}{ext}"
    shutil.copy2(source_path, dest_path)

    meta = probe_media(dest_path)
    record = {
        "fileId": file_id,
        "path": str(dest_path),
        "filename": safe_name,
        "mediaType": meta["media_type"],
        "durationSec": meta["duration_sec"],
        "width": meta["width"],
        "height": meta["height"],
        "hasAudio": meta["has_audio"],
        "previewUrl": f"/api/files/{file_id}",
    }
    UPLOAD_REGISTRY[file_id] = record
    return record


@app.get("/api/files/{file_id}")
def get_uploaded_file(file_id: str) -> FileResponse:
    info = _find_uploaded_file(file_id)
    if not info:
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")
    return FileResponse(info["path"], filename=info["filename"])


@app.post("/api/gemini/enhance")
def gemini_enhance_endpoint(payload: GeminiEnhanceRequest) -> dict:
    try:
        enhanced = enhance_jewelry_script(payload.pieceName, payload.draftScript)
        blocks = split_script_into_blocks(enhanced, 8.0)
        return {"enhancedScript": enhanced, "blocks": blocks}
    except GeminiServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error al consultar Gemini: {exc}")


def _update_item_state(job_id: str, item_id: str, **updates) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        item_state = job["items"].get(item_id)
        if item_state:
            item_state.update(updates)


def _run_batch_job(job_id: str, req: RenderBatchRequest) -> None:
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    gcs_enabled = bool(get_gcs_bucket_name())

    logo_info = _find_uploaded_file(req.logo.fileId)
    logo_path = Path(logo_info["path"]) if logo_info else None

    music_info = _find_uploaded_file(req.backgroundMusic.fileId)
    music_path = Path(music_info["path"]) if music_info else None

    completed_mp4s: list[Path] = []
    any_error = False

    with JOBS_LOCK:
        JOBS[job_id]["overallStatus"] = "rendering"

    for idx, item in enumerate(req.items):
        item_id = item.id
        _update_item_state(job_id, item_id, status="rendering", progress=2)
        try:
            media_info = _find_uploaded_file(item.mediaFileId)
            if not media_info:
                raise RuntimeError("No se encontró el archivo multimedia de la pieza.")

            media_path = Path(media_info["path"])
            media_type = media_info["mediaType"]
            has_media_audio = bool(media_info.get("hasAudio"))

            vo_info = _find_uploaded_file(item.voiceoverFileId)
            vo_path = Path(vo_info["path"]) if vo_info else None
            vo_duration = vo_info.get("durationSec") if vo_info else None

            duration_sec = compute_effective_duration(
                duration_mode=item.durationMode,
                manual_seconds=item.manualSeconds,
                media_type=media_type,
                media_duration_sec=media_info.get("durationSec"),
                voiceover_duration_sec=vo_duration,
                script_text=item.scriptText,
            )

            blocks = split_script_into_blocks(item.scriptText, duration_sec)
            safe_slug = _slugify(item.name, f"pieza_{idx + 1}")
            out_filename = f"{idx + 1:02d}_{safe_slug}.mp4"
            out_mp4 = job_dir / out_filename
            work_dir = job_dir / f"work_{idx}_{item_id}"

            render_single_video(
                work_dir=work_dir,
                media_path=media_path,
                media_type=media_type,
                has_media_audio=has_media_audio,
                aspect_ratio=req.aspectRatio,
                duration_sec=duration_sec,
                blocks=blocks,
                style=req.style.model_dump(),
                logo_path=logo_path,
                logo_corner=req.logo.corner,
                voiceover_path=vo_path,
                music_path=music_path,
                music_volume_pct=req.backgroundMusic.volume,
                output_mp4=out_mp4,
                on_progress=lambda pct, iid=item_id: _update_item_state(job_id, iid, progress=pct),
            )

            # Clean temp work dir after render
            shutil.rmtree(work_dir, ignore_errors=True)
            completed_mp4s.append(out_mp4)

            gcs_url = None
            if gcs_enabled:
                try:
                    gcs_url = upload_file_to_gcs(
                        out_mp4,
                        f"jewelry-promo-studio/{job_id}/{out_filename}",
                        "video/mp4",
                    )
                except Exception as gcs_exc:
                    gcs_url = f"Error GCS: {gcs_exc}"

            _update_item_state(
                job_id,
                item_id,
                status="completed",
                progress=100,
                durationSec=duration_sec,
                filename=out_filename,
                outputUrl=f"/api/outputs/{job_id}/{out_filename}",
                downloadUrl=f"/api/outputs/{job_id}/{out_filename}?download=1",
                gcsUrl=gcs_url,
            )
        except Exception as exc:
            any_error = True
            _update_item_state(
                job_id,
                item_id,
                status="error",
                progress=0,
                errorMessage=str(exc),
            )

    zip_url = None
    zip_gcs_url = None
    if completed_mp4s:
        zip_name = f"jewelry_promo_lote_{job_id[:8]}.zip"
        zip_path = job_dir / zip_name
        create_batch_zip(completed_mp4s, zip_path)
        zip_url = f"/api/outputs/{job_id}/{zip_name}?download=1"
        if gcs_enabled:
            try:
                zip_gcs_url = upload_file_to_gcs(
                    zip_path,
                    f"jewelry-promo-studio/{job_id}/{zip_name}",
                    "application/zip",
                )
            except Exception:
                zip_gcs_url = None

    with JOBS_LOCK:
        JOBS[job_id]["overallStatus"] = "completed_with_errors" if any_error and not completed_mp4s else "completed"
        JOBS[job_id]["zipUrl"] = zip_url
        JOBS[job_id]["zipGcsUrl"] = zip_gcs_url


@app.post("/api/render")
def start_render_batch(payload: RenderBatchRequest) -> dict:
    if not payload.items:
        raise HTTPException(status_code=400, detail="Agrega al menos una pieza de joyería antes de renderizar.")
    if len(payload.items) > MAX_ITEMS:
        raise HTTPException(status_code=400, detail=f"El máximo permitido por lote es de {MAX_ITEMS} piezas.")
    if payload.aspectRatio not in ASPECT_RATIO_DIMENSIONS:
        raise HTTPException(status_code=400, detail="Relación de aspecto no válida.")

    job_id = uuid.uuid4().hex[:12]
    initial_items = {
        item.id: {
            "id": item.id,
            "name": item.name,
            "status": "queued",
            "progress": 0,
            "filename": None,
            "outputUrl": None,
            "downloadUrl": None,
            "gcsUrl": None,
            "durationSec": None,
            "errorMessage": None,
        }
        for item in payload.items
    }

    with JOBS_LOCK:
        JOBS[job_id] = {
            "jobId": job_id,
            "overallStatus": "queued",
            "aspectRatio": payload.aspectRatio,
            "gcsEnabled": bool(get_gcs_bucket_name()),
            "zipUrl": None,
            "zipGcsUrl": None,
            "items": initial_items,
            "itemOrder": [item.id for item in payload.items],
        }

    worker = threading.Thread(target=_run_batch_job, args=(job_id, payload), daemon=True)
    worker.start()

    return {"jobId": job_id}


@app.get("/api/jobs/{job_id}")
def get_job_status(job_id: str) -> dict:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Trabajo de renderizado no encontrado.")
        ordered_items = [job["items"][iid] for iid in job["itemOrder"] if iid in job["items"]]
        return {
            "jobId": job["jobId"],
            "overallStatus": job["overallStatus"],
            "aspectRatio": job["aspectRatio"],
            "gcsEnabled": job["gcsEnabled"],
            "zipUrl": job["zipUrl"],
            "zipGcsUrl": job["zipGcsUrl"],
            "items": ordered_items,
        }


@app.get("/api/outputs/{job_id}/{filename}")
def get_rendered_output(
    job_id: str,
    filename: str,
    download: Optional[int] = Query(default=0),
) -> FileResponse:
    safe_name = Path(filename).name
    target = OUTPUT_DIR / job_id / safe_name
    if not target.exists():
        raise HTTPException(status_code=404, detail="Archivo de salida no encontrado.")
    media_type = "application/zip" if safe_name.endswith(".zip") else "video/mp4"
    if download:
        return FileResponse(target, media_type=media_type, filename=safe_name)
    return FileResponse(target, media_type=media_type)


# Static frontend serving for Cloud Run / standalone FastAPI deployment
if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="dist_assets")

    src_assets_dir = DIST_DIR / "src" / "assets"
    if src_assets_dir.exists():
        app.mount("/src/assets", StaticFiles(directory=str(src_assets_dir)), name="dist_src_assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Ruta API no encontrada.")
        index_file = DIST_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Aplicación compilada no encontrada.")
