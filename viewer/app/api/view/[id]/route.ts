import { head } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

// Vercel Blob의 public URL 패턴으로 직접 리다이렉트
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // id 형식 검증 (UUID)
  if (!/^[\w-]{36}$/.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const blobInfo = await head(
      `${process.env.BLOB_STORE_URL}/views/${id}.json`
    );
    return NextResponse.redirect(blobInfo.url);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
