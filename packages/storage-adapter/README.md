# Storage Adapter Package

Responsibility:
- Provide storage interface for put/get/delete and signed URL generation.
- Enforce key namespace conventions for image/artifact storage.
- Keep application code decoupled from underlying storage implementation.

Current implementation:
- `LocalDiskStorageAdapter` for local pre-prod execution.
- `S3StorageAdapter` with real `put/get/delete` operations and signed URL generation via AWS CLI.
