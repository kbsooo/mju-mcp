import fs from "node:fs/promises";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import {
  checkAssignmentSubmission,
  deleteAssignment,
  submitAssignment
} from "../lms/assignment-submit.js";
import type { AppContext } from "../mcp/app-context.js";
import { requireCredentials } from "./credentials.js";

const draftFileSchema = {
  path: z.string(),
  fileName: z.string(),
  exists: z.boolean(),
  sizeBytes: z.number().int().optional(),
  withinMaxFileSize: z.boolean().optional(),
  blockingReason: z.string().optional()
};

const existingAttachmentSchema = {
  fileSeq: z.string(),
  name: z.string(),
  sizeBytes: z.number().int().optional(),
  contentSeq: z.string().optional()
};

const uploadedFileSchema = {
  path: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().int(),
  fileSeq: z.string()
};

async function resolveDraftText(
  inlineText: string | undefined,
  textFilePath: string | undefined
): Promise<string | undefined> {
  const text = inlineText?.trim();
  const filePath = textFilePath?.trim();

  if (text && filePath) {
    throw new Error("text 와 textFilePath 는 동시에 사용할 수 없습니다.");
  }

  if (filePath) {
    return fs.readFile(filePath, "utf8");
  }

  return text || undefined;
}

function formatAssignmentCheckText(result: {
  title: string;
  submissionMode: string;
  canProceed: boolean;
  hasSubmitButton: boolean;
  hasDeleteButton: boolean;
  blockingReasons: string[];
  warnings: string[];
}): string {
  const lines = [
    `${result.title}`,
    `제출 모드: ${result.submissionMode}`,
    `진행 가능: ${result.canProceed ? "예" : "아니오"}`,
    `제출/수정 버튼: ${result.hasSubmitButton ? "있음" : "없음"}`,
    `삭제 버튼: ${result.hasDeleteButton ? "있음" : "없음"}`
  ];

  if (result.blockingReasons.length > 0) {
    lines.push(`차단 사유 ${result.blockingReasons.length}건`);
    for (const reason of result.blockingReasons) {
      lines.push(`- ${reason}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`경고 ${result.warnings.length}건`);
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

function formatAssignmentSubmitText(result: {
  title: string;
  submissionMode: string;
  verified: boolean;
  submitUrl: string;
  finalSubmissionStatus?: string;
  finalSubmittedAt?: string;
  finalSubmissionAttachmentCount?: number;
}): string {
  const lines = [
    `${result.title}`,
    `제출 모드: ${result.submissionMode}`,
    `검증 성공: ${result.verified ? "예" : "아니오"}`,
    `제출 URL: ${result.submitUrl}`
  ];

  if (result.finalSubmissionStatus) {
    lines.push(`최종 상태: ${result.finalSubmissionStatus}`);
  }
  if (result.finalSubmittedAt) {
    lines.push(`최종 제출 시각: ${result.finalSubmittedAt}`);
  }
  if (result.finalSubmissionAttachmentCount !== undefined) {
    lines.push(`최종 첨부 수: ${result.finalSubmissionAttachmentCount}`);
  }

  return lines.join("\n");
}

function formatAssignmentDeleteText(result: {
  title: string;
  verified: boolean;
  finalHasSubmission: boolean;
  finalHasSubmitButton: boolean;
}): string {
  return [
    `${result.title}`,
    `삭제 검증 성공: ${result.verified ? "예" : "아니오"}`,
    `삭제 후 제출 정보 남아있음: ${result.finalHasSubmission ? "예" : "아니오"}`,
    `삭제 후 제출하기 버튼 복구: ${result.finalHasSubmitButton ? "예" : "아니오"}`
  ].join("\n");
}

export function registerAssignmentActionTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_check_assignment_submission",
    {
      title: "과제 제출 가능 여부 점검",
      description:
        "초기 제출 또는 재제출 가능한 과제인지 확인하고, 수정/삭제 버튼과 제출 스펙을 함께 점검합니다.",
      inputSchema: {
        kjkey: z.string().describe("강의 KJKEY 입니다."),
        rtSeq: z.number().int().describe("과제 RT_SEQ 입니다."),
        text: z.string().optional().describe("검증할 제출 본문 HTML 또는 텍스트입니다."),
        textFilePath: z
          .string()
          .optional()
          .describe("검증할 본문을 읽을 로컬 파일 경로입니다."),
        localFiles: z
          .array(z.string())
          .optional()
          .describe("검증할 로컬 첨부파일 경로 배열입니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        rtSeq: z.number().int(),
        courseTitle: z.string().optional(),
        title: z.string(),
        submissionFormat: z.string().optional(),
        dueAt: z.string().optional(),
        summaryStatusLabel: z.string().optional(),
        summaryStatusText: z.string().optional(),
        submissionMode: z.enum(["initial-submit", "update-submit"]),
        alreadySubmitted: z.boolean(),
        existingSubmissionStatus: z.string().optional(),
        existingSubmissionHtml: z.string().optional(),
        existingSubmissionText: z.string().optional(),
        existingAttachments: z.array(z.object(existingAttachmentSchema)),
        hasSubmitButton: z.boolean(),
        submitButtonLabel: z.string().optional(),
        submitPopupUrl: z.string().optional(),
        requiresTextInput: z.boolean(),
        textFieldName: z.string().optional(),
        hasFilePicker: z.boolean(),
        uploadUrl: z.string().optional(),
        uploadPath: z.string().optional(),
        uploadPfStFlag: z.string().optional(),
        submitCheckUrl: z.string().optional(),
        submitCheckDiv: z.string().optional(),
        submitUrl: z.string().optional(),
        submitContentSeq: z.string().optional(),
        hasDeleteButton: z.boolean(),
        deleteButtonLabel: z.string().optional(),
        deleteSubmitCheckUrl: z.string().optional(),
        deleteSubmitCheckDiv: z.string().optional(),
        deleteUrl: z.string().optional(),
        deleteContentSeq: z.string().optional(),
        uploadLimitMessage: z.string().optional(),
        maxFileSizeLabel: z.string().optional(),
        maxFileSizeBytes: z.number().int().optional(),
        providedTextLength: z.number().int(),
        effectiveTextLength: z.number().int(),
        usedExistingTextFallback: z.boolean(),
        providedTextSatisfiesRequirement: z.boolean(),
        localFiles: z.array(z.object(draftFileSchema)),
        canProceed: z.boolean(),
        blockingReasons: z.array(z.string()),
        warnings: z.array(z.string())
      }
    },
    async ({ kjkey, rtSeq, text, textFilePath, localFiles }) => {
      const { userId, password } = await requireCredentials(context);
      const client = context.createLmsClient();
      const draftText = await resolveDraftText(text, textFilePath);
      const result = await checkAssignmentSubmission(client, {
        userId,
        password,
        kjkey,
        rtSeq,
        ...(draftText ? { text: draftText } : {}),
        ...(localFiles && localFiles.length > 0 ? { localFiles } : {})
      });

      return {
        content: [
          {
            type: "text",
            text: formatAssignmentCheckText(result)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_submit_assignment",
    {
      title: "과제 제출 또는 재제출",
      description:
        "초기 제출 또는 수정 제출을 실제로 수행합니다. confirm=true 가 반드시 필요합니다.",
      inputSchema: {
        kjkey: z.string().describe("강의 KJKEY 입니다."),
        rtSeq: z.number().int().describe("과제 RT_SEQ 입니다."),
        text: z.string().optional().describe("제출할 본문 HTML 또는 텍스트입니다."),
        textFilePath: z
          .string()
          .optional()
          .describe("제출 본문을 읽을 로컬 파일 경로입니다."),
        localFiles: z
          .array(z.string())
          .optional()
          .describe("추가할 로컬 첨부파일 경로 배열입니다."),
        confirm: z
          .boolean()
          .describe("실제 제출/수정 제출 실행 여부입니다. true 여야 합니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        rtSeq: z.number().int(),
        title: z.string(),
        courseTitle: z.string().optional(),
        submissionFormat: z.string().optional(),
        submissionMode: z.enum(["initial-submit", "update-submit"]),
        submittedTextLength: z.number().int(),
        uploadedFiles: z.array(z.object(uploadedFileSchema)),
        submitUrl: z.string(),
        verified: z.boolean(),
        alreadySubmittedBeforeSubmit: z.boolean(),
        finalSubmissionStatus: z.string().optional(),
        finalSubmittedAt: z.string().optional(),
        finalSubmissionText: z.string().optional(),
        finalSubmissionAttachmentCount: z.number().int().optional(),
        warnings: z.array(z.string())
      }
    },
    async ({ kjkey, rtSeq, text, textFilePath, localFiles, confirm }) => {
      const { userId, password } = await requireCredentials(context);
      const client = context.createLmsClient();
      const draftText = await resolveDraftText(text, textFilePath);
      const result = await submitAssignment(client, {
        userId,
        password,
        kjkey,
        rtSeq,
        confirm,
        ...(draftText ? { text: draftText } : {}),
        ...(localFiles && localFiles.length > 0 ? { localFiles } : {})
      });

      return {
        content: [
          {
            type: "text",
            text: formatAssignmentSubmitText(result)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_delete_assignment_submission",
    {
      title: "과제 제출 삭제",
      description:
        "이미 제출된 과제의 제출 내역을 삭제합니다. confirm=true 가 반드시 필요합니다.",
      inputSchema: {
        kjkey: z.string().describe("강의 KJKEY 입니다."),
        rtSeq: z.number().int().describe("과제 RT_SEQ 입니다."),
        confirm: z
          .boolean()
          .describe("실제 삭제 실행 여부입니다. true 여야 합니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        rtSeq: z.number().int(),
        title: z.string(),
        courseTitle: z.string().optional(),
        deleteUrl: z.string(),
        verified: z.boolean(),
        hadSubmission: z.boolean(),
        finalHasSubmission: z.boolean(),
        finalHasSubmitButton: z.boolean(),
        warnings: z.array(z.string())
      }
    },
    async ({ kjkey, rtSeq, confirm }) => {
      const { userId, password } = await requireCredentials(context);
      const client = context.createLmsClient();
      const result = await deleteAssignment(client, {
        userId,
        password,
        kjkey,
        rtSeq,
        confirm
      });

      return {
        content: [
          {
            type: "text",
            text: formatAssignmentDeleteText(result)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );
}
