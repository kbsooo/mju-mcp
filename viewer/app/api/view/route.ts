import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
  // 인증 토큰 검증 (MJU_VIEWER_SECRET 환경변수)
  const secret = process.env.MJU_VIEWER_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = randomUUID();
  const blob = await put(`views/${id}.json`, JSON.stringify(body), {
    access: "public",
    contentType: "application/json",
    // 24시간 후 자동 만료 (Vercel Blob은 TTL 미지원 — 클라이언트에서 expiresAt 체크)
    addRandomSuffix: false,
  });

  const viewerUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/view/${id}`;

  return NextResponse.json({ id, url: viewerUrl, blobUrl: blob.url });
}
