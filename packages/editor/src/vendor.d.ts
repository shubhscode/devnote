// Minimal typings for turndown (no @types/turndown to keep deps lean;
// turndown-plugin-gfm has no published types at all). Pulled into every
// program via `/// <reference>` in paste.ts (web typechecks package sources
// directly without their sibling .d.ts files).
declare module 'turndown' {
  export interface TurndownOptions {
    headingStyle?: 'setext' | 'atx';
    codeBlockStyle?: 'indented' | 'fenced';
    bulletListMarker?: '-' | '+' | '*';
  }
  export default class TurndownService {
    constructor(options?: TurndownOptions);
    use(plugin: (service: TurndownService) => void): this;
    turndown(html: string): string;
  }
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export function gfm(service: TurndownService): void;
}
