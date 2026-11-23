<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## vividparachute: personal study workflow

The user's latest product definition takes priority over the original starter prompt. The web is a quiet, READ-ONLY textbook/review notebook with current-page searchable PDF export. Do not add web AI chat, API model calls, handwriting, dashboards, quizzes, or extra app controls.

When the user asks an information/computer teacher-exam learning question in this project (rather than asking to implement software), answer it here in Codex, then save the useful study record to the existing library. Read `docs/CODEX_STUDY.md` and use `npm run study -- context "2026 A 3번"` to retrieve the exact real question and current canonical concepts. Inspect ALL referenced original images before explaining diagrams, code or calculations; use the corrected text alongside them. Ask for A/B if a reference is ambiguous. Default to concise hints and preserve the user's chosen spoiler level.

After answering, preserve the user's exact question and your answer as separate messages. Save only valuable objective knowledge as a rewritten, integrated canonical concept. Never fabricate the user's thought process or mistakes. Use the version-checked, idempotent `record` command described in `docs/CODEX_STUDY.md`; it atomically saves records and automatically publishes the private cloud snapshot. Do not call an extra AI API. Check the command's saved/published result; if cloud publishing fails, explain that the local record is saved and sync is pending.

For code changes authorized in this project, run relevant checks then use `npm run ship -- "concise commit message"` to commit and push to the user's `vividhyeok/vividparachute` main branch. The linked Vercel project deploys pushes automatically. Personal source PDFs, images, corrections, database, private snapshots, environment files and generated exports stay out of the PUBLIC Git repository. Study records publish to PRIVATE Blob storage without a Git rebuild.
