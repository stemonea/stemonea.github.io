declare module 'virtual:content' {
  /** Parsed content/*.yaml files, keyed by file name without extension. */
  export const data: Record<string, unknown>
  /** Original YAML text, keyed by file name (e.g. "profile.yaml"). */
  export const raw: Record<string, string>
}
