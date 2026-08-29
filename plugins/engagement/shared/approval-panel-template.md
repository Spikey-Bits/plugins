# Approval panel template

Used at the panel-build and review steps of `skills/comment-responder/SKILL.md`. Two output formats and two confirmation modes. PRIMARY is stacked cards with in-place edit. SECONDARY is a table with chat pick-syntax.

## Format A — Stacked cards (PRIMARY)

A `.docx` review surface written to `<review folder>/comment-review-youtube-<ts>-b<n>.docx`, one per batch. The review folder comes from the `engagement-profile` skill. One card per row, vertical layout, built for human readability.

**Per-card structure:**

- **Header line.** `#N · @handle · Nd · [TONE]` where TONE is the literal word `WARM` or `CLAPBACK`. Tone tag styled blue on WARM, red on CLAPBACK.
- **ORIGINAL:** label plus the commenter's original text, read-only. Do NOT truncate; full context matters.
- **REPLY:** label plus the drafted reply, presented as an in-place editable field. Styled red bold on CLAPBACK rows.
- **Separator.** Light gray horizontal rule between cards.

**Writer behavior:**

- Overwrite the REPLY text to change a draft.
- Leave REPLY unchanged to approve as drafted.
- Delete REPLY entirely, leaving it blank, to skip that row.

## Format B — 6-column table (SECONDARY)

Fallback when the writer opts out of the `.docx` surface. A single markdown table inline in the chat response body, NOT inside a code fence.

| Column | Source | Notes |
|---|---|---|
| # | Row index (1, 2, 3, ...) | Used in pick syntax |
| Commenter | `handle` from fetch | Truncate to 30 chars plus "..." if longer |
| Age | `ageText` from fetch | `12m` / `4h` / `3d` |
| Original comment | `body` from fetch | Wrap long text; do NOT truncate |
| Proposed reply | Drafted reply | Show literal |
| Tone | `warm` or `clapback` | One word |

## Confirmation modes

### Mode A — In-place edit (PRIMARY, pairs with Format A)

The writer edits REPLY fields directly in the `.docx`, then either types `send` in chat or pastes the edited doc body back into chat. Parse each `REPLY:` line: non-blank text is approved and posted verbatim, blank text is a skip.

### Mode B — Chat pick-syntax (SECONDARY, pairs with Format B)

```
Reply with picks per row:
  Ny        approve row N and post it
  Nn        skip row N
  Ne <text> post your verbatim text as the reply
  Nr        regenerate row N only, redisplay
  k         kill remaining; do not post

Example: '1y 2n 3e Thanks for catching that 4y 5r'
Unspecified rows skip by default.
```

## Ambiguity HALT

If the chat reply matches neither Mode A nor Mode B cleanly, for example it contains both pick-syntax tokens and looks like a pasted doc body, HALT and ask the writer to disambiguate. Do NOT auto-disambiguate.

## Behavior

- One panel per batch. All batch panels are built AND presented up front, reviewable in any order.
- On `Ne <text>` (Mode B) or an edited REPLY (Mode A): substitute the writer's text verbatim; do NOT pass it back through the drafting step.
- On `Nr` (Mode B only): re-draft row N only, then redisplay the full panel.
- On `k` (Mode B) or every REPLY blank (Mode A): stop posting and preserve the results file with `cancelled: true`.
