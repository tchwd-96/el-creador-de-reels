import json
import math
import re
import subprocess
import zipfile
from pathlib import Path
from typing import Callable, Optional
from PIL import Image, ImageDraw, ImageFont

from backend.config import ASPECT_RATIO_DIMENSIONS, FONT_PRESET_FILES


def hex_to_rgba(hex_color: str, alpha_pct: float = 100.0) -> tuple[int, int, int, int]:
    cleaned = (hex_color or "#FFFFFF").strip().lstrip("#")
    if len(cleaned) == 3:
        cleaned = "".join(c * 2 for c in cleaned)
    if len(cleaned) != 6:
        cleaned = "FFFFFF"
    try:
        r = int(cleaned[0:2], 16)
        g = int(cleaned[2:4], 16)
        b = int(cleaned[4:6], 16)
    except ValueError:
        r, g, b = 255, 255, 255
    alpha = max(0, min(255, round((alpha_pct / 100.0) * 255)))
    return (r, g, b, alpha)


def load_font(preset: str, size_px: int) -> ImageFont.FreeTypeFont:
    candidates = FONT_PRESET_FILES.get(preset, FONT_PRESET_FILES["serif"])
    for font_path in candidates:
        p = Path(font_path)
        if p.exists():
            font = ImageFont.truetype(str(p), size=size_px)
            # Apply refined editorial weight on variable fonts when supported
            try:
                if preset == "serif":
                    font.set_variation_by_axes([600])
                elif preset == "sans":
                    font.set_variation_by_axes([500])
            except Exception:
                pass
            return font
    return ImageFont.load_default()


def probe_media(file_path: Path) -> dict:
    ext = file_path.suffix.lower()
    image_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    audio_exts = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}

    if ext in image_exts:
        with Image.open(file_path) as img:
            w, h = img.size
        return {
            "media_type": "image",
            "duration_sec": None,
            "width": w,
            "height": h,
            "has_audio": False,
        }

    cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(file_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    info = {}
    if res.returncode == 0 and res.stdout.strip():
        try:
            info = json.loads(res.stdout)
        except json.JSONDecodeError:
            info = {}

    streams = info.get("streams", [])
    fmt = info.get("format", {})
    duration_raw = fmt.get("duration")
    duration_sec = float(duration_raw) if duration_raw else None

    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

    if ext in audio_exts or (audio_stream and not video_stream):
        return {
            "media_type": "audio",
            "duration_sec": round(duration_sec, 2) if duration_sec else 0.0,
            "width": None,
            "height": None,
            "has_audio": True,
        }

    return {
        "media_type": "video",
        "duration_sec": round(duration_sec, 2) if duration_sec else 6.0,
        "width": int(video_stream.get("width", 1080)) if video_stream else 1080,
        "height": int(video_stream.get("height", 1920)) if video_stream else 1920,
        "has_audio": audio_stream is not None,
    }


def split_script_into_blocks(raw_text: str, total_duration: float) -> list[dict]:
    cleaned = (raw_text or "").strip()
    if not cleaned:
        return []

    raw_lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    chunks: list[str] = []

    for line in raw_lines:
        if len(line) <= 68:
            chunks.append(line)
        else:
            # Split long lines by sentence punctuation first
            sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", line) if s.strip()]
            for sent in sentences:
                if len(sent) <= 68:
                    chunks.append(sent)
                else:
                    words = sent.split()
                    mid = math.ceil(len(words) / 2)
                    chunks.append(" ".join(words[:mid]))
                    if words[mid:]:
                        chunks.append(" ".join(words[mid:]))

    if not chunks:
        return []

    total_dur = max(2.0, float(total_duration))
    weights = [max(10, len(c)) for c in chunks]
    total_weight = sum(weights)

    blocks = []
    cursor = 0.0
    for idx, (chunk, weight) in enumerate(zip(chunks, weights)):
        if idx == len(chunks) - 1:
            end = total_dur
        else:
            seg = total_dur * (weight / total_weight)
            end = min(total_dur, cursor + max(1.2, seg))
        blocks.append(
            {
                "index": idx,
                "text": chunk,
                "start_sec": round(cursor, 2),
                "end_sec": round(end, 2),
            }
        )
        cursor = end

    # Guarantee monotonic end on final block
    blocks[-1]["end_sec"] = round(total_dur, 2)
    return blocks


def compute_effective_duration(
    duration_mode: str,
    manual_seconds: float,
    media_type: str,
    media_duration_sec: Optional[float],
    voiceover_duration_sec: Optional[float],
    script_text: str,
) -> float:
    if duration_mode == "manual":
        return max(2.0, min(120.0, float(manual_seconds or 8.0)))

    if voiceover_duration_sec and voiceover_duration_sec > 0:
        return round(max(3.0, voiceover_duration_sec + 0.6), 2)

    words = len((script_text or "").split())
    lines = len([l for l in (script_text or "").splitlines() if l.strip()])
    script_duration = max(5.0, min(22.0, words * 0.48 + max(1, lines) * 0.9))

    if media_type == "video" and media_duration_sec and media_duration_sec > 0:
        return round(max(media_duration_sec, min(22.0, script_duration if words > 0 else media_duration_sec)), 2)

    return round(script_duration if words > 0 else 6.0, 2)


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if (bbox[2] - bbox[0]) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def create_overlay_png(
    width: int,
    height: int,
    text: str,
    style: dict,
    logo_path: Optional[Path],
    logo_corner: str,
    out_png: Path,
) -> None:
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    ref_scale = min(width, height) / 1080.0
    base_font_size = int(style.get("fontSize", 46))
    font_size = max(18, int(round(base_font_size * ref_scale)))
    font_preset = style.get("fontPreset", "serif")
    font = load_font(font_preset, font_size)

    text_color = hex_to_rgba(style.get("textColor", "#F5F2EB"), 100.0)
    box_opacity = float(style.get("boxOpacity", 65))
    box_color = hex_to_rgba(style.get("boxColor", "#0A0A0C"), box_opacity)
    text_position = style.get("textPosition", "bottom")

    if text.strip():
        max_text_width = int(width * 0.78)
        wrapped_lines = _wrap_text(draw, text.strip(), font, max_text_width)

        line_metrics = []
        max_line_w = 0
        line_spacing = int(font_size * 0.34)
        for line in wrapped_lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            lw = bbox[2] - bbox[0]
            lh = bbox[3] - bbox[1]
            max_line_w = max(max_line_w, lw)
            line_metrics.append((line, lw, lh, bbox[1]))

        total_text_h = sum(m[2] for m in line_metrics) + line_spacing * max(0, len(line_metrics) - 1)
        pad_x = int(font_size * 0.85)
        pad_y = int(font_size * 0.55)
        box_w = min(int(width * 0.9), max_line_w + pad_x * 2)
        box_h = total_text_h + pad_y * 2

        box_x = (width - box_w) // 2
        margin_v = int(height * 0.11)
        if text_position == "top":
            box_y = margin_v
        elif text_position == "center":
            box_y = (height - box_h) // 2
        else:
            box_y = height - margin_v - box_h

        if box_opacity > 0:
            radius = max(8, int(font_size * 0.28))
            draw.rounded_rectangle(
                [box_x, box_y, box_x + box_w, box_y + box_h],
                radius=radius,
                fill=box_color,
            )

        cursor_y = box_y + pad_y
        for line, lw, lh, y_offset in line_metrics:
            tx = (width - lw) // 2
            ty = cursor_y - y_offset
            # Subtle shadow when box opacity is low for WCAG readability
            if box_opacity < 30:
                draw.text((tx + 2, ty + 2), line, font=font, fill=(0, 0, 0, 175))
            draw.text((tx, ty), line, font=font, fill=text_color)
            cursor_y += lh + line_spacing

    if logo_path and logo_path.exists():
        with Image.open(logo_path) as logo_img:
            logo_rgba = logo_img.convert("RGBA")
            max_logo_size = int(min(width, height) * 0.15)
            logo_rgba.thumbnail((max_logo_size, max_logo_size), Image.Resampling.LANCZOS)
            lw, lh = logo_rgba.size
            margin = int(min(width, height) * 0.045)

            if logo_corner == "top-left":
                lx, ly = margin, margin
            elif logo_corner == "top-right":
                lx, ly = width - lw - margin, margin
            elif logo_corner == "bottom-left":
                lx, ly = margin, height - lh - margin
            else:
                lx, ly = width - lw - margin, height - lh - margin

            canvas.alpha_composite(logo_rgba, (lx, ly))

    canvas.save(out_png, format="PNG")


def render_single_video(
    work_dir: Path,
    media_path: Path,
    media_type: str,
    has_media_audio: bool,
    aspect_ratio: str,
    duration_sec: float,
    blocks: list[dict],
    style: dict,
    logo_path: Optional[Path],
    logo_corner: str,
    voiceover_path: Optional[Path],
    music_path: Optional[Path],
    music_volume_pct: float,
    output_mp4: Path,
    on_progress: Callable[[int], None],
) -> None:
    width, height = ASPECT_RATIO_DIMENSIONS.get(aspect_ratio, (1080, 1920))
    work_dir.mkdir(parents=True, exist_ok=True)
    on_progress(5)

    # Generate transparent RGBA overlay PNG plates with Pillow
    overlay_specs: list[tuple[Path, float, float]] = []
    if blocks:
        for idx, blk in enumerate(blocks):
            png_path = work_dir / f"overlay_{idx}.png"
            create_overlay_png(
                width=width,
                height=height,
                text=blk["text"],
                style=style,
                logo_path=logo_path,
                logo_corner=logo_corner,
                out_png=png_path,
            )
            overlay_specs.append((png_path, float(blk["start_sec"]), float(blk["end_sec"])))
    elif logo_path and logo_path.exists():
        png_path = work_dir / "overlay_logo.png"
        create_overlay_png(
            width=width,
            height=height,
            text="",
            style=style,
            logo_path=logo_path,
            logo_corner=logo_corner,
            out_png=png_path,
        )
        overlay_specs.append((png_path, 0.0, float(duration_sec)))

    on_progress(15)

    cmd: list[str] = ["ffmpeg", "-y"]

    # Input 0: Main jewelry photo or clip (zero motion/zoom)
    if media_type == "image":
        cmd.extend(["-loop", "1", "-framerate", "30", "-t", f"{duration_sec:.2f}", "-i", str(media_path)])
    else:
        cmd.extend(["-stream_loop", "-1", "-t", f"{duration_sec:.2f}", "-i", str(media_path)])

    input_idx = 1
    overlay_indices: list[tuple[int, float, float]] = []
    for png_path, start_s, end_s in overlay_specs:
        cmd.extend(["-loop", "1", "-t", f"{duration_sec:.2f}", "-i", str(png_path)])
        overlay_indices.append((input_idx, start_s, end_s))
        input_idx += 1

    voice_idx: Optional[int] = None
    if voiceover_path and voiceover_path.exists():
        cmd.extend(["-i", str(voiceover_path)])
        voice_idx = input_idx
        input_idx += 1

    music_idx: Optional[int] = None
    if music_path and music_path.exists():
        cmd.extend(["-stream_loop", "-1", "-i", str(music_path)])
        music_idx = input_idx
        input_idx += 1

    silent_idx: Optional[int] = None
    if voice_idx is None and music_idx is None and not (media_type == "video" and has_media_audio):
        cmd.extend(["-f", "lavfi", "-t", f"{duration_sec:.2f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"])
        silent_idx = input_idx
        input_idx += 1

    # Video filtergraph: exact centered cover crop without extra motion/zoom
    vf_parts = [
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1,fps=30,format=rgba[base]"
    ]
    current_label = "base"
    for step, (ov_idx, s_sec, e_sec) in enumerate(overlay_indices):
        next_label = f"v{step}"
        vf_parts.append(
            f"[{current_label}][{ov_idx}:v]overlay=0:0:enable='between(t,{s_sec:.2f},{e_sec:.2f})'[{next_label}]"
        )
        current_label = next_label
    vf_parts.append(f"[{current_label}]format=yuv420p[vout]")

    # Audio filtergraph
    music_vol = max(0.0, min(1.0, float(music_volume_pct) / 100.0))
    af_parts: list[str] = []
    audio_map = ""

    if voice_idx is not None and music_idx is not None:
        af_parts.append(
            f"[{voice_idx}:a]aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur={duration_sec:.2f}[vo]"
        )
        af_parts.append(
            f"[{music_idx}:a]aresample=44100,aformat=channel_layouts=stereo,volume={music_vol:.3f}[bg]"
        )
        af_parts.append(
            f"[vo][bg]amix=inputs=2:duration=first:normalize=0,atrim=0:{duration_sec:.2f}[aout]"
        )
        audio_map = "[aout]"
    elif voice_idx is not None:
        af_parts.append(
            f"[{voice_idx}:a]aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur={duration_sec:.2f},atrim=0:{duration_sec:.2f}[aout]"
        )
        audio_map = "[aout]"
    elif music_idx is not None:
        if media_type == "video" and has_media_audio:
            af_parts.append(
                f"[0:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.45,apad=whole_dur={duration_sec:.2f}[orig]"
            )
            af_parts.append(
                f"[{music_idx}:a]aresample=44100,aformat=channel_layouts=stereo,volume={music_vol:.3f}[bg]"
            )
            af_parts.append(
                f"[orig][bg]amix=inputs=2:duration=first:normalize=0,atrim=0:{duration_sec:.2f}[aout]"
            )
        else:
            af_parts.append(
                f"[{music_idx}:a]aresample=44100,aformat=channel_layouts=stereo,volume={music_vol:.3f},atrim=0:{duration_sec:.2f}[aout]"
            )
        audio_map = "[aout]"
    elif media_type == "video" and has_media_audio:
        af_parts.append(
            f"[0:a]aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur={duration_sec:.2f},atrim=0:{duration_sec:.2f}[aout]"
        )
        audio_map = "[aout]"
    else:
        audio_map = f"{silent_idx}:a"

    filter_complex = ";".join(vf_parts + af_parts)

    cmd.extend([
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-map", audio_map,
        "-t", f"{duration_sec:.2f}",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        "-progress", "pipe:1",
        "-nostats",
        str(output_mp4),
    ])

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    total_us = max(1.0, duration_sec * 1_000_000.0)
    if process.stdout is not None:
        for line in process.stdout:
            line = line.strip()
            if line.startswith("out_time_us="):
                try:
                    out_us = float(line.split("=", 1)[1])
                    pct = 15 + int(min(80, max(0, (out_us / total_us) * 80)))
                    on_progress(pct)
                except ValueError:
                    pass

    stderr_output = process.stderr.read() if process.stderr else ""
    rc = process.wait()
    if rc != 0:
        raise RuntimeError(f"Error de FFmpeg al renderizar el video: {stderr_output[-600:]}")

    on_progress(96)


def create_batch_zip(mp4_files: list[Path], zip_path: Path) -> Path:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in mp4_files:
            if f.exists():
                zf.write(f, arcname=f.name)
    return zip_path
