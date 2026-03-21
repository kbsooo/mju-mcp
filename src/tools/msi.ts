import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import {
  getMsiCurrentTermGrades,
  getMsiGradeHistory,
  getMsiGraduationRequirements,
  getMsiTimetable
} from "../msi/services.js";
import type { AppContext } from "../mcp/app-context.js";
import { requireCredentials } from "./credentials.js";
import {
  buildCurrentGradesMessages,
  buildTimetableMessages,
  buildGradeHistoryMessages,
  buildGraduationMessages
} from "../a2ui/builders/msi.js";
import { publishView } from "../a2ui/publish.js";

const labeledValueSchema = {
  label: z.string(),
  value: z.string()
};

const timetableTermOptionSchema = {
  code: z.string(),
  label: z.string(),
  selected: z.boolean()
};

const timetableEntrySchema = {
  dayOfWeek: z.number().int(),
  dayLabel: z.string(),
  courseTitle: z.string(),
  location: z.string().optional(),
  professor: z.string().optional(),
  timeRange: z.string().optional(),
  curiNum: z.string().optional(),
  courseCls: z.string().optional(),
  topPercent: z.number().optional(),
  heightPercent: z.number().optional()
};

const currentGradeItemSchema = {
  courseCode: z.string().optional(),
  courseClass: z.string().optional(),
  courseTitle: z.string(),
  credits: z.number().optional(),
  grade: z.string().optional(),
  publicStatus: z.string().optional(),
  lectureEvaluationStatus: z.string().optional(),
  statusMessage: z.string().optional()
};

const creditBucketSchema = {
  label: z.string(),
  credits: z.number().optional(),
  rawValue: z.string()
};

const gradeHistoryCourseSchema = {
  category: z.string(),
  courseCode: z.string(),
  courseTitle: z.string(),
  credits: z.number().optional(),
  grade: z.string()
};

const gradeHistoryTermRecordSchema = {
  title: z.string(),
  year: z.number().int().optional(),
  termLabel: z.string(),
  requestedCredits: z.number().optional(),
  earnedCredits: z.number().optional(),
  totalPoints: z.number().optional(),
  gpa: z.number().optional(),
  courses: z.array(z.object(gradeHistoryCourseSchema))
};

const gradeHistoryRowSchema = {
  year: z.number().int().optional(),
  termLabel: z.string(),
  category: z.string(),
  courseTitle: z.string(),
  courseCode: z.string(),
  credits: z.number().optional(),
  grade: z.string(),
  duplicateCode: z.string().optional()
};

const graduationCreditSchema = {
  label: z.string(),
  credits: z.number().optional(),
  rawValue: z.string()
};

const graduationGapSchema = {
  label: z.string(),
  earned: z.number().optional(),
  required: z.number().optional(),
  gap: z.number().optional()
};

function toLabeledValues(record: Record<string, string>): Array<{ label: string; value: string }> {
  return Object.entries(record).map(([label, value]) => ({ label, value }));
}

function formatTertiaryLine(values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" | ");
}

function formatTimetableText(result: Awaited<ReturnType<typeof getMsiTimetable>>): string {
  if (result.entries.length === 0) {
    return `${result.year} ${result.termLabel} 시간표 항목이 없습니다.`;
  }

  return [
    `${result.year} ${result.termLabel} 시간표 ${result.entries.length}건`,
    ...result.entries.map((entry) => {
      const meta = formatTertiaryLine([
        entry.dayLabel,
        entry.timeRange,
        entry.professor,
        entry.location
      ]);
      return `- ${entry.courseTitle}${meta ? ` | ${meta}` : ""}`;
    })
  ].join("\n");
}

function formatCurrentGradesText(
  result: Awaited<ReturnType<typeof getMsiCurrentTermGrades>>
): string {
  const title = result.year && result.termLabel
    ? `${result.year} ${result.termLabel} 수강성적 ${result.items.length}건`
    : `수강성적 ${result.items.length}건`;

  if (result.items.length === 0) {
    return `${title}\n조회된 과목이 없습니다.`;
  }

  return [
    title,
    ...result.items.map((item) => {
      const meta = formatTertiaryLine([
        item.courseClass,
        item.credits !== undefined ? `${item.credits}학점` : undefined,
        item.grade,
        item.publicStatus,
        item.lectureEvaluationStatus,
        item.statusMessage
      ]);
      return `- ${item.courseTitle}${meta ? ` | ${meta}` : ""}`;
    })
  ].join("\n");
}

function formatGradeHistoryText(
  result: Awaited<ReturnType<typeof getMsiGradeHistory>>
): string {
  const gpa = result.overview["평균평점(확인용)"];
  return [
    `성적이력 ${result.allRows.length}건`,
    gpa ? `평균평점(확인용): ${gpa}` : undefined,
    `학기 카드: ${result.termRecords.length}개`,
    ...result.termRecords.slice(0, 5).map((term) => {
      const meta = formatTertiaryLine([
        term.requestedCredits !== undefined
          ? `신청 ${term.requestedCredits}학점`
          : undefined,
        term.earnedCredits !== undefined
          ? `취득 ${term.earnedCredits}학점`
          : undefined,
        term.gpa !== undefined ? `평점 ${term.gpa}` : undefined
      ]);
      return `- ${term.title}${meta ? ` | ${meta}` : ""}`;
    })
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGraduationRequirementsText(
  result: Awaited<ReturnType<typeof getMsiGraduationRequirements>>
): string {
  const gaps = result.creditGaps.filter((item) => (item.gap ?? 0) > 0);
  if (gaps.length === 0) {
    return "졸업학점 조회\n현재 계산 기준으로 부족한 학점 항목이 없습니다.";
  }

  return [
    "졸업학점 조회",
    `부족 항목 ${gaps.length}건`,
    ...gaps.map((gap) => {
      const meta = formatTertiaryLine([
        gap.earned !== undefined ? `취득 ${gap.earned}` : undefined,
        gap.required !== undefined ? `필요 ${gap.required}` : undefined,
        gap.gap !== undefined ? `부족 ${gap.gap}` : undefined
      ]);
      return `- ${gap.label}${meta ? ` | ${meta}` : ""}`;
    })
  ].join("\n");
}

function toStructuredContent(value: Record<string, unknown>): Record<string, unknown> {
  return value;
}

export function registerMsiTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_msi_get_timetable",
    {
      title: "MSI 수강과목시간표 조회",
      description:
        "명지대 MSI의 수강과목시간표를 조회합니다. year/termCode를 주면 해당 학기로 다시 조회합니다.",
      inputSchema: {
        year: z.number().int().optional().describe("조회할 연도입니다. 예: 2026"),
        termCode: z
          .number()
          .int()
          .optional()
          .describe("MSI 학기 코드입니다. 10=1학기, 15=여름계절, 20=2학기, 25=겨울계절")
      },
      outputSchema: {
        year: z.number().int(),
        termCode: z.string(),
        termLabel: z.string(),
        termOptions: z.array(z.object(timetableTermOptionSchema)),
        entries: z.array(z.object(timetableEntrySchema)),
        viewUrl: z.string().optional()
      }
    },
    async ({ year, termCode }) => {
      const credentials = await requireCredentials(context);
      const client = context.createMsiClient();
      const result = await getMsiTimetable(client, credentials, {
        ...(year !== undefined ? { year } : {}),
        ...(termCode !== undefined ? { termCode } : {})
      });

      const viewUrl = await publishView(buildTimetableMessages(result));

      return {
        content: [
          {
            type: "text",
            text: viewUrl
              ? `${formatTimetableText(result)}\n\n🔗 뷰어: ${viewUrl}`
              : formatTimetableText(result)
          }
        ],
        structuredContent: toStructuredContent({
          year: result.year,
          termCode: result.termCode,
          termLabel: result.termLabel,
          termOptions: result.termOptions,
          entries: result.entries,
          ...(viewUrl ? { viewUrl } : {})
        })
      };
    }
  );

  server.registerTool(
    "mju_msi_get_current_term_grades",
    {
      title: "MSI 수강성적조회",
      description:
        "명지대 MSI의 현재 학기 수강성적조회 화면을 읽어 과목별 성적 상태를 반환합니다.",
      inputSchema: {},
      outputSchema: {
        year: z.number().int().optional(),
        termLabel: z.string().optional(),
        items: z.array(z.object(currentGradeItemSchema)),
        viewUrl: z.string().optional()
      }
    },
    async () => {
      const credentials = await requireCredentials(context);
      const client = context.createMsiClient();
      const result = await getMsiCurrentTermGrades(client, credentials);

      const viewUrl = await publishView(buildCurrentGradesMessages(result));

      return {
        content: [
          {
            type: "text",
            text: viewUrl
              ? `${formatCurrentGradesText(result)}\n\n🔗 뷰어: ${viewUrl}`
              : formatCurrentGradesText(result)
          }
        ],
        structuredContent: toStructuredContent({
          ...(result.year !== undefined ? { year: result.year } : {}),
          ...(result.termLabel ? { termLabel: result.termLabel } : {}),
          items: result.items,
          ...(viewUrl ? { viewUrl } : {})
        })
      };
    }
  );

  server.registerTool(
    "mju_msi_get_grade_history",
    {
      title: "MSI 성적이력 조회",
      description:
        "명지대 MSI의 성적조회 화면을 읽어 전체 취득학점, 학기별 성적 카드, 전체 성적 행 목록을 반환합니다.",
      inputSchema: {},
      outputSchema: {
        studentInfo: z.array(z.object(labeledValueSchema)),
        overview: z.array(z.object(labeledValueSchema)),
        creditsByCategory: z.array(z.object(creditBucketSchema)),
        termRecords: z.array(z.object(gradeHistoryTermRecordSchema)),
        allRows: z.array(z.object(gradeHistoryRowSchema)),
        viewUrl: z.string().optional()
      }
    },
    async () => {
      const credentials = await requireCredentials(context);
      const client = context.createMsiClient();
      const result = await getMsiGradeHistory(client, credentials);

      const viewUrl = await publishView(buildGradeHistoryMessages(result));

      return {
        content: [
          {
            type: "text",
            text: viewUrl
              ? `${formatGradeHistoryText(result)}\n\n🔗 뷰어: ${viewUrl}`
              : formatGradeHistoryText(result)
          }
        ],
        structuredContent: toStructuredContent({
          studentInfo: toLabeledValues(result.studentInfo),
          overview: toLabeledValues(result.overview),
          creditsByCategory: result.creditsByCategory,
          termRecords: result.termRecords,
          allRows: result.allRows,
          ...(viewUrl ? { viewUrl } : {})
        })
      };
    }
  );

  server.registerTool(
    "mju_msi_get_graduation_requirements",
    {
      title: "MSI 졸업학점조회",
      description:
        "명지대 MSI의 졸업학점조회 화면을 읽어 현재 취득학점, 필요학점, 부족학점 계산 결과를 반환합니다.",
      inputSchema: {},
      outputSchema: {
        studentInfo: z.array(z.object(labeledValueSchema)),
        earnedCredits: z.array(z.object(graduationCreditSchema)),
        requiredCredits: z.array(z.object(graduationCreditSchema)),
        creditGaps: z.array(z.object(graduationGapSchema)),
        notes: z.array(z.string()),
        viewUrl: z.string().optional()
      }
    },
    async () => {
      const credentials = await requireCredentials(context);
      const client = context.createMsiClient();
      const result = await getMsiGraduationRequirements(client, credentials);

      const viewUrl = await publishView(buildGraduationMessages(result));

      return {
        content: [
          {
            type: "text",
            text: viewUrl
              ? `${formatGraduationRequirementsText(result)}\n\n🔗 뷰어: ${viewUrl}`
              : formatGraduationRequirementsText(result)
          }
        ],
        structuredContent: toStructuredContent({
          studentInfo: toLabeledValues(result.studentInfo),
          earnedCredits: result.earnedCredits,
          requiredCredits: result.requiredCredits,
          creditGaps: result.creditGaps,
          notes: result.notes,
          ...(viewUrl ? { viewUrl } : {})
        })
      };
    }
  );
}
