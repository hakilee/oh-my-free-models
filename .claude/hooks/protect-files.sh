#!/usr/bin/env bash
set -euo pipefail

# Lightweight guardrail for Claude-driven mutations. It blocks direct file-edit
# tools for protected paths and common Bash write commands that target those
# paths. It is not a replacement for reviewing arbitrary shell commands.
node -e '
const fs = require("fs");
const path = require("path");

function block(message) {
  console.error(`Blocked: ${message}`);
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  block("malformed Claude hook input");
}

const toolName = parsed.tool_name || "";
const toolInput = parsed.tool_input || {};
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function normalizePath(filePath) {
  let normalized = String(filePath).replace(/\\/g, "/");
  const normalizedProject = projectDir.replace(/\\/g, "/").replace(/\/$/, "");

  if (path.posix.isAbsolute(normalized) && normalized.startsWith(`${normalizedProject}/`)) {
    normalized = normalized.slice(normalizedProject.length + 1);
  }

  normalized = path.posix.normalize(normalized).replace(/^\.\//, "");
  return normalized === "." ? "" : normalized;
}

function protectedReason(filePath) {
  const normalized = normalizePath(filePath);
  const parts = normalized.split("/").filter(Boolean);
  const basename = parts[parts.length - 1] || "";

  if (parts.some((part) => part === ".git")) return ".git/";
  if (parts.some((part) => part === "node_modules")) return "node_modules/";
  if (parts.some((part) => part === "dist")) return "dist/";
  if (parts.some((part) => part === ".oh-my-free-models")) return ".oh-my-free-models/";
  if (basename === "package-lock.json") return "package-lock.json";
  if (parts.some((part) => part === ".env" || part.startsWith(".env."))) return ".env*";

  return "";
}

function commandMentionsProtectedPath(command) {
  return [
    /(^|[\s"`'"'"'=:/])\.env($|[\s"`'"'"'/:._-])/,
    /(^|[\s"`'"'"'=:/])package-lock\.json($|[\s"`'"'"';|&])/,
    /(^|[\s"`'"'"'=:/])(\.git|node_modules|dist|\.oh-my-free-models)($|[\s"`'"'"'/;|&])/
  ].some((pattern) => pattern.test(command));
}

function isWriteLikeCommand(command) {
  return /(^|[;&|]\s*)(rm|mv|cp|touch|mkdir|sed\s+-i|perl\s+-pi|tee|truncate|dd|install)\b/.test(command)
    || /(^|[^<])>>?/.test(command)
    || /\b(npm\s+(i|install|add|uninstall|remove|rm|update)|pnpm\s+(i|install|add|remove|rm|update)|yarn\s+(add|install|remove|upgrade|up))\b/.test(command);
}

if (toolName === "Bash") {
  const command = toolInput.command;
  if (typeof command !== "string") block("Bash hook input is missing tool_input.command");

  if (/\b(npm\s+(i|install|add|uninstall|remove|rm|update)|pnpm\s+(i|install|add|remove|rm|update)|yarn\s+(add|install|remove|upgrade|up))\b/.test(command)) {
    block("Bash dependency mutation can change package-lock.json or node_modules/");
  }

  if (commandMentionsProtectedPath(command) && isWriteLikeCommand(command)) {
    block("Bash command may mutate a protected path");
  }

  process.exit(0);
}

const filePath = toolInput.file_path;
if (typeof filePath !== "string") {
  block(`${toolName || "matched tool"} hook input is missing tool_input.file_path`);
}

const reason = protectedReason(filePath);
if (reason) block(`${filePath} matches protected path ${reason}`);

process.exit(0);
'
