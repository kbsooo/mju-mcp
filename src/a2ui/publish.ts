import type { A2UiComponent, A2UiMessage } from './types.js';

export type { A2UiComponent, A2UiMessage };

// Component constructors
export const comp = {
  text: (id: string, str: string, hint?: string): { id: string; component: A2UiComponent } => ({
    id,
    component: { Text: { ...(hint ? { usageHint: hint } : {}), text: { literalString: str } } },
  }),
  card: (id: string, child: string): { id: string; component: A2UiComponent } => ({
    id,
    component: { Card: { child } },
  }),
  column: (id: string, children: string[]): { id: string; component: A2UiComponent } => ({
    id,
    component: { Column: { children: { explicitList: children } } },
  }),
  row: (id: string, children: string[]): { id: string; component: A2UiComponent } => ({
    id,
    component: { Row: { children: { explicitList: children } } },
  }),
  list: (id: string, children: string[], direction = 'vertical'): { id: string; component: A2UiComponent } => ({
    id,
    component: { List: { direction, children: { explicitList: children } } },
  }),
  divider: (id: string): { id: string; component: A2UiComponent } => ({
    id,
    component: { Divider: {} },
  }),
};

export function buildMessages(
  surfaceId: string,
  rootId: string,
  components: Array<{ id: string; component: A2UiComponent }>
): A2UiMessage[] {
  return [
    { beginRendering: { surfaceId, root: rootId, styles: { primaryColor: '#1a56db', font: 'Roboto' } } },
    { surfaceUpdate: { surfaceId, components } },
  ];
}

export async function publishView(messages: A2UiMessage[]): Promise<string | null> {
  const baseUrl = process.env.MJU_VIEWER_URL;
  const secret = process.env.MJU_VIEWER_SECRET;
  if (!baseUrl) return null;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['Authorization'] = `Bearer ${secret}`;

  try {
    const res = await fetch(`${baseUrl}/api/view`, {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });
    if (!res.ok) return null;
    const data = await res.json() as { url: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}
