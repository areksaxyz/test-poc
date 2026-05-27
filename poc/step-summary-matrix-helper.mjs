import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

function detectContentType(content) {
  const contentStr = String(content).trim();
  if (contentStr.startsWith("{") && contentStr.endsWith("}")) {
    try {
      JSON.parse(contentStr);
      return "json";
    } catch {}
  }
  if (contentStr.startsWith("[") && contentStr.endsWith("]")) {
    try {
      JSON.parse(contentStr);
      return "json";
    } catch {}
  }
  return "text";
}

function formatResultContent(content) {
  if (!content) return "*(No output)*\n\n";

  let contentStr;
  try {
    let parsedContent;
    if (typeof content === "string") {
      parsedContent = JSON.parse(content);
    } else {
      parsedContent = content;
    }

    if (
      Array.isArray(parsedContent) &&
      parsedContent.length > 0 &&
      typeof parsedContent[0] === "object" &&
      parsedContent[0]?.type === "text"
    ) {
      contentStr = parsedContent[0]?.text || "";
    } else {
      contentStr = String(content).trim();
    }
  } catch {
    contentStr = String(content).trim();
  }

  if (contentStr.length > 3000) {
    contentStr = `${contentStr.substring(0, 2997)}...`;
  }

  const contentType = detectContentType(contentStr);
  if (
    contentType === "text" &&
    contentStr.length < 100 &&
    !contentStr.includes("\n")
  ) {
    return `**→** ${contentStr}\n\n`;
  }
  return `**Result:**\n\`\`\`${contentType}\n${contentStr}\n\`\`\`\n\n`;
}

function formatTurnsFromData(data) {
  const toolResultsMap = new Map();

  for (const turn of data) {
    if (turn.type === "user") {
      for (const item of turn.message?.content || []) {
        if (item.type === "tool_result" && item.tool_use_id) {
          toolResultsMap.set(item.tool_use_id, {
            type: item.type,
            tool_use_id: item.tool_use_id,
            content: item.content,
            is_error: item.is_error,
          });
        }
      }
    }
  }

  let markdown = "## Claude Code Report\n\n";

  for (const turn of data) {
    if (turn.type === "assistant") {
      const message = turn.message || { content: [] };
      for (const item of message.content || []) {
        if (item.type === "text" && item.text?.trim()) {
          markdown += `${item.text}\n\n`;
        }
        if (item.type === "tool_use") {
          const toolResult = item.id ? toolResultsMap.get(item.id) : undefined;
          markdown += `### 🔧 \`${item.name || "unknown_tool"}\`\n\n`;
          if (item.input && Object.keys(item.input).length > 0) {
            markdown += "**Parameters:**\n```json\n";
            markdown += JSON.stringify(item.input, null, 2);
            markdown += "\n```\n\n";
          }
          if (toolResult && !toolResult.is_error) {
            markdown += formatResultContent(toolResult.content);
          }
        }
      }
      markdown += "---\n\n";
    } else if (turn.type === "result") {
      markdown += "## ✅ Final Result\n\n";
      if (turn.result) {
        markdown += `${turn.result}\n\n`;
      }
    }
  }

  return markdown;
}

function sanitizeSdkOutput(message, showFullOutput) {
  if (showFullOutput) {
    return JSON.stringify(message, null, 2);
  }

  if (message.type === "system" && message.subtype === "init") {
    return JSON.stringify(
      {
        type: "system",
        subtype: "init",
        message: "Claude Code initialized",
        model: "model" in message ? message.model : "unknown",
      },
      null,
      2,
    );
  }

  if (message.type === "result") {
    return JSON.stringify(
      {
        type: "result",
        subtype: message.subtype,
        is_error: message.is_error,
        duration_ms: message.duration_ms,
        num_turns: message.num_turns,
        total_cost_usd: message.total_cost_usd,
        permission_denials_count: message.permission_denials?.length ?? 0,
      },
      null,
      2,
    );
  }

  return null;
}

const args = parseArgs(process.argv);
const secretMarker =
  args["secret-marker"] || `STEP-SUMMARY-SECRET-${Date.now().toString(16)}`;
const showFullOutput = args["show-full-output"] === "true";
const displayReport = args["display-report"] === "true";
const runnerTemp = args["runner-temp"] || process.env.RUNNER_TEMP || "/tmp";
const summaryFile = args["summary-file"] || process.env.GITHUB_STEP_SUMMARY;
const sameStepSummaryCaptureFile =
  args["same-step-summary-capture-file"] ||
  join(runnerTemp, "github-step-summary-same-step.md");
const executionFile =
  args["execution-file"] || join(runnerTemp, "claude-execution-output.json");
const stdoutCaptureFile =
  args["stdout-capture-file"] ||
  join(runnerTemp, "claude-sanitized-stdout.txt");

mkdirSync(dirname(executionFile), { recursive: true });
mkdirSync(dirname(stdoutCaptureFile), { recursive: true });
if (summaryFile) {
  mkdirSync(dirname(summaryFile), { recursive: true });
}
mkdirSync(dirname(sameStepSummaryCaptureFile), { recursive: true });

const transcript = [
  {
    type: "system",
    subtype: "init",
    session_id: "session-step-summary-matrix",
    model: "claude-haiku-test",
  },
  {
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          id: "toolu_secret",
          name: "Bash",
          input: {
            command: "printenv SECRET_VALUE",
          },
        },
      ],
    },
  },
  {
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_secret",
          content: `SECRET_VALUE=${secretMarker}`,
          is_error: false,
        },
      ],
    },
  },
  {
    type: "result",
    subtype: "success",
    duration_ms: 1000,
    num_turns: 1,
    total_cost_usd: 0.01,
    result: "done",
  },
];

writeFileSync(executionFile, JSON.stringify(transcript, null, 2), "utf8");

const sanitizedStdout = transcript
  .map((message) => sanitizeSdkOutput(message, showFullOutput))
  .filter(Boolean)
  .join("\n");
writeFileSync(stdoutCaptureFile, sanitizedStdout, "utf8");

const formattedSummary = formatTurnsFromData(transcript);
if (displayReport && summaryFile) {
  appendFileSync(summaryFile, formattedSummary);
}

const rawExecution = readFileSync(executionFile, "utf8");
const stdoutCapture = readFileSync(stdoutCaptureFile, "utf8");
const stepSummaryContent =
  displayReport && summaryFile ? readFileSync(summaryFile, "utf8") : "";
writeFileSync(sameStepSummaryCaptureFile, stepSummaryContent, "utf8");

console.log(`SHOW_FULL_OUTPUT=${String(showFullOutput)}`);
console.log(`DISPLAY_REPORT=${String(displayReport)}`);
console.log(`SECRET_MARKER=${secretMarker}`);
console.log(`EXECUTION_FILE_PATH=${executionFile}`);
console.log(`STDOUT_CAPTURE_FILE=${stdoutCaptureFile}`);
if (summaryFile) {
  console.log(`GITHUB_STEP_SUMMARY_FILE=${summaryFile}`);
}
console.log(`SAME_STEP_SUMMARY_CAPTURE_FILE=${sameStepSummaryCaptureFile}`);
console.log(
  `EXECUTION_FILE_RAW_CONTAINS_SECRET=${String(rawExecution.includes(secretMarker))}`,
);
console.log(
  `STDOUT_CONTAINS_SECRET=${String(stdoutCapture.includes(secretMarker))}`,
);
console.log(
  `FORMATTED_SUMMARY_CONTAINS_SECRET=${String(formattedSummary.includes(secretMarker))}`,
);
console.log(
  `GITHUB_STEP_SUMMARY_CONTAINS_SECRET=${String(stepSummaryContent.includes(secretMarker))}`,
);
console.log(
  `ACTIONS_RUN_SUMMARY_VISIBLE_CONTAINS_SECRET=${displayReport ? "manual-check-required" : "false"}`,
);
