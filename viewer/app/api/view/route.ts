import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.MJU_VIEWER_SECRET;
    if (secret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN is not set" },
        { status: 500 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // node:crypto 대신 Web Crypto API 사용 (모든 런타임 호환)
    const id = crypto.randomUUID();

    const blob = await put(`views/${id}.json`, JSON.stringify(body), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });

    const viewerUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/view/${id}`;

    return NextResponse.json({ id, url: viewerUrl, blobUrl: blob.url });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    );
  }
}
