# Contributing

Thanks for helping make model decisions easier to inspect. Small, focused changes are easiest to review.

## Before opening a pull request

- Describe the user problem and a concrete example dataset or decision it affects.
- Keep the evaluation core model- and provider-agnostic.
- Do not add network calls, telemetry, or upload paths to the local workbench.
- Avoid adding dependencies unless the capability cannot reasonably be implemented with the platform APIs.
- Run `npm run check` and include the command's result in your pull request.
- For metric changes, explain the definition and how an operator should interpret it; do not present a descriptive score as a production guarantee.

Please do not include customer data, credentials, or private decision logs in issues, pull requests, screenshots, or example fixtures. Synthetic or properly anonymized examples are best.
