const DEFAULT_BINS = 10;

function divide(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function brier(record) {
  return Object.entries(record.probabilities).reduce((sum, [option, probability]) => {
    const target = String(record.label) === option ? 1 : 0;
    return sum + (probability - target) ** 2;
  }, 0);
}

function calibration(records, binCount = DEFAULT_BINS) {
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lower: index / binCount,
    upper: (index + 1) / binCount,
    count: 0,
    confidenceSum: 0,
    correct: 0,
  }));
  for (const record of records) {
    const index = Math.min(binCount - 1, Math.floor(record.confidence * binCount));
    const bin = bins[index];
    bin.count += 1;
    bin.confidenceSum += record.confidence;
    if (record.predicted === record.label) bin.correct += 1;
  }
  const total = records.length;
  const ece = bins.reduce((sum, bin) => {
    if (!bin.count) return sum;
    return sum + (bin.count / total) * Math.abs(bin.confidenceSum / bin.count - bin.correct / bin.count);
  }, 0);
  return {
    ece,
    bins: bins.map((bin) => ({
      lower: bin.lower,
      upper: bin.upper,
      count: bin.count,
      confidence: divide(bin.confidenceSum, bin.count),
      accuracy: divide(bin.correct, bin.count),
    })),
  };
}

function classMetrics(records) {
  const labels = [...new Set(records.flatMap((record) => [String(record.label), ...Object.keys(record.probabilities)]))].sort();
  return labels.map((label) => {
    const support = records.filter((record) => String(record.label) === label).length;
    const predicted = records.filter((record) => String(record.predicted) === label).length;
    const truePositive = records.filter((record) => String(record.label) === label && String(record.predicted) === label).length;
    return {
      label,
      support,
      predicted,
      precision: divide(truePositive, predicted),
      recall: divide(truePositive, support),
    };
  });
}

export function evaluate(records, { threshold = 0.7, bins = DEFAULT_BINS } = {}) {
  if (!Array.isArray(records) || records.length === 0) throw new Error("Cannot evaluate an empty dataset.");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error("Threshold must be between 0 and 1.");

  const accepted = records.filter((record) => record.confidence >= threshold);
  const correctCount = records.filter((record) => record.predicted === record.label).length;
  const selectiveCorrect = accepted.filter((record) => record.predicted === record.label).length;
  const choiceRecords = records.filter((record) => record.type === "choice");
  const binaryRecords = records.filter((record) => record.type === "noul");
  const calibrationResult = calibration(records, bins);
  const confusion = Object.create(null);
  for (const record of choiceRecords) {
    const actual = String(record.label);
    const predicted = String(record.predicted);
    confusion[actual] ??= Object.create(null);
    confusion[actual][predicted] = (confusion[actual][predicted] ?? 0) + 1;
  }

  const thresholds = Array.from({ length: 10 }, (_, index) => 0.5 + index * 0.05).map((value) => {
    const included = records.filter((record) => record.confidence >= value);
    const misses = included.filter((record) => record.predicted !== record.label).length;
    return { threshold: Number(value.toFixed(2)), accepted: included.length, coverage: included.length / records.length, selectiveRisk: divide(misses, included.length) };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    dataset: { records: records.length, choiceRecords: choiceRecords.length, noulRecords: binaryRecords.length },
    operatingPoint: {
      threshold,
      accepted: accepted.length,
      coverage: accepted.length / records.length,
      selectiveRisk: divide(accepted.length - selectiveCorrect, accepted.length),
    },
    metrics: {
      accuracy: correctCount / records.length,
      brierScore: records.reduce((sum, record) => sum + brier(record), 0) / records.length,
      ece: calibrationResult.ece,
      meanConfidence: records.reduce((sum, record) => sum + record.confidence, 0) / records.length,
      ...(binaryRecords.length ? {
        noulBrierScore: binaryRecords.reduce((sum, record) => sum + brier(record), 0) / binaryRecords.length,
      } : {}),
      ...(choiceRecords.length ? { classes: classMetrics(choiceRecords), confusion } : {}),
    },
    calibration: calibrationResult.bins,
    thresholdSweep: thresholds,
    examples: records.map(({ line: _line, ...record }) => ({ ...record, correct: record.predicted === record.label, accepted: record.confidence >= threshold })),
  };
}

export function thresholdSummary(report, threshold) {
  const examples = report.examples.map((record) => ({ ...record, accepted: record.confidence >= threshold }));
  const accepted = examples.filter((record) => record.accepted);
  const errors = accepted.filter((record) => !record.correct).length;
  return {
    threshold,
    accepted: accepted.length,
    coverage: accepted.length / examples.length,
    selectiveRisk: accepted.length ? errors / accepted.length : null,
    examples,
  };
}

export function formatNumber(value, digits = 1) {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}
