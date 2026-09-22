const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function fail(line, message) {
  throw new Error(`Line ${line}: ${message}`);
}

function readProbabilities(value, line) {
  if (!isRecord(value) || Object.keys(value).length < 2) {
    fail(line, "choice predictions need a probabilities object with at least two options");
  }
  const entries = Object.entries(value).map(([key, probability]) => {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      fail(line, `probability for \"${key}\" must be between 0 and 1`);
    }
    return [key, probability];
  });
  const total = entries.reduce((sum, [, probability]) => sum + probability, 0);
  if (total <= 0 || Math.abs(total - 1) > 0.03) {
    fail(line, `choice probabilities must sum to 1 (received ${total.toFixed(4)})`);
  }
  return Object.fromEntries(entries.map(([key, probability]) => [key, probability / total]));
}

function argmax(probabilities) {
  return Object.entries(probabilities).reduce((best, current) =>
    current[1] > best[1] ? current : best)[0];
}

function normalizeRecord(raw, line) {
  if (!isRecord(raw)) fail(line, "record must be a JSON object");
  const id = String(raw.id ?? `row-${line}`).trim();
  const type = String(raw.type ?? raw.question?.type ?? "choice").toLowerCase();
  const label = raw.label ?? raw.expected;
  const result = raw.result ?? raw.prediction ?? raw.answer;
  if (label === undefined) fail(line, "missing expected label (use \"label\")");
  if (!isRecord(result) && typeof result !== "number") fail(line, "missing prediction result");

  if (type === "choice") {
    const probabilities = readProbabilities(result.probabilities, line);
    const predicted = String(result.choice ?? result.predicted ?? argmax(probabilities));
    if (!(predicted in probabilities)) fail(line, `predicted option \"${predicted}\" is missing from probabilities`);
    if (!(String(label) in probabilities)) fail(line, `expected option \"${label}\" is missing from probabilities`);
    if (!Object.hasOwn(probabilities, predicted)) fail(line, "predicted option must exist in the probability map");
    if (!Object.hasOwn(probabilities, String(label))) fail(line, "expected label must exist in the probability map");
    return { id, type, label: String(label), predicted, confidence: probabilities[predicted], probabilities, line };
  }

  if (type === "noul" || type === "binary") {
    const positiveProbability = typeof result === "number" ? result : Number(result.noul ?? result.probability);
    if (!Number.isFinite(positiveProbability) || positiveProbability < 0 || positiveProbability > 1) {
      fail(line, "noul result needs a probability between 0 and 1");
    }
    if (typeof label !== "boolean" && label !== 0 && label !== 1 && label !== "true" && label !== "false") {
      fail(line, "noul label must be true or false");
    }
    const expected = label === true || label === 1 || label === "true";
    return {
      id, type: "noul", label: expected, predicted: positiveProbability >= 0.5,
      confidence: Math.max(positiveProbability, 1 - positiveProbability),
      probabilities: { false: 1 - positiveProbability, true: positiveProbability },
      line,
    };
  }

  fail(line, `unsupported decision type \"${type}\" (supported: choice, noul)`);
}

export function parseJsonl(text) {
  const records = [];
  const errors = [];
  for (const [index, source] of String(text).split(/\r?\n/).entries()) {
    if (!source.trim() || source.trimStart().startsWith("#")) continue;
    try {
      records.push(normalizeRecord(JSON.parse(source), index + 1));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Line ${index + 1}: invalid record`);
    }
  }
  if (!records.length && !errors.length) errors.push("No JSONL records found.");
  if (errors.length) throw new Error(errors.slice(0, 8).join("\n") + (errors.length > 8 ? `\n…and ${errors.length - 8} more errors` : ""));
  return records;
}

export function serializeReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
