# Build log

8 November 2026. One Devin session per step, Normal mode. Timer started at 15:44 with a hard stop at 17:44.

| # | Session | Prompt sent | PR opened | Merged | Prompt to merge | Follow-ups | Size |
|---|---------|-------------|-----------|--------|-----------------|------------|------|
| 1 | Platform foundation: mock SSO, permissions, audit log, masking, CI | 15:57 | 16:12 | 16:32 | 23 min to green CI | 1 | 2,760 lines, 82 files |
| 2 | Refunds with four-eyes approval | 16:33 | 16:38 | 16:40 | 7 min | 0 | 1,218 lines, 20 files |
| 3 | Playbook for new apps | 16:35 | 16:35 | 16:37 | 2 min | 0 | 61 lines |
| 4 | Feature flags, built from the Playbook | 16:37 | 16:45 | 16:46 | 9 min | 0 | 1,114 lines, 14 files |
| 5 | Ops change request: refund reason codes | 16:40 | 16:47 | 16:48 | 8 min | 0 | +191 / -39, 9 files |
| 6 | README rewrite | 16:49 | 16:51 | 16:52 | 3 min | 0 | README only |

Sessions 2 and 3 ran in parallel, then 4 and 5. Everything was merged by 16:52, 68 minutes in. Each PR was reviewed and had green CI before merge: lint, type check, build, tests on SQLite and Postgres with Node 22 and 24, plus a fresh-clone setup check. I spent about 20 minutes in total reviewing the PRs, focused on permissions, audit, approval logic and tests.

## The one follow-up

`package.json` said Node 20.9+ works, but the tests crash on Node 20.18 because Vite 7 needs 20.19+. CI only ran Node 24, so it missed this. Devin fixed `engines` and added Node 22 to CI within two minutes.

## Notes

- Session 1's first CI run failed. Devin fixed it without being asked.
- From session 2 on, Devin's saved environment failed its `git pull` at start because of a stale `package-lock.json`. Each session moved the file aside and carried on.
- The Playbook PR opened in about a minute. It listed the Refunds app as a reference before that code existed.
- This Devin org uses Skills instead of Playbooks, so session 4 read the Playbook from the repo.
- Session 4 followed the Playbook rule to report platform gaps rather than patch them. It found that the audit scrubber masks any run of 13+ digits as a card number.
- Session 5 tested on Postgres in Docker and in the browser, with screenshots in the PR.
