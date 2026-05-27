import { hostname } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

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

function getBufferLines(bufferPath) {
  try {
    return readFileSync(bufferPath, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot =
    args["repo-root"] ||
    process.env.CCA_REPO_ROOT ||
    "/home/nobcoder/claude/claude-code-action";
  const owner = requireArg(args, "owner");
  const repo = requireArg(args, "repo");
  const pr = requireArg(args, "pr");
  const token = requireArg(args, "token");
  const commentPath = requireArg(args, "path");
  const line = Number(requireArg(args, "line"));
  const body = requireArg(args, "body");
  const side = args.side || "RIGHT";
  const confirmedRaw = args.confirmed;
  const bufferPath = args["buffer-path"] || "/tmp/inline-comments-buffer.jsonl";

  const { Client } = await import(
    pathToFileURL(
      join(
        repoRoot,
        "node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js",
      ),
    ).href,
  );
  const { StdioClientTransport } = await import(
    pathToFileURL(
      join(
        repoRoot,
        "node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js",
      ),
    ).href,
  );
  const { CallToolResultSchema } = await import(
    pathToFileURL(
      join(repoRoot, "node_modules/@modelcontextprotocol/sdk/dist/esm/types.js"),
    ).href,
  );

  const serverPath = join(repoRoot, "src/mcp/github-inline-comment-server.ts");
  const bunfig = join(repoRoot, "bunfig.toml");
  const tsconfig = join(repoRoot, "tsconfig.json");

  const client = new Client(
    { name: "inline-buffer-seed-poc", version: "1.0.0" },
    { capabilities: {} },
  );

  const transport = new StdioClientTransport({
    command: "bun",
    args: [
      "--no-env-file",
      `--config=${bunfig}`,
      `--tsconfig-override=${tsconfig}`,
      "run",
      serverPath,
    ],
    cwd: repoRoot,
    env: {
      ...process.env,
      GITHUB_TOKEN: token,
      REPO_OWNER: owner,
      REPO_NAME: repo,
      PR_NUMBER: String(pr),
      CLASSIFY_INLINE_COMMENTS: "true",
    },
    stderr: "inherit",
  });

  const beforeLines = getBufferLines(bufferPath);

  await client.connect(transport);

  const toolArgs = {
    path: commentPath,
    body,
    line,
    side,
  };

  if (confirmedRaw === "true") {
    toolArgs.confirmed = true;
  } else if (confirmedRaw === "false") {
    toolArgs.confirmed = false;
  }

  const result = await client.callTool(
    {
      name: "create_inline_comment",
      arguments: toolArgs,
    },
    CallToolResultSchema,
  );

  await transport.close();

  const afterLines = getBufferLines(bufferPath);
  const lastLine = afterLines[afterLines.length - 1] || "";
  const parsedLastLine = lastLine ? JSON.parse(lastLine) : null;

  console.log(`HOSTNAME=${hostname()}`);
  console.log(`BUFFER_PATH=${bufferPath}`);
  console.log(`BUFFER_COUNT_BEFORE=${beforeLines.length}`);
  console.log(`BUFFER_COUNT_AFTER=${afterLines.length}`);
  console.log(
    `BUFFER_ENTRY_APPENDED=${String(afterLines.length === beforeLines.length + 1)}`,
  );
  console.log(
    `LAST_ENTRY_MATCHES_BODY=${String(parsedLastLine?.body === body)}`,
  );
  console.log(
    `LAST_ENTRY_MATCHES_PATH=${String(parsedLastLine?.path === commentPath)}`,
  );
  console.log(`LAST_ENTRY_MATCHES_LINE=${String(parsedLastLine?.line === line)}`);
  console.log(`LAST_ENTRY_CONFIRMED=${String(parsedLastLine?.confirmed)}`);
  console.log(`MCP_RESULT=${JSON.stringify(result)}`);
}

main().catch((error) => {
  console.error("inline-buffer-seed-via-mcp failed:", error);
  process.exit(1);
});
