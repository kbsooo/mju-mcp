import type {
  MsiCurrentGradesResult,
  MsiTimetableResult,
  MsiGradeHistoryResult,
  MsiGraduationRequirementsResult,
} from '../../msi/types.js';
import { comp, buildMessages } from '../publish.js';
import type { A2UiMessage } from '../types.js';

function gradeEmoji(grade?: string): string {
  if (!grade) return '⚪';
  if (grade.startsWith('A')) return '🟢';
  if (grade.startsWith('B')) return '🟡';
  if (grade.startsWith('C') || grade.startsWith('D') || grade.startsWith('F')) return '🔴';
  return '⚪';
}

export function buildCurrentGradesMessages(result: MsiCurrentGradesResult): A2UiMessage[] {
  const yearTermLabel = result.year !== undefined && result.termLabel
    ? `${result.year} ${result.termLabel}`
    : result.termLabel ?? '';

  const itemIds = result.items.map((_, i) => `grade-item-${i}`);

  const rootChildren = ['title'];
  if (yearTermLabel) rootChildren.push('subtitle');
  rootChildren.push('list');

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', rootChildren),
    comp.text('title', '📊 수강성적', 'h1'),
  ];

  if (yearTermLabel) {
    components.push(comp.text('subtitle', yearTermLabel));
  }

  components.push(comp.list('list', itemIds));

  result.items.forEach((item, i) => {
    const emoji = gradeEmoji(item.grade);
    const gradeText = item.grade ?? '비공개';
    const rowText = `${emoji} ${item.courseTitle}  ${gradeText}`;
    components.push(comp.text(`grade-item-${i}`, rowText));
  });

  return buildMessages('view', 'root', components);
}

export function buildTimetableMessages(result: MsiTimetableResult): A2UiMessage[] {
  const yearTermLabel = `${result.year} ${result.termLabel}`;

  const itemIds = result.entries.map((_, i) => `tt-item-${i}`);

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', ['title', 'subtitle', 'list']),
    comp.text('title', '📅 시간표', 'h1'),
    comp.text('subtitle', yearTermLabel),
    comp.list('list', itemIds),
  ];

  result.entries.forEach((entry, i) => {
    const timeInfo = [entry.dayLabel, entry.timeRange].filter(Boolean).join(' ');
    const rowText = timeInfo
      ? `⚪ ${entry.courseTitle}  ${timeInfo}`
      : `⚪ ${entry.courseTitle}`;
    components.push(comp.text(`tt-item-${i}`, rowText));
  });

  return buildMessages('view', 'root', components);
}

export function buildGradeHistoryMessages(result: MsiGradeHistoryResult): A2UiMessage[] {
  const gpa = result.overview['평균평점(확인용)'];

  const termCardIds = result.termRecords.map((_, i) => `term-card-${i}`);
  const rootChildren = ['title'];
  if (gpa) rootChildren.push('subtitle');
  rootChildren.push(...termCardIds);

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', rootChildren),
    comp.text('title', '📚 성적이력', 'h1'),
  ];

  if (gpa) {
    components.push(comp.text('subtitle', `평균평점(확인용): ${gpa}`));
  }

  result.termRecords.forEach((term, i) => {
    const metaParts: string[] = [];
    if (term.requestedCredits !== undefined) metaParts.push(`신청 ${term.requestedCredits}학점`);
    if (term.earnedCredits !== undefined) metaParts.push(`취득 ${term.earnedCredits}학점`);
    if (term.gpa !== undefined) metaParts.push(`평점 ${term.gpa}`);

    const courseIds = term.courses.map((_, ci) => `term-${i}-course-${ci}`);
    const colChildren = [`term-${i}-title`];
    if (metaParts.length > 0) colChildren.push(`term-${i}-meta`);
    if (courseIds.length > 0) colChildren.push(`term-${i}-courses`);

    components.push(comp.card(`term-card-${i}`, `term-col-${i}`));
    components.push(comp.column(`term-col-${i}`, colChildren));
    components.push(comp.text(`term-${i}-title`, term.title, 'h3'));

    if (metaParts.length > 0) {
      components.push(comp.text(`term-${i}-meta`, metaParts.join(' · '), 'caption'));
    }

    if (courseIds.length > 0) {
      components.push(comp.list(`term-${i}-courses`, courseIds));
      term.courses.forEach((course, ci) => {
        const emoji = gradeEmoji(course.grade);
        const rowText = `${emoji} ${course.courseTitle}  ${course.grade}`;
        components.push(comp.text(`term-${i}-course-${ci}`, rowText));
      });
    }
  });

  return buildMessages('view', 'root', components);
}

export function buildGraduationMessages(result: MsiGraduationRequirementsResult): A2UiMessage[] {
  const gaps = result.creditGaps.filter((g) => (g.gap ?? 0) > 0);

  const gapIds = gaps.map((_, i) => `gap-item-${i}`);

  const rootChildren = ['title', 'summary-card'];
  if (gaps.length > 0) {
    rootChildren.push('gaps-list');
  }

  const summaryParts: string[] = [];
  const totalEarned = result.earnedCredits.find((c) => c.label === '합계' || c.label.includes('총'));
  const totalRequired = result.requiredCredits.find((c) => c.label === '합계' || c.label.includes('총'));
  if (totalEarned?.credits !== undefined) summaryParts.push(`취득 ${totalEarned.credits}학점`);
  if (totalRequired?.credits !== undefined) summaryParts.push(`필요 ${totalRequired.credits}학점`);

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', rootChildren),
    comp.text('title', '🎓 졸업요건', 'h1'),
    comp.card('summary-card', 'summary-col'),
    comp.column('summary-col', ['summary-text']),
    comp.text('summary-text', summaryParts.length > 0
      ? summaryParts.join(' · ')
      : `부족 항목 ${gaps.length}건`),
  ];

  if (gaps.length > 0) {
    components.push(comp.list('gaps-list', gapIds));
    gaps.forEach((gap, i) => {
      const metaParts: string[] = [];
      if (gap.earned !== undefined) metaParts.push(`취득 ${gap.earned}`);
      if (gap.required !== undefined) metaParts.push(`필요 ${gap.required}`);
      if (gap.gap !== undefined) metaParts.push(`부족 ${gap.gap}`);
      const rowText = `🔴 ${gap.label}  ${metaParts.join(' · ')}`;
      components.push(comp.text(`gap-item-${i}`, rowText));
    });
  }

  return buildMessages('view', 'root', components);
}
