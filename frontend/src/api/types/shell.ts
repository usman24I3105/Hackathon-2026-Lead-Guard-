/** GET /api/workspaces — workspaces the signed-in user belongs to. */
export interface Workspace {
  id: string;
  name: string;
  current: boolean;
}

/** GET /api/search?q= — results the caller is permitted to see. */
export interface SearchResult {
  kind: "contact" | "lead";
  id: string;
  title: string;
  subtitle: string;
}
