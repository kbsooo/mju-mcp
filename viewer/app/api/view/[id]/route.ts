import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^[\w-]{36}$/.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const { blobs } = await list({ prefix: `views/${id}.json` });
    if (!blobs[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Blob에서 JSON을 직접 fetch해서 반환
    const res = await fetch(blobs[0].url);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
