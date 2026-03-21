import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

/**
 * mju_publish_view
 * A2UI ServerToClientMessage[] JSON을 Vercel viewer에 업로드하고 URL을 반환합니다.
 * Claude가 mju-mcp 조회 결과를 A2UI JSON으로 포맷한 뒤 이 tool을 호출합니다.
 */
export function registerViewTools(server: McpServer): void {
  server.tool(
    "mju_publish_view",
    "내부 전용 도구입니다. 각 조회 도구(mju_lms_*, mju_ucheck_*, mju_msi_*)가 자동으로 뷰어 URL을 생성하므로 " +
      "Claude가 직접 이 도구를 호출할 필요가 없습니다. " +
      "이 도구를 직접 호출하지 마세요.",
    {
      messages: z
        .array(z.unknown())
        .describe(
          "A2UI ServerToClientMessage[] 배열. beginRendering, surfaceUpdate, dataModelUpdate 메시지로 구성됩니다."
        ),
    },
    async ({ messages }) => {
      const baseUrl = process.env.MJU_VIEWER_URL;
      const secret = process.env.MJU_VIEWER_SECRET;

      if (!baseUrl) {
        return {
          content: [
            {
              type: "text",
              text: "MJU_VIEWER_URL 환경변수가 설정되지 않았습니다. .env에 viewer URL을 추가해주세요.",
            },
          ],
          isError: true,
        };
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (secret) {
        headers["Authorization"] = `Bearer ${secret}`;
      }

      let result: { id: string; url: string };
      try {
        const res = await fetch(`${baseUrl}/api/view`, {
          method: "POST",
          headers,
          body: JSON.stringify(messages),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }

        result = (await res.json()) as { id: string; url: string };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `viewer 업로드 실패: ${String(err)}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `뷰어 URL: ${result.url}`,
          },
        ],
        structuredContent: {
          id: result.id,
          url: result.url,
        },
      };
    }
  );
}
