import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
FONTS_DIR = BACKEND_DIR / "fonts"
DIST_DIR = BASE_DIR / "dist"
ASSETS_IMAGES_DIR = BASE_DIR / "src" / "assets" / "images"

STORAGE_ROOT = Path(os.getenv("STORAGE_DIR", "/tmp/jewelry_promo_studio"))
UPLOAD_DIR = STORAGE_ROOT / "uploads"
OUTPUT_DIR = STORAGE_ROOT / "outputs"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ASPECT_RATIO_DIMENSIONS: dict[str, tuple[int, int]] = {
    "9:16": (1080, 1920),
    "16:9": (1920, 1080),
    "1:1": (1080, 1080),
}

FONT_PRESET_FILES: dict[str, list[str]] = {
    "serif": [
        str(FONTS_DIR / "PlayfairDisplay.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    ],
    "sans": [
        str(FONTS_DIR / "PlusJakartaSans.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ],
    "condensed": [
        str(FONTS_DIR / "BarlowCondensed.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ],
}

MAX_ITEMS = 10


def get_gcs_bucket_name() -> str:
    return os.getenv("GCS_BUCKET", "").strip()


def is_gemini_configured() -> bool:
    if os.getenv("GEMINI_API_KEY", "").strip():
        return True
    if os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower() in ("1", "true", "yes"):
        return bool(os.getenv("GOOGLE_CLOUD_PROJECT", "").strip())
    return False
