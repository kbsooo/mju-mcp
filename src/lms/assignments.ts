import { load } from "cheerio";

import {
  STUDENT_ACTIVITY_LIST_URL,
  STUDENT_REPORT_VIEW_URL
} from "./constants.js";
import {
  extractAttachmentRequestParams,
  fetchAttachments
} from "./attachments.js";
import { enterStudentClassroom } from "./classroom.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type {
  AssignmentDetailResult,
  AssignmentListResult,
  AssignmentSubmissionInfo,
  AssignmentSummary,
  AttachmentRequestParams
} from "./types.js";

export interface ListAssignmentsOptions {
  userId: string;
  password: string;
  kjkey: string;
  week?: number;
}

export interface GetAssignmentOptions {
  userId: string;
  password: string;
  kjkey: string;
  rtSeq: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}

function isAssignmentActivity(className: string | undefined): boolean {
  return (
    className
      ?.split(/\s+/)
      .some((token) => token === "activity_report1" || token.startsWith("activity_report")) ??
    false
  );
}

function parseActivityId(
  idValue: string | undefined,
  onclickValue: string | undefined
): number | undefined {
  const matchedId = idValue?.match(/^class_menu_report_(\d+)$/);
  if (matchedId?.[1]) {
    return parsePositiveInt(matchedId[1]);
  }

  const matchedOnclick = onclickValue?.match(/'report'\s*,\s*'(\d+)'/);
  return parsePositiveInt(matchedOnclick?.[1]);
}

export function parseAssignmentListHtml(
  html: string,
  options: { week?: number } = {}
): AssignmentSummary[] {
  const $ = load(html);
  const assignments: AssignmentSummary[] = [];
  let currentWeek: number | undefined;
  let currentWeekLabel: string | undefined;
  const container = $("#class_activity_list");
  const nodes =
    container.length > 0
      ? container.find(".activity_week, .activity")
      : $.root().find(".activity_week, .activity");

  nodes.each((_, element) => {
    const item = $(element);

    if (item.hasClass("activity_week")) {
      currentWeek = parsePositiveInt(item.attr("data-week"));
      currentWeekLabel = normalizeText(item.text()) || undefined;
      return;
    }

    if (!isAssignmentActivity(item.attr("class"))) {
      return;
    }

    if (options.week !== undefined && currentWeek !== options.week) {
      return;
    }

    const rtSeq = parseActivityId(item.attr("id"), item.attr("onclick"));
    const title = normalizeText(item.find(".activity_title").first().text());
    if (!rtSeq || !title) {
      return;
    }

    const statusLabel =
      normalizeText(item.find(".activity_info_title").first().text()) || undefined;
    const statusText =
      normalizeText(item.find(".activity_info_text").first().text()) || undefined;

    assignments.push({
      rtSeq,
      title,
      isSubmitted: item.find(".submit_check").length > 0,
      ...(currentWeek !== undefined ? { week: currentWeek } : {}),
      ...(currentWeekLabel ? { weekLabel: currentWeekLabel } : {}),
      ...(statusLabel ? { statusLabel } : {}),
      ...(statusText ? { statusText } : {})
    });
  });

  return assignments;
}

function parseDetailMetaMap(html: string): Map<string, string> {
  const $ = load(html);
  const meta = new Map<string, string>();

  $("table.bbsview tr").each((_, element) => {
    const row = $(element);
    const label = normalizeText(row.find("th").first().text());
    const value = normalizeText(row.find("td").first().text());

    if (label && value) {
      meta.set(label, value);
    }
  });

  return meta;
}

function parseAssignmentBody(html: string): {
  title: string;
  bodyHtml: string;
  bodyText: string;
} {
  const $ = load(html);
  const title = normalizeText($(".view_title").first().text());
  const bodyNode = $("td.textviewer").first();

  return {
    title,
    bodyHtml: bodyNode.html()?.trim() ?? "",
    bodyText: normalizeText(bodyNode.text())
  };
}

function extractSubmissionAttachmentRequest(
  html: string,
  fallbackParams: AttachmentRequestParams | undefined
): AttachmentRequestParams | undefined {
  const match = html.match(
    /content_seq\s*=\s*"([^"]*)"[\s\S]*?url:\s*"\/ilos\/co\/efile_list\.acl"[\s\S]*?ud\s*:\s*"([^"]+)"[\s\S]*?ky\s*:\s*"([^"]+)"[\s\S]*?pf_st_flag\s*:\s*"([^"]+)"[\s\S]*?CONTENT_SEQ\s*:\s*content_seq[\s\S]*?TURNITIN_SEQ\s*:\s*"([^"]*)"/
  );

  const contentSeq = match?.[1]?.trim();
  const userId = match?.[2]?.trim() || fallbackParams?.userId;
  const kjkey = match?.[3]?.trim() || fallbackParams?.kjkey;
  const pfStFlag = match?.[4]?.trim() || fallbackParams?.pfStFlag;
  const turnitinSeq = match?.[5]?.trim();

  if (!contentSeq || !userId || !kjkey || !pfStFlag) {
    return undefined;
  }

  return {
    userId,
    kjkey,
    pfStFlag,
    contentSeq,
    ...(turnitinSeq ? { turnitinSeq } : {})
  };
}

function parseSubmissionInfo(
  html: string,
  submissionContentSeq: string | undefined,
  attachments: AssignmentSubmissionInfo["attachments"]
): AssignmentSubmissionInfo | undefined {
  const $ = load(html);
  const submitForm = $("#submit_form");
  if (submitForm.length === 0) {
    return undefined;
  }

  const status = normalizeText(submitForm.find(".submit_info_box .txt").first().text()) || undefined;
  const submittedAt =
    normalizeText(submitForm.find(".submit_info_box .date").first().text()) || undefined;
  const text =
    normalizeText(submitForm.find(".inner_content_wrap .content").first().text()) || undefined;

  if (!status && !submittedAt && !text && attachments.length === 0 && !submissionContentSeq) {
    return undefined;
  }

  return {
    attachments,
    ...(status ? { status } : {}),
    ...(submittedAt ? { submittedAt } : {}),
    ...(text ? { text } : {}),
    ...(submissionContentSeq ? { contentSeq: submissionContentSeq } : {})
  };
}

export async function listCourseAssignments(
  client: MjuLmsSsoClient,
  options: ListAssignmentsOptions
): Promise<AssignmentListResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const response = await client.postForm(STUDENT_ACTIVITY_LIST_URL, {
    MENU_ID: "",
    ARTL_NUM: "",
    encoding: "utf-8"
  });

  const assignments = parseAssignmentListHtml(response.text, {
    ...(options.week !== undefined ? { week: options.week } : {})
  });
  const courseTitle = classroom.courseTitle;

  return {
    kjkey: options.kjkey,
    assignments,
    ...(courseTitle ? { courseTitle } : {}),
    ...(options.week !== undefined ? { week: options.week } : {})
  };
}

export async function getCourseAssignment(
  client: MjuLmsSsoClient,
  options: GetAssignmentOptions
): Promise<AssignmentDetailResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const response = await client.getPage(
    `${STUDENT_REPORT_VIEW_URL}?RT_SEQ=${options.rtSeq}`
  );

  const meta = parseDetailMetaMap(response.text);
  const body = parseAssignmentBody(response.text);
  if (!body.title) {
    throw new Error(`과제 상세를 읽지 못했습니다. rtSeq=${options.rtSeq}`);
  }

  const promptAttachmentRequest = extractAttachmentRequestParams(response.text);
  const submissionAttachmentRequest = extractSubmissionAttachmentRequest(
    response.text,
    promptAttachmentRequest
  );

  const attachments = promptAttachmentRequest
    ? await fetchAttachments(client, promptAttachmentRequest)
    : [];
  const submissionAttachments = submissionAttachmentRequest
    ? await fetchAttachments(client, submissionAttachmentRequest)
    : [];
  const submission = parseSubmissionInfo(
    response.text,
    submissionAttachmentRequest?.contentSeq,
    submissionAttachments
  );
  const courseTitle = classroom.courseTitle;
  const submissionMethod = meta.get("제출방식");
  const submissionFormat = meta.get("제출형태");
  const openAt = meta.get("공개일");
  const dueAt = meta.get("마감일");
  const points = meta.get("배점");
  const scoreVisibility = meta.get("점수공개");
  const contentSeq = promptAttachmentRequest?.contentSeq;

  return {
    kjkey: options.kjkey,
    rtSeq: options.rtSeq,
    title: body.title,
    bodyHtml: body.bodyHtml,
    bodyText: body.bodyText,
    attachments,
    ...(courseTitle ? { courseTitle } : {}),
    ...(submissionMethod ? { submissionMethod } : {}),
    ...(submissionFormat ? { submissionFormat } : {}),
    ...(openAt ? { openAt } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(points ? { points } : {}),
    ...(scoreVisibility ? { scoreVisibility } : {}),
    ...(contentSeq ? { contentSeq } : {}),
    ...(submission ? { submission } : {})
  };
}
