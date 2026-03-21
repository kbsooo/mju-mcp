export type A2UiComponent = Record<string, unknown>;

export interface A2UiMessage {
  beginRendering?: {
    surfaceId: string;
    root: string;
    styles?: Record<string, string>;
  };
  surfaceUpdate?: {
    surfaceId: string;
    components: Array<{ id: string; component: A2UiComponent }>;
  };
}
