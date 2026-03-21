"use client";

import { useEffect, useState } from "react";
import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
  defaultTheme,
} from "@a2ui/react";
import type { Types } from "@a2ui/react";

function Renderer({ messages }: { messages: Types.ServerToClientMessage[] }) {
  const { processMessages, getSurfaces } = useA2UIActions();
  const [, forceRender] = useState(0);

  useEffect(() => {
    processMessages(messages);
    // processMessages 후 상태 반영을 위해 리렌더 트리거
    forceRender((n) => n + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const surfaces = getSurfaces();

  return (
    <div className="space-y-4">
      {Array.from(surfaces.keys()).map((surfaceId) => (
        <A2UIRenderer key={surfaceId} surfaceId={surfaceId} />
      ))}
    </div>
  );
}

export default function A2UIViewer({
  messages,
}: {
  messages: Types.ServerToClientMessage[];
}) {
  return (
    <A2UIProvider theme={defaultTheme}>
      <Renderer messages={messages} />
    </A2UIProvider>
  );
}
