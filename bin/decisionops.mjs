#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { evaluate } from "../src/metrics.mjs";
import { parseJsonl, serializeReport } from "../src/dataset.mjs";

function usage() {
  console.log(`DecisionOps — evaluate, replay, and calibrate typed decisions.

Usage:
  decisionops evaluate <dataset.jsonl> [--threshold 0.70] [--json <report.json>]
  decisionops ui [--port 4317]
  decisionops help

JSONL records use one expected label and one typed model result per line.
See examples/support-triage.jsonl and https://github.com/mionax/decisionops.`);
}

function option(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}

function printPercent(value) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

async function evaluateCommand(args) {
  const file = args.find((value, index) => !value.startsWith("--") && !["--threshold", "--json"].includes(args[index - 1]));
  if (!file) throw new Error("Provide a JSONL dataset path.");
  const threshold = Number(option(args, "--threshold", "0.70"));
  const outputPath = option(args, "--json");
  const records = parseJsonl(await readFile(file, "utf8"));
  const report = evaluate(records, { threshold });
  console.log(`DecisionOps report · ${file}`);
  console.log(`Records           ${report.dataset.records}`);
  console.log(`Accuracy          ${printPercent(report.metrics.accuracy)}`);
  console.log(`Brier score       ${report.metrics.brierScore.toFixed(4)}`);
  console.log(`ECE               ${report.metrics.ece.toFixed(4)}`);
  console.log(`Threshold         ${threshold.toFixed(2)}`);
  console.log(`Coverage          ${printPercent(report.operatingPoint.coverage)} (${report.operatingPoint.accepted}/${report.dataset.records})`);
  console.log(`Selective risk    ${printPercent(report.operatingPoint.selectiveRisk)}`);
  if (outputPath) {
    await writeFile(outputPath, serializeReport(report));
    console.log(`\nReport saved      ${outputPath}`);
  }
  if (report.metrics.classes) {
    console.log("\nClass             Support  Precision  Recall");
    for (const item of report.metrics.classes) {
      console.log(`${item.label.padEnd(18)}${String(item.support).padEnd(9)}${printPercent(item.precision).padEnd(11)}${printPercent(item.recall)}`);
    }
  }
}

async function uiCommand(args) {
  const port = Number(option(args, "--port", "4317"));
  const modulePath = new URL("../scripts/dev.mjs", import.meta.url);
  process.argv = [process.argv[0], modulePath.pathname, "--port", String(port)];
  await import(modulePath.href);
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (command === "help" || command === "--help" || command === "-h") return usage();
  if (command === "evaluate" || command === "replay") return evaluateCommand(args);
  if (command === "ui") return uiCommand(args);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`decisionops: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
