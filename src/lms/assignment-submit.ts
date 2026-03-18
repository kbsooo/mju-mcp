import fs from "node:fs/promises";
import path from "node:path";

import { load } from "cheerio";

import { looksLikeLoginPage } from "./auth-heuristics.js";
import { getCourseAssignment, listCourseAssignments } from "./assignments.js";
import { enterStudentClassroom } from "./classroom.js";
import {
  FILE_UPLOAD_LIMIT_MESSAGE_URL,
  FILE_UPLOAD_LIMIT_SIZE_URL,
  LMS_BASE,
  STUDENT_REPORT_VIEW_URL
} from "./constants.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type {
  AssignmentSubmitCheckResult,
  AssignmentSubmitDraftFileCheck,
  AssignmentSubmitPopupSpec,
  AssignmentSubmitResult,
  AssignmentUploadedFile,
  DecodedResponse
} from "./types.js";

export interface CheckAssignmentSubmissionOptions {
  userId: string;
  password: string;
  kjkey: string;
  rtSeq: number;
  text?: string;
  localFiles?: string[];
}

export interface SubmitAssignmentOptions extends CheckAssignmentSubmissionOptions {
  confirm: boolean;
}

interface AssignmentUploadResponse {
  isError?: boolean;
  message?: string;
  seq1?: string;
}

interface AssignmentSubmitResponse {
  isError?: boolean;
  message?: string;
  isKjkey?: boolean;
  chSubjtMessage?: string;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toAbsoluteUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return new URL(trimmed, LMS_BASE).toString();
}

function parseLooseJson<T>(value: string): T | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return undefined;
  }
}

function parseSizeToBytes(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/);
  if (!match) {
    return undefined;
  }

  const amount = Number.parseFloat(match[1] ?? "");
  const unit = match[2];
  if (Number.isNaN(amount) || !unit) {
    return undefined;
  }

  const powerMap: Record<string, number> = {
    B: 0,
    KB: 1,
    MB: 2,
    GB: 3,
    TB: 4
  };
  const power = powerMap[unit];
  if (power === undefined) {
    return undefined;
  }

  return Math.round(amount * 1024 ** power);
}

function measureProvidedText(value: string | undefined): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 0;
  }

  if (!/[<>]/.test(trimmed)) {
    return normalizeText(trimmed).length;
  }

  return normalizeText(load(`<div>${trimmed}</div>`).text()).length;
}

function parseSubmitButton(html: string): {
  hasSubmitButton: boolean;
  submitButtonLabel?: string;
  submitPopupUrl?: string;
} {
  const $ = load(html);
  let result:
    | { hasSubmitButton: true; submitButtonLabel?: string; submitPopupUrl: string }
    | undefined;

  $("button,a,input[type='button'],input[type='submit']").each((_, element) => {
    const item = $(element);
    const onclickValue = item.attr("onclick")?.trim();
    const matchedPopupUrl = onclickValue?.match(/openReportSubmitPop\('([^']+)'\)/)?.[1];
    if (!matchedPopupUrl) {
      return;
    }

    const label =
      normalizeText(item.text()) ||
      normalizeText(item.attr("value") ?? "") ||
      undefined;
    result = {
      hasSubmitButton: true,
      submitPopupUrl: toAbsoluteUrl(matchedPopupUrl) ?? matchedPopupUrl,
      ...(label ? { submitButtonLabel: label } : {})
    };
    return false;
  });

  if (result) {
    return result;
  }

  return {
    hasSubmitButton: false
  };
}

function parseSubmitPopupSpec(
  html: string,
  popupUrl: string,
  submitButtonLabel: string | undefined
): AssignmentSubmitPopupSpec {
  const $ = load(html);
  const textFieldName =
    $("#TXT").attr("name")?.trim() || $("#TXT").attr("id")?.trim() || undefined;
  const requiresTextInput =
    /내용을 입력하세요\./.test(html) ||
    (textFieldName !== undefined && /function\s+inputCheck\s*\(/.test(html));
  const hasFilePicker =
    $("#pickfiles, #pickfiles2").length > 0 ||
    /efile_upload_multiple2\.acl/.test(html);
  const uploadUrl = toAbsoluteUrl(
    html.match(/url\s*:\s*['"]([^'"]*efile_upload_multiple2\.acl[^'"]*)['"]/)?.[1]
  );
  const uploadPath =
    html.match(/['"]path['"]\s*:\s*['"]([^'"]+)['"]/)?.[1]?.trim() || undefined;
  const uploadPfStFlag =
    html.match(/['"]pf_st_flag['"]\s*:\s*['"]([^'"]+)['"]/)?.[1]?.trim() ||
    undefined;
  const submitUrl = toAbsoluteUrl(
    html.match(/url\s*:\s*['"]([^'"]*report_insert\.acl[^'"]*)['"]/)?.[1]
  );

  return {
    submitPopupUrl: popupUrl,
    ...(submitButtonLabel ? { submitButtonLabel } : {}),
    requiresTextInput,
    ...(textFieldName ? { textFieldName } : {}),
    hasFilePicker,
    ...(uploadUrl ? { uploadUrl } : {}),
    ...(uploadPath ? { uploadPath } : {}),
    ...(uploadPfStFlag ? { uploadPfStFlag } : {}),
    ...(submitUrl ? { submitUrl } : {})
  };
}

async function fetchUploadLimits(
  client: MjuLmsSsoClient,
  popupSpec: AssignmentSubmitPopupSpec
): Promise<{
  uploadLimitMessage?: string;
  maxFileSizeLabel?: string;
  maxFileSizeBytes?: number;
}> {
  if (!popupSpec.uploadPath) {
    return {};
  }

  const messageResponse = await client.postForm(FILE_UPLOAD_LIMIT_MESSAGE_URL, {
    PATH: popupSpec.uploadPath,
    encoding: "utf-8"
  });
  const sizeResponse = await client.postForm(FILE_UPLOAD_LIMIT_SIZE_URL, {
    path: popupSpec.uploadPath
  });

  const messagePayload = parseLooseJson<{ MESSAGE?: string }>(messageResponse.text);
  const sizePayload = parseLooseJson<{ fileLimitSize?: string }>(sizeResponse.text);
  const maxFileSizeLabel = sizePayload?.fileLimitSize?.trim() || undefined;
  const maxFileSizeBytes = maxFileSizeLabel
    ? parseSizeToBytes(maxFileSizeLabel)
    : undefined;

  return {
    ...(messagePayload?.MESSAGE?.trim()
      ? { uploadLimitMessage: messagePayload.MESSAGE.trim() }
      : {}),
    ...(maxFileSizeLabel ? { maxFileSizeLabel } : {}),
    ...(maxFileSizeBytes !== undefined ? { maxFileSizeBytes } : {})
  };
}

async function inspectLocalFiles(
  filePaths: string[],
  maxFileSizeBytes: number | undefined
): Promise<AssignmentSubmitDraftFileCheck[]> {
  const results: AssignmentSubmitDraftFileCheck[] = [];

  for (const filePath of filePaths) {
    const resolvedPath = path.resolve(filePath);
    const fileName = path.basename(resolvedPath);

    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        results.push({
          path: resolvedPath,
          fileName,
          exists: false,
          blockingReason: "일반 파일이 아닙니다."
        });
        continue;
      }

      const fileCheck: AssignmentSubmitDraftFileCheck = {
        path: resolvedPath,
        fileName,
        exists: true,
        sizeBytes: stats.size
      };

      if (maxFileSizeBytes !== undefined) {
        fileCheck.withinMaxFileSize = stats.size <= maxFileSizeBytes;
        if (!fileCheck.withinMaxFileSize) {
          fileCheck.blockingReason = "서버 최대 첨부 용량을 초과했습니다.";
        }
      }

      results.push(fileCheck);
    } catch {
      results.push({
        path: resolvedPath,
        fileName,
        exists: false,
        blockingReason: "파일을 찾지 못했습니다."
      });
    }
  }

  return results;
}

function parseJsonResponse<T>(
  response: DecodedResponse,
  actionLabel: string
): T {
  const payload = parseLooseJson<T>(response.text);
  if (payload) {
    return payload;
  }

  if (looksLikeLoginPage(response)) {
    throw new Error(`${actionLabel} 도중 로그인 페이지로 이동했습니다. 세션이 만료된 것 같습니다.`);
  }

  throw new Error(`${actionLabel} 응답을 JSON으로 해석하지 못했습니다.`);
}

async function collectSubmissionContext(
  client: MjuLmsSsoClient,
  options: CheckAssignmentSubmissionOptions
): Promise<{
  assignmentDetail: Awaited<ReturnType<typeof getCourseAssignment>>;
  summary: Awaited<ReturnType<typeof listCourseAssignments>>["assignments"][number] | undefined;
  submitButton: ReturnType<typeof parseSubmitButton>;
  popupSpec?: AssignmentSubmitPopupSpec;
  popupLimits: Awaited<ReturnType<typeof fetchUploadLimits>>;
}> {
  await client.ensureAuthenticated(options.userId, options.password);
  await enterStudentClassroom(client, options.kjkey);

  const assignmentList = await listCourseAssignments(client, {
    userId: options.userId,
    password: options.password,
    kjkey: options.kjkey
  });
  const assignmentDetail = await getCourseAssignment(client, {
    userId: options.userId,
    password: options.password,
    kjkey: options.kjkey,
    rtSeq: options.rtSeq
  });
  const detailPage = await client.getPage(
    `${STUDENT_REPORT_VIEW_URL}?RT_SEQ=${options.rtSeq}`
  );

  const summary = assignmentList.assignments.find(
    (assignment) => assignment.rtSeq === options.rtSeq
  );
  const submitButton = parseSubmitButton(detailPage.text);

  let popupSpec: AssignmentSubmitPopupSpec | undefined;
  let popupLimits: Awaited<ReturnType<typeof fetchUploadLimits>> = {};

  if (submitButton.submitPopupUrl) {
    const popupResponse = await client.getPage(submitButton.submitPopupUrl);
    popupSpec = parseSubmitPopupSpec(
      popupResponse.text,
      submitButton.submitPopupUrl,
      submitButton.submitButtonLabel
    );
    popupLimits = await fetchUploadLimits(client, popupSpec);
  }

  return {
    assignmentDetail,
    summary,
    submitButton,
    ...(popupSpec ? { popupSpec } : {}),
    popupLimits
  };
}

export async function checkAssignmentSubmission(
  client: MjuLmsSsoClient,
  options: CheckAssignmentSubmissionOptions
): Promise<AssignmentSubmitCheckResult> {
  const localFilesInput = options.localFiles ?? [];
  const { assignmentDetail, summary, submitButton, popupSpec, popupLimits } =
    await collectSubmissionContext(client, options);

  const providedTextLength = measureProvidedText(options.text);
  const localFiles = await inspectLocalFiles(
    localFilesInput,
    popupLimits.maxFileSizeBytes
  );

  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  if (!submitButton.hasSubmitButton || !submitButton.submitPopupUrl) {
    blockingReasons.push("과제 상세에서 제출하기 버튼을 찾지 못했습니다.");
  }

  if (popupSpec?.requiresTextInput && providedTextLength === 0) {
    blockingReasons.push("제출 본문 텍스트가 비어 있습니다.");
  }

  if (popupSpec?.hasFilePicker && !popupSpec.uploadUrl) {
    blockingReasons.push("파일 업로드 엔드포인트를 확인하지 못했습니다.");
  }

  if (popupSpec && !popupSpec.submitUrl) {
    blockingReasons.push("최종 제출 엔드포인트를 확인하지 못했습니다.");
  }

  for (const file of localFiles) {
    if (file.blockingReason) {
      blockingReasons.push(`${file.fileName}: ${file.blockingReason}`);
    }
  }

  if (
    summary?.statusLabel &&
    submitButton.hasSubmitButton &&
    (summary.statusLabel.includes("마감") ||
      summary.statusLabel.toLowerCase().includes("deadline") ||
      summary.statusText?.includes("만료"))
  ) {
    warnings.push(
      `과제 목록 상태는 ${summary.statusLabel}${summary.statusText ? ` / ${summary.statusText}` : ""} 로 보이지만, 상세 화면에는 제출 버튼이 노출됩니다. 실제 제출 가능 여부는 버튼 기준으로 다시 확인해야 합니다.`
    );
  }

  if (assignmentDetail.submission) {
    warnings.push(
      `이미 제출된 과제로 보입니다${assignmentDetail.submission.status ? ` (${assignmentDetail.submission.status})` : ""}. 실제 제출 단계에서 수정 제출 가능 여부를 다시 확인해야 합니다.`
    );
  }

  if (popupSpec?.hasFilePicker && localFiles.length === 0) {
    warnings.push("현재 검증 입력에는 첨부파일이 없습니다.");
  }

  if (!popupLimits.maxFileSizeLabel && popupSpec?.hasFilePicker) {
    warnings.push("서버 첨부 용량 제한을 확인하지 못했습니다.");
  }

  return {
    kjkey: options.kjkey,
    rtSeq: options.rtSeq,
    title: assignmentDetail.title,
    ...(assignmentDetail.courseTitle
      ? { courseTitle: assignmentDetail.courseTitle }
      : {}),
    ...(assignmentDetail.submissionFormat
      ? { submissionFormat: assignmentDetail.submissionFormat }
      : {}),
    ...(assignmentDetail.dueAt ? { dueAt: assignmentDetail.dueAt } : {}),
    ...(summary?.statusLabel ? { summaryStatusLabel: summary.statusLabel } : {}),
    ...(summary?.statusText ? { summaryStatusText: summary.statusText } : {}),
    alreadySubmitted: assignmentDetail.submission !== undefined,
    ...(assignmentDetail.submission?.status
      ? { existingSubmissionStatus: assignmentDetail.submission.status }
      : {}),
    hasSubmitButton: submitButton.hasSubmitButton,
    ...(submitButton.submitButtonLabel
      ? { submitButtonLabel: submitButton.submitButtonLabel }
      : {}),
    ...(submitButton.submitPopupUrl
      ? { submitPopupUrl: submitButton.submitPopupUrl }
      : {}),
    requiresTextInput: popupSpec?.requiresTextInput ?? false,
    ...(popupSpec?.textFieldName ? { textFieldName: popupSpec.textFieldName } : {}),
    hasFilePicker: popupSpec?.hasFilePicker ?? false,
    ...(popupSpec?.uploadUrl ? { uploadUrl: popupSpec.uploadUrl } : {}),
    ...(popupSpec?.uploadPath ? { uploadPath: popupSpec.uploadPath } : {}),
    ...(popupSpec?.uploadPfStFlag
      ? { uploadPfStFlag: popupSpec.uploadPfStFlag }
      : {}),
    ...(popupSpec?.submitUrl ? { submitUrl: popupSpec.submitUrl } : {}),
    ...(popupLimits.uploadLimitMessage
      ? { uploadLimitMessage: popupLimits.uploadLimitMessage }
      : {}),
    ...(popupLimits.maxFileSizeLabel
      ? { maxFileSizeLabel: popupLimits.maxFileSizeLabel }
      : {}),
    ...(popupLimits.maxFileSizeBytes !== undefined
      ? { maxFileSizeBytes: popupLimits.maxFileSizeBytes }
      : {}),
    providedTextLength,
    providedTextSatisfiesRequirement:
      !(popupSpec?.requiresTextInput ?? false) || providedTextLength > 0,
    localFiles,
    canProceed: blockingReasons.length === 0,
    blockingReasons,
    warnings
  };
}

async function uploadAssignmentFile(
  client: MjuLmsSsoClient,
  checkResult: AssignmentSubmitCheckResult,
  userId: string,
  localFile: AssignmentSubmitDraftFileCheck
): Promise<AssignmentUploadedFile> {
  if (!localFile.exists || localFile.sizeBytes === undefined) {
    throw new Error(`${localFile.fileName} 파일을 업로드할 수 없습니다.`);
  }

  if (!checkResult.uploadUrl || !checkResult.uploadPath || !checkResult.uploadPfStFlag) {
    throw new Error("파일 업로드에 필요한 서버 파라미터가 부족합니다.");
  }

  const buffer = await fs.readFile(localFile.path);
  const formData = new FormData();
  formData.set("path", checkResult.uploadPath);
  formData.set("ud", userId);
  formData.set("ky", checkResult.kjkey);
  formData.set("returnData", "json");
  formData.set("pf_st_flag", checkResult.uploadPfStFlag);
  formData.append("file", new Blob([buffer]), localFile.fileName);

  const uploadResponse = await client.postMultipart(checkResult.uploadUrl, formData);
  const payload = parseJsonResponse<AssignmentUploadResponse>(
    uploadResponse,
    `${localFile.fileName} 파일 업로드`
  );

  if (payload.isError) {
    throw new Error(
      payload.message
        ? `${localFile.fileName} 파일 업로드 실패: ${payload.message}`
        : `${localFile.fileName} 파일 업로드 실패`
    );
  }

  const fileSeq = payload.seq1?.trim();
  if (!fileSeq) {
    throw new Error(`${localFile.fileName} 업로드 응답에서 FILE_SEQ를 찾지 못했습니다.`);
  }

  return {
    path: localFile.path,
    fileName: localFile.fileName,
    sizeBytes: localFile.sizeBytes,
    fileSeq
  };
}

export async function submitAssignment(
  client: MjuLmsSsoClient,
  options: SubmitAssignmentOptions
): Promise<AssignmentSubmitResult> {
  if (!options.confirm) {
    throw new Error("실제 제출을 실행하려면 --confirm 플래그가 필요합니다.");
  }

  const checkResult = await checkAssignmentSubmission(client, options);

  if (checkResult.alreadySubmitted) {
    throw new Error(
      "이미 제출된 과제의 수정 제출은 아직 구현하지 않았습니다. 실제 제출 단계에서는 재제출을 보수적으로 차단합니다."
    );
  }

  if (!checkResult.canProceed) {
    throw new Error(
      `제출 사전 검증을 통과하지 못했습니다.\n- ${checkResult.blockingReasons.join("\n- ")}`
    );
  }

  if (!checkResult.submitUrl) {
    throw new Error("최종 제출 URL을 확인하지 못했습니다.");
  }

  if (checkResult.providedTextLength === 0 && checkResult.localFiles.length === 0) {
    throw new Error("빈 제출은 허용하지 않습니다. 텍스트 또는 첨부파일을 하나 이상 제공해 주세요.");
  }

  if (!checkResult.hasFilePicker && checkResult.localFiles.length > 0) {
    throw new Error("이 과제는 현재 파일 첨부 제출 구조를 확인하지 못했습니다.");
  }

  const uploadedFiles: AssignmentUploadedFile[] = [];
  for (const localFile of checkResult.localFiles) {
    uploadedFiles.push(
      await uploadAssignmentFile(client, checkResult, options.userId, localFile)
    );
  }

  const submitResponse = await client.postForm(checkResult.submitUrl, {
    ud: options.userId,
    ky: options.kjkey,
    RT_SEQ: String(options.rtSeq),
    returnData: "json",
    JR_TXT: options.text?.trim() ?? "",
    FILE_SEQS: uploadedFiles.map((file) => file.fileSeq).join(","),
    start: "",
    display: "",
    INPUT_METHOD_FLAG: "",
    encoding: "utf-8"
  });

  const payload = parseJsonResponse<AssignmentSubmitResponse>(
    submitResponse,
    "과제 최종 제출"
  );

  if (payload.isError) {
    throw new Error(
      payload.message ? `과제 제출 실패: ${payload.message}` : "과제 제출 실패"
    );
  }

  if (payload.isKjkey === false) {
    throw new Error(
      payload.chSubjtMessage
        ? `과제 제출 실패: ${payload.chSubjtMessage}`
        : "과제 제출 후 강의실 상태를 확인하지 못했습니다."
    );
  }

  const verifiedDetail = await getCourseAssignment(client, {
    userId: options.userId,
    password: options.password,
    kjkey: options.kjkey,
    rtSeq: options.rtSeq
  });

  const warnings = [...checkResult.warnings];
  const verified = verifiedDetail.submission !== undefined;
  if (!verified) {
    warnings.push("제출 요청은 성공으로 보였지만, 제출 후 상세 재조회에서 제출 정보가 바로 보이지 않았습니다.");
  }

  return {
    kjkey: options.kjkey,
    rtSeq: options.rtSeq,
    title: verifiedDetail.title,
    ...(verifiedDetail.courseTitle ? { courseTitle: verifiedDetail.courseTitle } : {}),
    ...(verifiedDetail.submissionFormat
      ? { submissionFormat: verifiedDetail.submissionFormat }
      : {}),
    submittedTextLength: checkResult.providedTextLength,
    uploadedFiles,
    submitUrl: checkResult.submitUrl,
    verified,
    alreadySubmittedBeforeSubmit: checkResult.alreadySubmitted,
    ...(verifiedDetail.submission?.status
      ? { finalSubmissionStatus: verifiedDetail.submission.status }
      : {}),
    ...(verifiedDetail.submission?.submittedAt
      ? { finalSubmittedAt: verifiedDetail.submission.submittedAt }
      : {}),
    ...(verifiedDetail.submission?.text
      ? { finalSubmissionText: verifiedDetail.submission.text }
      : {}),
    ...(verifiedDetail.submission
      ? { finalSubmissionAttachmentCount: verifiedDetail.submission.attachments.length }
      : {}),
    warnings
  };
}
