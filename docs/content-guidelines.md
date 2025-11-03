# Content & Error Messaging Guidelines

## Moderation Responses
- Display warning banner text: "⚠️ 内容未通过审核，本局已结束" (aligns with `moderationMessage` fallback).
- Provide two actions: `重新开始` (restart story) and `返回主题` (exit to catalog).

## Network & Timeout Errors
- Mini program toast copy: "加载失败，请重试" (already implemented as fallback in story page).
- For catalog load failures, maintain existing toast and allow retry via pull down.

## Option Shortage Handling
- Backend no longer auto-ends turns for missing numbered options; the story view always renders four selectable buttons.
- QA should confirm the narrative文本包含可供玩家阅读的选项说明即可，无需额外提示。

Document owner: Feature team 001-speckit-specify-wechat.
