#!/usr/bin/env node
/**
 * Mini Agent CLI
 *
 * 事件消费方式:
 * - 使用 agent.subscribe() 订阅类型化事件（对齐 pi-agent-core Agent.subscribe）
 * - 流式文本通过 message_delta 事件输出
 * - 工具/生命周期事件通过 switch event.type 处理
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Agent } from "./index.js";
import { resolveSessionKey } from "./session-key.js";
import { getEnvApiKey } from "@mariozechner/pi-ai";

// ============== .env 加载 ==============

function loadEnvFile(dir: string = process.cwd()): void {
  const envPath = path.join(dir, ".env");
  let content: string;
  try {
    content = fs.readFileSync(envPath, "utf-8");
  } catch {
    return; // .env 不存在，跳过
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

// ============== 颜色输出 ==============

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

function color(text: string, c: keyof typeof colors): string {
  return `${colors[c]}${text}${colors.reset}`;
}

let unsubscribe: (() => void) | null = null;

// 跟踪上一次 stdout 输出类型，用于在 thinking→text、event→text 之间插入换行
let lastOutput: "event" | "thinking" | "text" | null = null;

// ============== 主函数 ==============

async function main() {
  const args = process.argv.slice(2);
  const provider = readFlag(args, "--provider") ?? process.env.OPENCLAW_MINI_PROVIDER ?? "anthropic";
  const model = readFlag(args, "--model") ?? process.env.OPENCLAW_MINI_MODEL;
  const baseUrl = readFlag(args, "--base-url") ?? process.env.OPENCLAW_MINI_BASE_URL;
  const apiKey = readFlag(args, "--api-key") ?? getEnvApiKey(provider);
  if (!apiKey) {
    console.error(`错误: 未找到 ${provider} 的 API Key，请设置对应环境变量或使用 --api-key 参数`);
    process.exit(1);
  }

  const agentId =
    readFlag(args, "--agent") ??
    process.env.OPENCLAW_MINI_AGENT_ID ??
    "main";
  const sessionId = resolveSessionIdArg(args) || `session-${Date.now()}`;
  const workspaceDir = process.cwd();
  const sessionKey = resolveSessionKey({ agentId, sessionId });

  console.log(color("\n Mini Agent", "cyan"));
  console.log(color(`Provider: ${provider}${model ? ` (${model})` : ""}`, "dim"));
  console.log(color(`会话: ${sessionKey}`, "dim"));
  console.log(color(`Agent: ${agentId}`, "dim"));
  console.log(color(`目录: ${workspaceDir}`, "dim"));
  console.log(color("输入 /help 查看命令，Ctrl+C 退出\n", "dim"));

  const agent = new Agent({
    apiKey,
    provider,
    ...(model ? { model } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    agentId,
    workspaceDir,
  });

  // 事件订阅（对齐 pi-agent-core: Agent.subscribe → 类型化事件处理）
  unsubscribe = agent.subscribe((event) => {
    switch (event.type) {
      // 核心生命周期
      case "agent_start":
        console.error(color(`\n[event] run start id=${event.runId} model=${event.model}`, "magenta"));
        break;
      case "agent_end":
        console.error(color(`[event] run end id=${event.runId}\n`, "magenta"));
        break;
      case "agent_error":
        console.error(color(`[event] run error id=${event.runId} error=${event.error}\n`, "magenta"));
        break;

      // 流式思考输出
      case "thinking_delta":
        if (lastOutput === "event") process.stdout.write("\n");
        process.stdout.write(color(event.delta, "dim"));
        lastOutput = "thinking";
        break;

      // 流式文本输出
      case "message_delta":
        if (lastOutput === "thinking" || lastOutput === "event") process.stdout.write("\n");
        process.stdout.write(event.delta);
        lastOutput = "text";
        break;
      case "message_end":
        if (lastOutput === "text" || lastOutput === "thinking") process.stdout.write("\n");
        console.error(color(`[event] assistant final chars=${event.text.length}`, "magenta"));
        lastOutput = "event";
        break;

      // 工具事件
      case "tool_execution_start": {
        if (lastOutput === "text" || lastOutput === "thinking") process.stdout.write("\n");
        const input = safePreview(event.args, 120);
        console.error(color(`[event] tool start ${event.toolName}${input ? ` ${input}` : ""}`, "yellow"));
        lastOutput = "event";
        break;
      }
      case "tool_execution_end": {
        // 工具结果可能含换行（如目录列表），压成单行显示
        const preview = event.result.replace(/\n/g, " ").slice(0, 120);
        console.error(color(`[event] tool end ${event.toolName} ${preview}`, "yellow"));
        lastOutput = "event";
        break;
      }
      case "tool_skipped":
        console.error(color(`[event] tool skipped ${event.toolName}`, "yellow"));
        break;

      // Compaction
      case "compaction":
        console.error(
          color(
            `[event] compaction summary_chars=${event.summaryChars} dropped_messages=${event.droppedMessages}`,
            "magenta",
          ),
        );
        break;

      // 子代理
      case "subagent_summary": {
        const label = event.label ? ` (${event.label})` : "";
        console.error(color(`\n[subagent${label}] ${event.summary}\n`, "cyan"));
        break;
      }
      case "subagent_error":
        console.error(color(`\n[subagent] error: ${event.error}\n`, "yellow"));
        break;
    }
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(color("你: ", "green"), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        prompt();
        return;
      }

      // 命令处理
      if (trimmed.startsWith("/")) {
        await handleCommand(trimmed, agent, sessionKey);
        prompt();
        return;
      }

      // 运行 Agent（流式文本通过 subscribe 的 message_delta 事件输出）
      process.stdout.write(color("\nAgent: ", "blue"));
      lastOutput = null;

      try {
        const result = await agent.run(sessionKey, trimmed);

        const summaryParts = [
          `id=${result.runId ?? "unknown"}`,
          `turns=${result.turns}`,
          `tools=${result.toolCalls}`,
          typeof result.memoriesUsed === "number" ? `memories=${result.memoriesUsed}` : "",
          `chars=${result.text.length}`,
        ].filter(Boolean);
        console.log(color(`\n\n  [${summaryParts.join(", ")}]`, "dim"));
      } catch (err) {
        console.error(color(`\n错误: ${(err as Error).message}`, "yellow"));
      }

      console.log();
      prompt();
    });
  };

  prompt();
}

function readFlag(args: string[], name: string): string | undefined {
  const idx = args.findIndex((arg) => arg === name);
  if (idx === -1) {
    return undefined;
  }
  const next = args[idx + 1];
  if (!next || next.startsWith("--")) {
    return undefined;
  }
  return next.trim() || undefined;
}

const FLAGS_WITH_VALUE = new Set(["--agent", "--model", "--provider", "--api-key", "--base-url"]);

function resolveSessionIdArg(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "chat") continue;
    if (FLAGS_WITH_VALUE.has(arg)) { i += 1; continue; }
    if (arg.startsWith("--")) continue;
    return arg.trim() || undefined;
  }
  return undefined;
}

function safePreview(input: unknown, max = 120): string {
  try {
    const text = JSON.stringify(input);
    if (!text) {
      return "";
    }
    return text.length > max ? `${text.slice(0, max)}...` : text;
  } catch {
    return "";
  }
}

async function handleCommand(cmd: string, agent: Agent, sessionKey: string) {
  const [command] = cmd.slice(1).split(" ");

  switch (command) {
    case "help":
      console.log(`
命令:
  /help     显示帮助
  /reset    重置当前会话
  /history  显示会话历史
  /sessions 列出所有会话
  /quit     退出
`);
      break;

    case "reset":
      await agent.reset(sessionKey);
      console.log(color("会话已重置", "green"));
      break;

    case "history": {
      const history = agent.getHistory(sessionKey);
      if (history.length === 0) {
        console.log(color("暂无历史", "dim"));
      } else {
        for (const msg of history) {
          const role = msg.role === "user" ? "你" : "Agent";
          const content =
            typeof msg.content === "string"
              ? msg.content
              : msg.content.map((c) => c.text || `[${c.type}]`).join(" ");
          console.log(`${color(role + ":", role === "你" ? "green" : "blue")} ${content.slice(0, 100)}...`);
        }
      }
      break;
    }

    case "sessions": {
      const sessions = await agent.listSessions();
      if (sessions.length === 0) {
        console.log(color("暂无会话", "dim"));
      } else {
        console.log("会话列表:");
        for (const s of sessions) {
          console.log(`  - ${s}${s === sessionKey ? color(" (当前)", "cyan") : ""}`);
        }
      }
      break;
    }

    case "quit":
    case "exit":
      process.exit(0);

    default:
      console.log(color(`未知命令: ${command}`, "yellow"));
  }
}

// 处理 Ctrl+C
process.on("SIGINT", () => {
  console.log(color("\n\n再见! 👋", "cyan"));
  unsubscribe?.();
  process.exit(0);
});

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
