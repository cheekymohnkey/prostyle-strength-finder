import { NextRequest, NextResponse } from "next/server";
import { loadFrontendAuthConfig } from "@/lib/auth/config";

export const runtime = "nodejs";

type UploadBody = {
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
};

function parseUploadBody(value: unknown): UploadBody {
  if (!value || typeof value !== "object") {
    throw new Error("Request body must be an object");
  }
  return value as UploadBody;
}

function parseBase64Png(fileBase64: string): Buffer {
  const normalized = String(fileBase64 || "").trim();
  if (!normalized) {
    throw new Error("fileBase64 is required");
  }
  try {
    return Buffer.from(normalized, "base64");
  } catch (_error) {
    throw new Error("fileBase64 must be valid base64");
  }
}

async function loadPngMetadataExtractor(): Promise<(buffer: Buffer) => { metadataFields: Array<{ key: string; value: string }> }> {
  // @ts-expect-error local JS utility module has no .d.ts in frontend workspace
  const moduleNs: any = await import("../../../../../../scripts/ingestion/png-metadata.js");
  const candidate =
    moduleNs?.extractMidjourneyFieldsFromPngBuffer
    || moduleNs?.default?.extractMidjourneyFieldsFromPngBuffer;
  if (typeof candidate !== "function") {
    throw new Error("PNG metadata extractor is unavailable");
  }
  return candidate;
}

export async function POST(request: NextRequest) {
  loadFrontendAuthConfig();

  let parsed: UploadBody;
  try {
    parsed = parseUploadBody(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON body";
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message,
        },
      },
      { status: 400 }
    );
  }

  const fileName = String(parsed.fileName || "upload.png");
  const mimeType = String(parsed.mimeType || "image/png");

  let pngBytes: Buffer;
  try {
    pngBytes = parseBase64Png(String(parsed.fileBase64 || ""));
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: error instanceof Error ? error.message : "Invalid upload payload",
        },
      },
      { status: 400 }
    );
  }

  let extracted: { metadataFields: Array<{ key: string; value: string }> };
  try {
    // Reuse existing local parser to preserve extraction behavior parity.
    const extractMidjourneyFieldsFromPngBuffer = await loadPngMetadataExtractor();
    extracted = extractMidjourneyFieldsFromPngBuffer(pngBytes);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "PNG metadata extraction failed",
          details: {
            reason: error instanceof Error ? error.message : "Parser failure",
          },
        },
      },
      { status: 400 }
    );
  }

  const proxyUrl = new URL("/api/proxy/recommendation-extractions", request.url).toString();
  const proxyResponse = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(request.headers.get("cookie")
        ? { cookie: request.headers.get("cookie") as string }
        : {}),
      ...(request.headers.get("x-request-id")
        ? { "x-request-id": request.headers.get("x-request-id") as string }
        : {}),
    },
    body: JSON.stringify({
      metadataFields: extracted.metadataFields,
      fileName,
      mimeType,
    }),
    cache: "no-store",
  });

  const payload = await proxyResponse.json().catch(() => ({}));
  return NextResponse.json(payload, { status: proxyResponse.status });
}
