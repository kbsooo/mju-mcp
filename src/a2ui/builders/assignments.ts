import type { AssignmentListResult, AssignmentDetailResult, AssignmentSummary } from '../../lms/types.js';
import { comp, buildMessages } from '../publish.js';
import type { A2UiMessage } from '../types.js';

function assignmentEmoji(a: AssignmentSummary): string {
  if (a.isSubmitted) return '🟢';
  // Check if statusLabel suggests it's expired/missed
  const label = (a.statusLabel ?? '').toLowerCase();
  if (label.includes('미제출') || label.includes('만료') || label.includes('마감')) return '🔴';
  return '🟠';
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

export function buildAssignmentListMessages(result: AssignmentListResult): A2UiMessage[] {
  const title = result.courseTitle ? `${result.courseTitle} 과제` : '과제 목록';
  const assignments = result.assignments;

  const itemIds = assignments.map((_, i) => `assignment-item-${i}`);

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', ['title', 'list']),
    comp.text('title', title, 'h1'),
    comp.list('list', itemIds),
  ];

  assignments.forEach((a: AssignmentSummary, i: number) => {
    const emoji = assignmentEmoji(a);
    const statusText = a.statusLabel ?? (a.isSubmitted ? '제출완료' : '미제출');
    const rowText = `${emoji} ${a.title}  ${statusText}`;
    components.push(comp.text(`assignment-item-${i}`, rowText));
  });

  return buildMessages('view', 'root', components);
}

export function buildAssignmentDetailMessages(result: AssignmentDetailResult): A2UiMessage[] {
  const isSubmitted = result.submission?.status !== undefined;
  const statusEmoji = isSubmitted ? '🟢' : '🔴';
  const statusLabel = result.submission?.status ?? '미제출';

  const colChildren = [`detail-title`];

  const hasDueOrPoints = result.dueAt ?? result.points;
  if (hasDueOrPoints) {
    colChildren.push('detail-meta-row');
  }
  colChildren.push('detail-status');

  if (result.bodyText) {
    colChildren.push('detail-divider');
    colChildren.push('detail-body');
  }

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', ['detail-card']),
    comp.card('detail-card', 'detail-col'),
    comp.column('detail-col', colChildren),
    comp.text('detail-title', result.title, 'h3'),
  ];

  if (hasDueOrPoints) {
    const metaChildren: string[] = [];
    if (result.dueAt) {
      components.push(comp.text('detail-due', result.dueAt, 'caption'));
      metaChildren.push('detail-due');
    }
    if (result.points) {
      components.push(comp.text('detail-points', result.points, 'caption'));
      metaChildren.push('detail-points');
    }
    components.push(comp.row('detail-meta-row', metaChildren));
  }

  components.push(comp.text('detail-status', `${statusEmoji} ${statusLabel}`));

  if (result.bodyText) {
    components.push(comp.divider('detail-divider'));
    components.push(comp.text('detail-body', truncate(result.bodyText, 200), 'caption'));
  }

  return buildMessages('view', 'root', components);
}
