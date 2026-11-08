# Draft — GitHub Support request (history / PR-ref purge)

**Status:** DRAFT ONLY — do **not** submit automatically. Owner review required.  
**Related guidance:** https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository

## Important limitations

GitHub Support may decline removal when material is not classified as sufficiently sensitive under their policies. Force-pushing a rewritten `main` does **not** erase:

- `refs/pull/*/head` and `refs/pull/*/merge`
- Cached commit pages
- Forks, mirrors, or local clones taken before the rewrite

This draft must **never** include private customer social URLs, API tokens, or other secrets.

## Suggested private Support message

Subject: Request review of residual pull-request refs after history rewrite

Body:

> Repository: `pitsssss/FB_-_IG_Scrapper_Tool` (public)
>
> We rewrote the default branch (`main`) to remove private customer social profile identifiers that had appeared only in older commits. The current `main` tip after rewrite was verified in a clean clone for ordinary reachable history (prior audit). Apache-2.0 license and private vulnerability reporting are enabled on the repository.
>
> Residual surfaces we still observe via the GitHub API / `git ls-remote` (metadata only):
>
> - Historical Dependabot pull requests **#1–#7** (closed, unmerged) whose head commits still compare as heavily diverged from current `main` (approximately ahead 37 / behind 42) and remain HTTP-accessible as commit objects.
> - Associated `refs/pull/*/head` (and some merge refs) still advertised by `git ls-remote`.
> - Current `main` HEAD (post-rewrite lineage) is distinct from those pre-rewrite tips.
>
> We are **not** asking Support to change repository visibility or to process credential rotation. We ask whether GitHub can purge or unlink the obsolete pull-request refs / cached commit pages that still expose pre-rewrite objects no longer reachable from `main`.
>
> We can provide exact old commit SHAs and PR numbers privately if required. We will not post the removed private identifiers in a public issue.
>
> We understand GitHub may decline if the content does not meet Support’s sensitivity criteria, and that forks/external copies cannot be erased.

## Observable metadata to attach privately (owner)

| Item | Notes |
| --- | --- |
| Repo | `pitsssss/FB_-_IG_Scrapper_Tool` |
| Reason | Remove private customer profile identifiers from Git history |
| `main` rewritten | Yes (clean development clone established afterward) |
| Potentially affected old PRs | **#1–#7** (closed Dependabot PRs predating / based on pre-rewrite tips) |
| Old commit pages accessible | Yes (Commits API returned HTTP 200 for sampled pre-rewrite heads/bases during STEP 3B/3C) |
| PR-ref count (verifiable via `git ls-remote`) | Multiple `refs/pull/*/head` for #1–#11; focus purge request on **#1–#7** pre-rewrite lineage |
| First-changed rewrite commit | Use owner’s private rewrite notes / backup; do not invent if unsure |
| Impact of purge | Removes residual PR diff / commit-page access for objects not on current `main`; does not affect current product code |

## Owner checklist before sending

- [ ] Confirm you still want Support escalation (privacy residual risk acceptance is a separate decision).
- [ ] Attach only SHAs / PR numbers — never the private URLs.
- [ ] Do not open a public GitHub Issue for this content.
- [ ] Expect a possible decline; plan to accept residual risk if Support cannot purge.
