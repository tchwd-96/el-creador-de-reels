from pathlib import Path
from typing import Optional
from google.cloud import storage

from backend.config import get_gcs_bucket_name


def upload_file_to_gcs(local_path: Path, destination_blob_name: str, content_type: str) -> Optional[str]:
    bucket_name = get_gcs_bucket_name()
    if not bucket_name:
        return None

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_filename(str(local_path), content_type=content_type)
    return f"https://storage.googleapis.com/{bucket_name}/{destination_blob_name}"
