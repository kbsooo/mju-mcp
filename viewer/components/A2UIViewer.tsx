"use client";

import { useEffect } from "react";
import { A2UIProvider, A2UIRenderer, useA2UIActions } from "@a2ui/react";
import type { Types } from "@a2ui/react";

const MJU_THEME: Types.Theme = {
  primaryColor: "#1a56db",   // 명지대 파란색 계열
  font: "Roboto",
};

function Renderer({ messages }: { messages: Types.ServerToClientMessage[] }) {
  const { processMessages, getSurfaces } = useA2UIActions();

  useEffect(() => {
    processMessages(messages);
  }, [messages, processMessages]);

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
    <A2UIProvider theme={MJU_THEME}>
      <Renderer messages={messages} />
    </A2UIProvider>
  );
}
