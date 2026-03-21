"use client";

import { useEffect, useRef } from "react";
import type { Types } from "@a2ui/react";

/**
 * Lit Web Components 기반 A2UI 뷰어.
 * Shadow DOM + Material Design 3 스타일링으로 갤러리 수준의 UI 제공.
 * SSR 완전 우회: 모든 Lit 관련 코드는 클라이언트 useEffect 안에서만 실행.
 */
export default function A2UILitViewer({
  messages,
}: {
  messages: Types.ServerToClientMessage[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 순차 import: SSR에서 절대 실행 안 됨 (useEffect는 브라우저 전용)
      const [{ v0_8 }, , { LitElement, html }, { ContextProvider }, UI, { litTheme }] =
        await Promise.all([
          import("@a2ui/lit"),
          import("@a2ui/lit/ui"),       // 모든 custom element 등록 (side-effect)
          import("lit"),
          import("@lit/context"),
          import("@a2ui/lit/ui"),
          import("@a2ui/react"),
        ]);

      if (cancelled || !containerRef.current) return;

      // 테마 컨텍스트를 자식에게 제공하는 래퍼 커스텀 엘리먼트 정의
      if (!customElements.get("mju-a2ui-surface")) {
        class MjuSurfaceWrapper extends LitElement {
          static properties = {
            surfaceId: { attribute: false },
            surface: { attribute: false },
            processor: { attribute: false },
            _theme: { attribute: false, state: true },
          };

          _theme: Types.Theme | undefined = undefined;
          surfaceId = "";
          surface: unknown = null;
          processor: unknown = null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          _provider: InstanceType<typeof ContextProvider> | null = null;

          constructor() {
            super();
            // ContextProvider는 connectedCallback 전에 생성해야 context-request를 캐치
            this._provider = new ContextProvider(this, {
              context: UI.Context.themeContext,
              initialValue: this._theme,
            });
          }

          set theme(value: Types.Theme | undefined) {
            this._theme = value;
            this._provider?.setValue(value as never);
          }
          get theme() {
            return this._theme;
          }

          render() {
            return html`<a2ui-surface
              .surfaceId=${this.surfaceId}
              .surface=${this.surface}
              .processor=${this.processor}
            ></a2ui-surface>`;
          }
        }
        customElements.define("mju-a2ui-surface", MjuSurfaceWrapper);
      }

      // beginRendering 메시지에서 surfaceId 추출
      const beginMsg = messages.find(
        (m): m is { beginRendering: NonNullable<Types.ServerToClientMessage["beginRendering"]> } =>
          Boolean(m.beginRendering)
      );
      if (!beginMsg) return;
      const surfaceId = beginMsg.beginRendering.surfaceId;

      // 메시지 처리
      const processor = new v0_8.Data.A2uiMessageProcessor();
      processor.processMessages(messages);

      const surface = processor.getSurfaces().get(surfaceId);
      if (!surface || !containerRef.current) return;

      // mju-a2ui-surface 엘리먼트 생성 & 속성 주입
      const wrapper = document.createElement("mju-a2ui-surface") as HTMLElement & {
        surfaceId: string;
        surface: unknown;
        processor: unknown;
        theme: Types.Theme | undefined;
      };
      wrapper.surfaceId = surfaceId;
      wrapper.surface = surface;
      wrapper.processor = processor;
      wrapper.theme = litTheme;

      containerRef.current.replaceChildren(wrapper);
    }

    init().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [messages]);

  return (
    <div
      ref={containerRef}
      style={{ minHeight: 80 }}
    />
  );
}
