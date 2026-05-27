function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i++;
  }
  return args;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return value;
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "inline-buffer-replay-poc",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function main() {
  const args = parseArgs(process.argv);
  const owner = requireArg(args, "owner");
  const repo = requireArg(args, "repo");
  const pr = requireArg(args, "pr");
  const token = requireArg(args, "token");
  const match = requireArg(args, "match");
  const apiUrl = (args["api-url"] || "https://api.github.com").replace(/\/$/, "");

  const matches = [];
  for (let page = 1; page <= 10; page++) {
    const url =
      `${apiUrl}/repos/${owner}/${repo}/pulls/${pr}/comments` +
      `?per_page=100&page=${page}`;
    const comments = await fetchJson(url, token);
    if (!Array.isArray(comments) || comments.length === 0) {
      break;
    }
    for (const comment of comments) {
      if (typeof comment.body === "string" && comment.body.includes(match)) {
        matches.push(comment);
      }
    }
    if (comments.length < 100) {
      break;
    }
  }

  console.log(`VERIFY_OWNER=${owner}`);
  console.log(`VERIFY_REPO=${repo}`);
  console.log(`VERIFY_PR=${pr}`);
  console.log(`VERIFY_MATCH=${JSON.stringify(match)}`);
  console.log(`FOUND_MATCH=${String(matches.length > 0)}`);
  console.log(`MATCH_COUNT=${matches.length}`);
  console.log(`COMMENT_REPO=${repo}`);
  console.log(`COMMENT_PR=${pr}`);

  if (matches[0]) {
    console.log(`MATCH_COMMENT_ID=${matches[0].id}`);
    console.log(`MATCH_HTML_URL=${matches[0].html_url}`);
    console.log(`MATCH_PATH=${matches[0].path}`);
    console.log(`MATCH_LINE=${matches[0].line}`);
    console.log(`MATCH_BODY=${JSON.stringify(matches[0].body)}`);
  }
}

main().catch((error) => {
  console.error("verify-pr-inline-comment failed:", error);
  process.exit(1);
});
