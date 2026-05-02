"""
deploy_to_gcs.py
────────────────
Zips the Nexus app (excluding .venv, .git, __pycache__),
uploads the archive to a GCS bucket, then prints the
Cloud Run deploy command ready to copy-paste.

Usage:
    python deploy_to_gcs.py --bucket YOUR_BUCKET_NAME --project YOUR_GCP_PROJECT_ID

Requirements:
    pip install google-cloud-storage
"""

import argparse
import os
import zipfile
from datetime import datetime
from pathlib import Path

# ── Try to import GCS client ────────────────────────────────────────────────
try:
    from google.cloud import storage
except ImportError:
    storage = None

# ── Directories / files to exclude from the zip ─────────────────────────────
EXCLUDE_DIRS  = {".venv", ".git", "__pycache__", ".gemini"}
EXCLUDE_FILES = {".DS_Store"}


def build_zip(source_dir: Path, zip_path: Path) -> None:
    """Recursively zip source_dir into zip_path, honouring exclusion lists."""
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(source_dir):
            # Prune excluded directories in-place so os.walk skips them
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

            for file in files:
                if file in EXCLUDE_FILES:
                    continue
                abs_path = Path(root) / file
                arc_name = abs_path.relative_to(source_dir)
                zf.write(abs_path, arc_name)
                print(f"  added: {arc_name}")

    size_kb = zip_path.stat().st_size / 1024
    print(f"\nArchive created: {zip_path}  ({size_kb:.1f} KB)")


def upload_to_gcs(bucket_name: str, zip_path: Path, blob_name: str) -> str:
    """Upload zip_path to GCS and return the gs:// URI."""
    if storage is None:
        raise ImportError(
            "google-cloud-storage is not installed.\n"
            "Run:  pip install google-cloud-storage"
        )

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob   = bucket.blob(blob_name)

    print(f"\nUploading to gs://{bucket_name}/{blob_name} ...")
    blob.upload_from_filename(str(zip_path))
    print(f"Upload complete:  gs://{bucket_name}/{blob_name}")

    return f"gs://{bucket_name}/{blob_name}"


def print_deploy_commands(project: str, bucket: str, blob: str) -> None:
    """Print the gcloud commands the user needs to run."""
    service_name = "nexus-app"
    region       = "us-central1"
    image        = f"gcr.io/{project}/{service_name}"

    print("\n" + "=" * 60)
    print("  CLOUD RUN DEPLOYMENT COMMANDS")
    print("=" * 60)
    print("\nStep 1 – Authenticate with GCP (if not already):")
    print("   gcloud auth login")
    print(f"   gcloud config set project {project}")

    print("\nStep 2 – Build & push the Docker image using Cloud Build:")
    print(f"   gcloud builds submit --tag {image}")

    print("\nStep 3 – Deploy to Cloud Run:")
    print(
        f"   gcloud run deploy {service_name} \\\n"
        f"     --image {image} \\\n"
        f"     --platform managed \\\n"
        f"     --region {region} \\\n"
        f"     --allow-unauthenticated \\\n"
        f"     --port 8080"
    )

    print("\nAlternatively, deploy directly from source (no Docker needed locally):")
    print(
        f"   gcloud run deploy {service_name} \\\n"
        f"     --source . \\\n"
        f"     --platform managed \\\n"
        f"     --region {region} \\\n"
        f"     --allow-unauthenticated \\\n"
        f"     --port 8080"
    )
    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Zip Nexus app and upload to GCS")
    parser.add_argument("--bucket",  required=True,  help="GCS bucket name (without gs://)")
    parser.add_argument("--project", required=True,  help="Google Cloud project ID")
    parser.add_argument("--no-upload", action="store_true",
                        help="Only build the zip, skip GCS upload")
    args = parser.parse_args()

    source_dir = Path(__file__).parent.resolve()
    timestamp  = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_name   = f"nexus-app_{timestamp}.zip"
    zip_path   = source_dir / zip_name
    blob_name  = f"nexus-app/{zip_name}"

    print(f"Building archive from: {source_dir}")
    build_zip(source_dir, zip_path)

    if not args.no_upload:
        gcs_uri = upload_to_gcs(args.bucket, zip_path, blob_name)
    else:
        print("\n⏭  Skipping GCS upload (--no-upload flag set)")

    print_deploy_commands(args.project, args.bucket, blob_name)


if __name__ == "__main__":
    main()
