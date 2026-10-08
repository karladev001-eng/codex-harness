/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Node.js パス - Node.js 22+。空欄でHomebrewのNodeを検出 */
  "nodePath"?: string,
  /** Knowledge CLI パス - 空欄で ~/.agents/skills/codex-harness/knowledge/cli.cjs */
  "cliPath"?: string,
  /** State ディレクトリ - 空欄で ~/.codex/knowledge */
  "statePath"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-knowledge` command */
  export type SearchKnowledge = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-knowledge` command */
  export type SearchKnowledge = {}
}

