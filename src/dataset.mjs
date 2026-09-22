const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function fail(line, message) {
  throw new Error(`Line ${line}: ${message}`);
}

function readProbabilities(value, line) {
  if (!isRecord(value) || Object.keys(value).length < 2) {
    fail(line, "predictions need a probabilities object with at least two options");
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

function readConfidence(value, fallback, line) {
  const confidence = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    fail(line, "confidence must be between 0 and 1");
  }
  return confidence;
}

function normalizeRecord(raw, line) {
  if (!isRecord(raw)) fail(line, "record must be a JSON object");
  const id = String(raw.id ?? `row-${line}`).trim();
  const label = raw.label ?? raw.expected;
  const result = raw.result ?? raw.prediction ?? raw.answer;
  const type = String(raw.type ?? result?.type ?? raw.question?.type ?? "choice").toLowerCase();
  if (label === undefined) fail(line, "missing expected label (use \"label\")");
  if (!isRecord(result) && typeof result !== "number") fail(line, "missing prediction result");

  if (type === "choice") {
    const probabilities = readProbabilities(result.probabilities, line);
    const predicted = String(result.choice ?? result.predicted ?? argmax(probabilities));
    if (!Object.hasOwn(probabilities, predicted)) fail(line, `predicted option \"${predicted}\" is missing from probabilities`);
    if (!Object.hasOwn(probabilities, String(label))) fail(line, `expected option \"${label}\" is missing from probabilities`);
    return { id, type, label: String(label), predicted, confidence: readConfidence(result.confidence, probabilities[predicted], line), confidenceSource: result.confidence === undefined ? "derived" : "model", probabilities, line };
  }

  if (type === "score") {
    const probabilities = readProbabilities(result.probabilities, line);
    const levelIds = Object.keys(probabilities).map(Number).sort((a, b) => a - b);
    if (levelIds.length > 10) fail(line, "score criteria support up to 10 levels");
    if (levelIds.some((level, index) => !Number.isInteger(level) || level !== index)) {
      fail(line, "score probability keys must be consecutive level numbers starting at 0");
    }
    const expected = Number(label);
    if (!Number.isInteger(expected) || !Object.hasOwn(probabilities, String(expected))) {
      fail(line, "score label must be an integer level present in probabilities");
    }
    const weightedScore = Object.entries(probabilities).reduce((sum, [level, probability]) => sum + Number(level) * probability, 0);
    const score = Number(result.score ?? weightedScore);
    if (!Number.isFinite(score) || score < 0 || score > levelIds.length - 1) {
      fail(line, `score must be between 0 and ${levelIds.length - 1}`);
    }
    const predictedLevel = Math.round(score);
    return {
      id, type, label: expected, predicted: score, predictedLevel, score,
      confidence: readConfidence(result.confidence, Math.max(...Object.values(probabilities)), line),
      confidenceSource: result.confidence === undefined ? "derived" : "model",
      probabilities, legend: result.legend ?? Object.fromEntries(levelIds.map((level) => [level, String(level)])), line,
    };
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
      confidenceSource: "derived",
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
