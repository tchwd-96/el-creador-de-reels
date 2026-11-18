import os
from google import genai
from google.genai import types
from google.genai.errors import APIError

MODEL_CHAIN = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"]


class GeminiServiceError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _build_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower() in ("1", "true", "yes")
    project = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1").strip()

    http_options = types.HttpOptions(
        timeout=10_000,
        retry_options=types.HttpRetryOptions(
            attempts=2,
            initial_delay=0.5,
            max_delay=1.5,
        ),
        headers={"User-Agent": "aistudio-build"},
    )

    if use_vertex and project:
        return genai.Client(
            vertexai=True,
            project=project,
            location=location,
            http_options=http_options,
        )

    if not api_key:
        raise GeminiServiceError(
            400,
            "La función «Mejorar con Gemini» requiere configurar GEMINI_API_KEY o Vertex AI en el servidor.",
        )

    return genai.Client(api_key=api_key, http_options=http_options)


def _thinking_config_for(model_name: str) -> types.ThinkingConfig | None:
    if model_name == "gemini-4-hydrogen":
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
    if model_name == "gemini-3.1-flash-lite":
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL)
    return None


def enhance_jewelry_script(piece_name: str, draft_script: str) -> str:
    client = _build_client()

    system_instruction = (
        "Eres un director creativo de alta joyería que escribe guiones editoriales de lujo en español. "
        "Tu tarea es transformar el nombre de una joya y un borrador opcional en un guion breve, elegante "
        "y evocador para un video promocional.\n"
        "Reglas estrictas:\n"
        "1. Responde ÚNICAMENTE en español natural, sofisticado y editorial.\n"
        "2. Divide el guion en exactamente 3 a 5 frases cortas, una por línea.\n"
        "3. Cada línea debe tener entre 3 y 8 palabras para leerse fácilmente en pantalla.\n"
        "4. No incluyas numeración, viñetas, comillas, emojis, hashtags ni explicaciones adicionales.\n"
        "5. Evoca luz, artesanía, materiales nobles y atemporalidad sin caer en clichés agresivos de venta."
    )

    clean_name = piece_name.strip() or "Pieza de alta joyería"
    clean_draft = draft_script.strip()

    if clean_draft:
        prompt = (
            f"Nombre de la pieza: {clean_name}\n"
            f"Borrador del usuario: {clean_draft}\n\n"
            "Mejora y pule este texto en 3 a 5 líneas editoriales listas para mostrar por bloques en el video."
        )
    else:
        prompt = (
            f"Nombre de la pieza: {clean_name}\n\n"
            "Crea un guion editorial de lujo de 3 a 5 líneas cortas para presentar esta joya en video."
        )

    custom_model = os.getenv("GEMINI_MODEL", "").strip()
    candidates = [custom_model] if custom_model else list(MODEL_CHAIN)

    last_error: GeminiServiceError | None = None

    for model_name in candidates:
        thinking_cfg = _thinking_config_for(model_name)
        config_kwargs: dict = {"system_instruction": system_instruction}
        if thinking_cfg is not None:
            config_kwargs["thinking_config"] = thinking_cfg

        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(**config_kwargs),
            )
            text = (response.text or "").strip()
            if not text:
                raise GeminiServiceError(502, "Gemini no devolvió texto para el guion.")

            lines = [
                line.strip().lstrip("•-*0123456789. )").strip()
                for line in text.splitlines()
                if line.strip()
            ]
            return "\n".join(lines[:6])
        except APIError as exc:
            code = exc.code or 500
            if code in (400, 401, 403):
                raise GeminiServiceError(
                    code,
                    "La clave de Gemini no es válida o no tiene permisos. Verifica GEMINI_API_KEY en el entorno.",
                ) from exc
            if code in (429, 500, 502, 503, 504):
                last_error = GeminiServiceError(
                    503 if code >= 500 else 429,
                    "El servicio de Gemini está experimentando alta demanda temporalmente. Inténtalo de nuevo en unos segundos.",
                )
                continue
            if code == 404:
                last_error = GeminiServiceError(404, f"Modelo no disponible: {model_name}")
                continue
            raise GeminiServiceError(502, f"Error al consultar Gemini: {exc.message}") from exc
        except GeminiServiceError:
            raise
        except Exception as exc:
            last_error = GeminiServiceError(503, f"Error de conexión con Gemini: {exc}")
            continue

    if last_error is not None:
        raise last_error
    raise GeminiServiceError(503, "No se pudo obtener respuesta de Gemini en este momento.")
