import type { NoticeListResult, NoticeDetailResult, NoticeSummary } from '../../lms/types.js';
import { comp, buildMessages } from '../publish.js';
import type { A2UiMessage } from '../types.js';

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

export function buildNoticeListMessages(result: NoticeListResult): A2UiMessage[] {
  const title = result.courseTitle ? `${result.courseTitle} 공지` : '공지 목록';
  const notices = result.notices;

  const itemIds = notices.map((_, i) => `notice-item-${i}`);

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', ['title', 'list']),
    comp.text('title', title, 'h1'),
    comp.list('list', itemIds),
  ];

  notices.forEach((n: NoticeSummary, i: number) => {
    const emoji = n.isUnread ? '🔵' : '⚪';
    const dateText = n.postedAt ?? '';
    const rowText = dateText
      ? `${emoji} ${n.title}  ${dateText}`
      : `${emoji} ${n.title}`;
    components.push(comp.text(`notice-item-${i}`, rowText));
  });

  return buildMessages('view', 'root', components);
}

export function buildNoticeDetailMessages(result: NoticeDetailResult): A2UiMessage[] {
  const colChildren = ['detail-title'];

  const metaParts = [result.author, result.postedAt].filter(Boolean);
  if (metaParts.length > 0) {
    colChildren.push('detail-meta');
  }

  colChildren.push('detail-divider');

  if (result.bodyText) {
    colChildren.push('detail-body');
  }

  if (result.attachments.length > 0) {
    colChildren.push('detail-attachments');
  }

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', ['detail-card']),
    comp.card('detail-card', 'detail-col'),
    comp.column('detail-col', colChildren),
    comp.text('detail-title', result.title, 'h3'),
  ];

  if (metaParts.length > 0) {
    components.push(comp.text('detail-meta', metaParts.join(' · '), 'caption'));
  }

  components.push(comp.divider('detail-divider'));

  if (result.bodyText) {
    components.push(comp.text('detail-body', truncate(result.bodyText, 300)));
  }

  if (result.attachments.length > 0) {
    const attachIds = result.attachments.map((_, i) => `detail-attach-${i}`);
    components.push(comp.list('detail-attachments', attachIds));
    result.attachments.forEach((att, i) => {
      const sizeText = att.sizeLabel ? `  ${att.sizeLabel}` : '';
      components.push(comp.text(`detail-attach-${i}`, `📎 ${att.name}${sizeText}`));
    });
  }

  return buildMessages('view', 'root', components);
}
