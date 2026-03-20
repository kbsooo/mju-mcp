import { Suspense } from "react";
import A2UIViewer from "@/components/A2UIViewer";
import type { Types } from "@a2ui/react";

async function fetchMessages(id: string): Promise<Types.ServerToClientMessage[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const res = await fetch(`${base}/api/view/${id}`, {
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error("View not found");
  return res.json() as Promise<Types.ServerToClientMessage[]>;
}

export default async function ViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let messages: Types.ServerToClientMessage[];
  try {
    messages = await fetchMessages(id);
  } catch {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">데이터를 찾을 수 없습니다.</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Suspense>
        <A2UIViewer messages={messages} />
      </Suspense>
    </main>
  );
}
