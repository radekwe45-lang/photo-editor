import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/edit
 * multipart/form-data: image (required), mask (optional), prompt (required)
 *
 * Mock mode (default): returns the uploaded image with X-Aperture-Mode: mock.
 *   The client applies a visible cinematic filter + "DEMO · MOCK API" watermark.
 * Live mode: forwards to IMAGE_API_BASE_URL + edit path (OpenAI-compatible by default).
 *   Also accepts SD WebUI-style JSON { images: ["base64..."] }.
 */

function isMock(): boolean {
  const flag = process.env.MOCK_IMAGE_API;
  if (flag === "false" || flag === "0") return false;
  if (!process.env.IMAGE_API_BASE_URL) return true;
  // Default true when unset
  return flag !== "false";
}

async function mockEdit(image: File, prompt: string): Promise<Response> {
  const buf = Buffer.from(await image.arrayBuffer());
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": image.type || "image/png",
      "X-Aperture-Mode": "mock",
      "X-Aperture-Prompt": encodeURIComponent(prompt.slice(0, 200)),
      "Cache-Control": "no-store",
    },
  });
}

async function liveEdit(
  image: File,
  mask: File | null,
  prompt: string
): Promise<Response> {
  const base = process.env.IMAGE_API_BASE_URL!.replace(/\/$/, "");
  const path = process.env.IMAGE_API_EDIT_PATH || "/images/edits";
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const form = new FormData();
  form.append("image", image, image.name || "image.png");
  if (mask) form.append("mask", mask, mask.name || "mask.png");
  form.append("prompt", prompt);
  form.append("model", process.env.IMAGE_API_MODEL || "dall-e-2");
  form.append("n", "1");
  form.append("size", "1024x1024");
  form.append("response_format", "b64_json");

  const headers: Record<string, string> = {};
  if (process.env.IMAGE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.IMAGE_API_KEY}`;
  }

  const upstream = await fetch(url, {
    method: "POST",
    headers,
    body: form,
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Upstream image API error",
        status: upstream.status,
        detail: text.slice(0, 2000),
      },
      { status: 502 }
    );
  }

  const contentType = upstream.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await upstream.json();
    const item = json?.data?.[0];
    if (item?.b64_json) {
      const bytes = Buffer.from(item.b64_json, "base64");
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-Aperture-Mode": "live",
        },
      });
    }
    if (item?.url) {
      const imgRes = await fetch(item.url);
      const bytes = Buffer.from(await imgRes.arrayBuffer());
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": imgRes.headers.get("content-type") || "image/png",
          "X-Aperture-Mode": "live",
        },
      });
    }
    if (json?.images?.[0]) {
      const raw = String(json.images[0]).replace(/^data:image\/\w+;base64,/, "");
      const bytes = Buffer.from(raw, "base64");
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-Aperture-Mode": "live",
        },
      });
    }
    return NextResponse.json(
      { error: "Unrecognized upstream JSON shape", keys: Object.keys(json || {}) },
      { status: 502 }
    );
  }

  const bytes = Buffer.from(await upstream.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType || "image/png",
      "X-Aperture-Mode": "live",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const image = form.get("image");
    const maskField = form.get("mask");
    const promptField = form.get("prompt");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "image file required" }, { status: 400 });
    }
    const prompt = typeof promptField === "string" ? promptField.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }
    const mask = maskField instanceof File ? maskField : null;

    if (isMock()) {
      return mockEdit(image, prompt);
    }
    if (!process.env.IMAGE_API_BASE_URL) {
      return NextResponse.json(
        { error: "IMAGE_API_BASE_URL not configured" },
        { status: 500 }
      );
    }
    return liveEdit(image, mask, prompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
