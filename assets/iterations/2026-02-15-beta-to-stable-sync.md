# Beta -> Stable Sync Record

Date: 2026-02-15
Type: Production sync

## Scope
This sync promotes validated beta capabilities into stable runtime:
- stronger image fallback chain
- compact summary on high volume
- grouped clickable summary format
- heat score model + ranking
- per-item heat display (`🔥x.x`)
- preview workflows for formatting validation

## Stable branch targets
- `main`
- `bot-stable` (runtime branch)

## Commit map (beta ancestry -> stable commit)
- `5c4a50b` -> `ba220f8` : add logo fallback + AI compact summary path
- `2b832bf` -> `3c9d44b` : improve rule summary + beta summary preview workflow
- `2587b17` -> `2163482` : headline-dense compact summary
- `df5c46e` -> `67fd00c` : grouped clickable summary format
- `4e15751` -> `7391f6c` : heat-based category/headline ranking
- `9aab04a` -> `0910f97` : expose heat formula + show heat in messages
- `d4f2bf0` -> `bcc2787` : single-news preview workflow

## Runtime expectation after sync
- stable workflow uses `bot-stable` code ref
- single message format includes heat marker at header
- compact summary (> threshold) renders grouped clickable headlines with per-item heat

## Notes
- Version trace remains enabled via `.github/workflows/version-trace.yml`
- trace tags are visible in repository Tags page
