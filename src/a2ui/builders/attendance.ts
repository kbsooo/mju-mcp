import type { A2UiMessage } from '../types.js';
import { comp, buildMessages } from '../publish.js';

const STATUS_EMOJI: Record<string, string> = {
  '출석': '🟢',
  '지각': '🟡',
  '결석': '🔴',
  '조퇴': '🟠',
  '휴강': '⚪',
  '출석(인정)': '🟢',
  '결석(인정)': '🔴',
};

export interface AttendanceSession {
  isPast: boolean;
  dateLabel?: string | undefined;
  sessionLabel: string;
  statusLabel?: string | undefined;
}

export interface AttendanceSummary {
  attendedCount: number;
  tardyCount: number;
  absentCount: number;
  earlyLeaveCount: number;
}

export interface AttendanceCourse {
  courseTitle: string;
  courseCode: string;
  lectureNo: number;
}

export interface AttendanceResult {
  course: AttendanceCourse;
  summary: AttendanceSummary;
  sessions: AttendanceSession[];
}

function buildCourseCard(
  result: AttendanceResult,
  cardIndex: number,
  prefix = ''
): Array<{ id: string; component: Record<string, unknown> }> {
  const i = cardIndex;
  const p = prefix ? `${prefix}-` : '';

  const pastSessions = result.sessions.filter((s) => s.isPast);
  const sessionIds = pastSessions.map((_, si) => `${p}session-${i}-${si}`);

  const statsText = [
    `🟢 출석 ${result.summary.attendedCount}`,
    `🟡 지각 ${result.summary.tardyCount}`,
    `🔴 결석 ${result.summary.absentCount}`,
    `🟠 조퇴 ${result.summary.earlyLeaveCount}`,
  ].join('  ');

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.card(`${p}course-card-${i}`, `${p}course-col-${i}`),
    comp.column(`${p}course-col-${i}`, [
      `${p}course-title-${i}`,
      `${p}course-stats-${i}`,
      `${p}course-divider-${i}`,
      `${p}session-list-${i}`,
    ]),
    comp.text(`${p}course-title-${i}`, result.course.courseTitle, 'h3'),
    comp.text(`${p}course-stats-${i}`, statsText),
    comp.divider(`${p}course-divider-${i}`),
    comp.list(`${p}session-list-${i}`, sessionIds),
  ];

  pastSessions.forEach((session, si) => {
    const emoji = STATUS_EMOJI[session.statusLabel ?? ''] ?? '❓';
    const label = session.dateLabel ?? session.sessionLabel;
    const status = session.statusLabel ?? '기록 없음';
    components.push(comp.text(`${p}session-${i}-${si}`, `${emoji} ${label}  ${status}`));
  });

  return components;
}

export function buildAttendanceMessages(
  results: AttendanceResult[],
  year?: number,
  term?: number
): A2UiMessage[] {
  const subtitleParts: string[] = [];
  if (year !== undefined && term !== undefined) {
    subtitleParts.push(`${year}년 ${term}학기`);
  }
  subtitleParts.push(`${results.length}개 과목`);

  const cardIds = results.map((_, i) => `course-card-${i}`);

  const rootChildren = ['title', 'subtitle', ...cardIds];

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', rootChildren),
    comp.text('title', '📋 출석 현황', 'h1'),
    comp.text('subtitle', subtitleParts.join(' · ')),
  ];

  results.forEach((result, i) => {
    components.push(...buildCourseCard(result, i));
  });

  return buildMessages('view', 'root', components);
}

export function buildSingleAttendanceMessages(result: AttendanceResult): A2UiMessage[] {
  const statsText = [
    `🟢 출석 ${result.summary.attendedCount}`,
    `🟡 지각 ${result.summary.tardyCount}`,
    `🔴 결석 ${result.summary.absentCount}`,
    `🟠 조퇴 ${result.summary.earlyLeaveCount}`,
  ].join('  ');

  const pastSessions = result.sessions.filter((s) => s.isPast);
  const sessionIds = pastSessions.map((_, si) => `session-${si}`);

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', ['title', 'stats-card', 'session-list']),
    comp.text('title', result.course.courseTitle, 'h1'),
    comp.card('stats-card', 'stats-col'),
    comp.column('stats-col', ['stats']),
    comp.text('stats', statsText),
    comp.list('session-list', sessionIds),
  ];

  pastSessions.forEach((session, si) => {
    const emoji = STATUS_EMOJI[session.statusLabel ?? ''] ?? '❓';
    const label = session.dateLabel ?? session.sessionLabel;
    const status = session.statusLabel ?? '기록 없음';
    components.push(comp.text(`session-${si}`, `${emoji} ${label}  ${status}`));
  });

  return buildMessages('view', 'root', components);
}
