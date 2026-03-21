import type { CourseListResult, CourseSummary } from '../../lms/types.js';
import { comp, buildMessages } from '../publish.js';
import type { A2UiMessage } from '../types.js';

export function buildCoursesMessages(result: CourseListResult): A2UiMessage[] {
  const courses = result.courses;
  const termLabel = result.selectedTerms.length > 0
    ? result.selectedTerms.map((t) => t.key).join(', ')
    : '';

  const subtitleText = termLabel
    ? `${termLabel} · ${courses.length}개 과목`
    : `${courses.length}개 과목`;

  const courseCardIds = courses.map((_, i) => `course-card-${i}`);

  const components: Array<{ id: string; component: Record<string, unknown> }> = [
    comp.column('root', ['title', 'subtitle', ...courseCardIds]),
    comp.text('title', '📚 수강 과목', 'h1'),
    comp.text('subtitle', subtitleText),
  ];

  courses.forEach((course: CourseSummary, i: number) => {
    const colChildren = [`course-title-${i}`];
    const captionParts = [course.professor, course.classroomLabel].filter(Boolean);
    if (captionParts.length > 0) {
      colChildren.push(`course-caption-${i}`);
    }

    components.push(comp.card(`course-card-${i}`, `course-col-${i}`));
    components.push(comp.column(`course-col-${i}`, colChildren));
    components.push(comp.text(`course-title-${i}`, course.title, 'h3'));
    if (captionParts.length > 0) {
      components.push(comp.text(`course-caption-${i}`, captionParts.join(' · '), 'caption'));
    }
  });

  return buildMessages('view', 'root', components);
}
