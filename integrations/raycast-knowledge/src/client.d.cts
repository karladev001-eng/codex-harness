export interface Paths { node: string; cli: string; state: string }
export interface Card { capture_id: string; title: string; url: string; kind: string; captured_at: string; analysis_state: string; note_excerpt: string; summary: string | null; appearance: string | null; tags: string[]; use_cases: string[]; evidence: string[]; source_limitations: string[]; analysis_limitations: string[]; image_limitations: string[]; matches?: { field: string; excerpt: string }[] }
export interface SearchResult { freshness: { state: string; reason?: string; checked_at?: string }; commit?: string; checked_at?: string; results: Card[] }
export function resolvePaths(preferences?: { nodePath?: string; cliPath?: string; statePath?: string }): Promise<Paths>;
export function safeUrl(value: string): string | null;
export function cardMarkdown(card: Card): string;
export function freshnessLabel(value?: SearchResult): string;
export function freshnessShortLabel(value?: SearchResult): string;
export function search(paths: Paths, query: string): Promise<SearchResult>;
export function invoke(paths: Paths, command: string, args?: string[]): Promise<unknown>;
export class RequestGate { invalidate(): number; current(version: number): boolean }
