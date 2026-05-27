# Live Owned-Repo Evidence Guide for Inline Buffer Replay

This is the stronger optional evidence path for the `claude-code-action` global inline-comment buffer replay bug.

The goal is to prove, on repositories you control:

1. Run A on `repo-a` buffers a comment through the real Anthropic MCP inline-comment server.
2. The stale buffer remains on the same non-ephemeral self-hosted runner host.
3. Run B on `repo-b` replays that stale buffered content into `repo-b` PR `#2` using Run B's current `GITHUB_TOKEN`.
4. GitHub API output or a screenshot proves the comment actually appears on `repo-b` PR `#2`.

## Files

- Buffer through real MCP path: [inline-buffer-seed-via-mcp.mjs](/home/nobcoder/claude/poc/inline-buffer-seed-via-mcp.mjs:1)
- Verify comment exists on PR: [verify-pr-inline-comment.mjs](/home/nobcoder/claude/poc/verify-pr-inline-comment.mjs:1)
- Repo A workflow template: [repo-a-seed-buffer.yml](/home/nobcoder/claude/poc/live-owned-repo-workflows/repo-a-seed-buffer.yml:1)
- Repo B workflow template: [repo-b-replay-buffer.yml](/home/nobcoder/claude/poc/live-owned-repo-workflows/repo-b-replay-buffer.yml:1)

## Preconditions

- Two repositories you own, `repo-a` and `repo-b`
- One open PR in each repository
- A shared self-hosted runner setup
- The same runner label must resolve to the same non-ephemeral host for both runs
- Commit this live-evidence kit into both owned repos, preserving:
  - `poc/inline-buffer-seed-via-mcp.mjs`
  - `poc/verify-pr-inline-comment.mjs`
  - the workflow YAML you choose to use

If your repos are public:

- keep these workflows `workflow_dispatch` only
- keep permissions minimal:
  - `contents: read`
  - `pull-requests: write`
- do not leave the helper branch around longer than needed
- preferably use a temporary private branch or temporary testing repo you control, then delete it after evidence capture

Important:

- If the label points to a pool with multiple hosts, this evidence becomes nondeterministic.
- For clean evidence, temporarily ensure the label maps to exactly one runner host, or drain the pool until only one host is active.

## Runner proof you should capture

From both workflows, keep:

- `RUNNER_NAME=...`
- `HOSTNAME=...`
- `RUNNER_TEMP=...`
- `BUFFER_BEFORE=...`
- `BUFFER_AFTER=...`
- `BUFFER_SHA256_BEFORE_REPLAY=...`
- `BUFFER_SHA256_AFTER_REPLAY=...`

The strongest evidence is when Run A and Run B show the same hostname.

## Repo A setup

Use:

- [repo-a-seed-buffer.yml](/home/nobcoder/claude/poc/live-owned-repo-workflows/repo-a-seed-buffer.yml:1)

Before using it:

- replace `YOUR_SHARED_RUNNER_LABEL`
- keep the pinned `claude-code-action` ref unless you want to test a different vulnerable commit
- keep `poc/inline-buffer-seed-via-mcp.mjs` present in `repo-a`

Dispatch it with:

- `target_pr`: PR number in `repo-a`
- `body_marker`: optional; leave blank to auto-generate a unique marker per run
- `comment_path`: buffered target path; default `README.md`
- `comment_line`: buffered target line; default `1`

The default token-safe marker format is:

```text
LIVE-REPLAY-SEED-${GITHUB_RUN_ID}-${GITHUB_REPOSITORY}
```

Expected output:

- same runner identity fields you will later compare with Run B
- `RUN_A_UNIQUE_BODY=...`
- `BUFFERED_COMMENT_PATH=...`
- `BUFFERED_COMMENT_LINE=...`
- `BUFFER_ENTRY_APPENDED=true`
- `LAST_ENTRY_MATCHES_BODY=true`

This run does not post a comment. It only creates a buffered inline-comment entry through the real MCP server path.

## Repo B setup

Use:

- [repo-b-replay-buffer.yml](/home/nobcoder/claude/poc/live-owned-repo-workflows/repo-b-replay-buffer.yml:1)

Before using it:

- replace `YOUR_SHARED_RUNNER_LABEL` with the exact same label used in `repo-a`
- keep `poc/verify-pr-inline-comment.mjs` present in `repo-b`

Dispatch it with:

- `target_pr`: PR number in `repo-b`
- `expected_body_marker`: the exact `RUN_A_UNIQUE_BODY` value from Run A

Important:

- the open PR in `repo-b` must modify the exact `BUFFERED_COMMENT_PATH` and make `BUFFERED_COMMENT_LINE` commentable on the `RIGHT` side
- if you keep defaults, make the `repo-b` PR modify `README.md` line 1

Expected output:

- same `RUNNER_NAME` / `HOSTNAME` as Run A
- `RUNNER_TEMP=...`
- `RUN_B_EXPECTED_BODY=...`
- `BUFFER_SHA256_BEFORE_REPLAY=...`
- `BUFFER_SHA256_AFTER_REPLAY=...`
- `Found 1 buffered inline comment(s)`
- `Posting 1 classified-as-real comment(s)`
- `FOUND_MATCH=true`
- `COMMENT_REPO=<repo-b>`
- `COMMENT_PR=<pr-b>`
- `MATCH_COMMENT_ID=...`
- `MATCH_HTML_URL=...`

That is the live-owned-repo proof that stale data from `repo-a` was replayed into `repo-b`'s PR using `repo-b`'s current-run token.

## Practical setup for empty repos

Because both `areksaxyz/test-poc` and `triguardai/test-poc` are currently empty, the easiest setup is:

1. Create an initial `main` commit in both repos with a `README.md`.
2. In `repo-a`, create a throwaway PR branch. The PR only needs to exist; Run A will buffer and will not post.
3. In `repo-b`, create a PR branch that changes `README.md` line 1.
4. Use the default `comment_path=README.md` and `comment_line=1`.

That keeps the live demo simple and ensures the replayed inline comment has a valid sink in `repo-b`.

## Minimal evidence bundle to keep

- workflow logs from Run A and Run B
- output showing the same runner hostname
- output showing buffer existence before or after Run B
- verifier output from [verify-pr-inline-comment.mjs](/home/nobcoder/claude/poc/verify-pr-inline-comment.mjs:1)
- one screenshot of the injected inline comment on `repo-b` PR `#2`

## Suggested wording for the live-evidence section

Use language like:

- Run A on owned `repo-a` buffered the marker through Anthropic's real `github-inline-comment-server.ts` path
- Run B on owned `repo-b` ran on the same self-hosted runner host and invoked Anthropic's real `post-buffered-inline-comments.ts` entrypoint
- Run B posted the stale marker into `repo-b` PR `#2` using Run B's `GITHUB_TOKEN`
- GitHub API verification returned `FOUND_MATCH=true` and the comment `html_url`

## Cleanup

After capturing evidence:

- remove the comment from `repo-b` if you do not want it to remain visible
- delete `/tmp/inline-comments-buffer.jsonl` on the runner host

Example cleanup on the runner:

```bash
rm -f /tmp/inline-comments-buffer.jsonl
```
