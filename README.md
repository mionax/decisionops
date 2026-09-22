# DecisionOps

**Know when to trust a model decision.**

DecisionOps is a local-first workbench for evaluating structured model decisions against known outcomes. Inspect confidence, calibration, errors, and the coverage-versus-risk trade-off before you automate the next step.

It is deliberately model-agnostic: bring a JSONL file from a classifier, router, moderation system, support workflow, or other system that emits typed decisions. No API key, model call, account, or telemetry is needed.

## Try it

Requires Node.js 20 or newer. There are no runtime dependencies.

```bash
git clone https://github.com/mionax/decisionops.git
cd decisionops
node bin/decisionops.mjs ui
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The included support-triage dataset is synthetic and clearly labeled in the UI. To evaluate your own records, choose **Load JSONL** or run:

```bash
node bin/decisionops.mjs evaluate path/to/decisions.jsonl --threshold 0.70
node bin/decisionops.mjs evaluate path/to/decisions.jsonl --threshold 0.70 --json report.json
```

The browser workbench reads the selected file locally. It makes no model or third-party requests; the optional report export is created in your browser.

## What you can inspect

- **Accuracy** — share of decisions whose predicted class matches the expected label.
- **Brier score** — mean squared error across the predicted class probabilities; lower is better.
- **Calibration** — expected calibration error (ECE) in ten confidence bins, plus a reliability curve. Confidence is the chosen class's probability for Choice records and the larger class probability for Noul records.
- **Confidence gate** — move the threshold and see how many decisions would be accepted, the resulting coverage, and the errors among accepted decisions (selective risk).
- **Decision ledger** — filter errors and low-confidence cases, inspect each probability distribution, and export a machine-readable report.

These are descriptive metrics, not a guarantee of future performance. ECE depends on binning, and small or shifted datasets can be misleading. Use a representative holdout set and review the false accepts before using a threshold in production.

## JSONL format

One JSON object per line. Blank lines and lines beginning with `#` are ignored. The expected outcome goes in `label` (or `expected`). The model output goes in `result` (or `prediction`).

### Choice

For a multi-class decision, include a probability for every class. Probabilities may differ from a total of 1 by at most 0.03 to allow rounding; DecisionOps normalizes them. `choice` is optional and defaults to the highest-probability class.

```json
{"id":"ticket-001","type":"choice","label":"billing","result":{"choice":"billing","probabilities":{"billing":0.91,"shipping":0.06,"technical":0.03}}}
```

### Noul (binary)

`noul` is a binary yes/no decision. The result is the probability of `true`; the predicted label switches at 0.5. The `binary` type is accepted as an alias.

```json
{"id":"review-001","type":"noul","label":true,"result":{"noul":0.92}}
```

A bare numeric result is also accepted for Noul, for example `"result":0.92`. Labels may be JSON booleans or `0`/`1`.

## Command line

```text
decisionops evaluate <dataset.jsonl> [--threshold 0.70] [--json <report.json>]
decisionops replay <dataset.jsonl> [--threshold 0.70] [--json <report.json>]
decisionops ui [--port 4317]
decisionops help
```

`replay` is an alias for evaluating recorded decisions; it does not call or rerun a model. The UI server binds to loopback, serves only the app and its bundled sample/code, and rejects cross-origin requests.

## Develop

```bash
npm run dev
npm run check
```

The evaluation core is dependency-free JavaScript in `src/metrics.mjs`; JSONL normalization is in `src/dataset.mjs`. The same modules power the CLI and browser workbench.

## Where it can go

The useful next steps are adapters for common evaluation datasets, model/prompt version comparisons, cost-aware acceptance policies, and uncertainty intervals. A hosted team workflow could be explored later, but local evaluation remains useful on its own and should never require uploading a dataset.

Contributions and concrete dataset-format requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).
