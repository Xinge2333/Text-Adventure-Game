# Data Model: WeChat Text Adventure Mini Program

## Theme
- **Identifier**: `themeId` (string, slug derived from filename, unique)
- **Attributes**:
  - `title` (string, localized display name)
  - `description` (string, short teaser shown in catalog)
  - `tags` (string array, supports search facets)
  - `promptPath` (string, COS object key for `.txt` prompt)
  - `lastUpdated` (ISO timestamp, used to surface new themes)
- **Relationships**: Referenced by `SessionState.themeId` and catalog listings.
- **Validation Rules**:
  - `title` length 3–50 characters.
  - `description` ≤120 characters.
  - Tags limited to 5 per theme.

## SessionState (Backend Only)
- **Identifier**: `sessionId` (UUID v4 assigned by backend per story start)
- **Attributes**:
  - `themeId` (string)
  - `context` (ordered array of turn objects shared with DeepSeek)
  - `createdAt` (timestamp)
  - `expiresAt` (timestamp, default TTL 30 minutes of inactivity)
  - `lastResponseHash` (string, used to detect duplicate DeepSeek results)
- **Lifecycle**:
  - Created on story initialization.
  - Updated each turn with player choice and DeepSeek response.
  - Expired when `expiresAt` passed or backend sends ending flag.

## StoryTurn
- **Identifier**: composite (`sessionId`, `turnIndex`)
- **Attributes**:
  - `turnIndex` (integer ≥0)
  - `narrative` (string, markdown/plaintext returned by DeepSeek)
  - `options` (array of exactly four strings when continuing)
  - `selectedOption` (integer 1–4, set after player tap)
  - `endingFlag` (boolean, true if DeepSeek indicates completion)
- **Validation Rules**:
  - `options` must contain four non-empty values when `endingFlag` is false.
  - `endingFlag` true implies `options` may be empty.

## PlayerPreference (Client Storage)
- **Identifier**: `wechatOpenId` scoped key in local storage
- **Attributes**:
  - `favoriteThemeIds` (string array)
  - `lastVisitedThemeId` (string, optional)
  - `contentFilters` (enum: `all`, `family`, `mature`)
- **Validation Rules**:
  - Favorites array capped at 50 entries.
  - Content filter defaults to `all`.

## TelemetryEvent
- **Identifier**: auto-generated on submit (UUID v4)
- **Attributes**:
  - `sessionIdHash` (string, salted hash of session ID)
  - `themeId` (string)
  - `turnIndex` (integer)
  - `latencyMs` (integer)
  - `outcome` (enum: `success`, `handled_error`, `moderated`)
  - `timestamp` (ISO string)
- **Validation Rules**:
  - `latencyMs` must be ≥0.
  - `outcome` restricted to enum values.

## SearchIndex (Backend Derived)
- **Identifier**: `catalogVersion` (string, e.g., timestamp or git SHA)
- **Attributes**:
  - `themes` (array of Theme metadata without promptPath)
  - `generatedAt` (timestamp)
- **Lifecycle**:
  - Regenerated whenever new theme `.txt` uploaded.
  - Cached in memory and refreshed every 5 minutes max.
