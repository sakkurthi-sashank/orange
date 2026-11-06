# Technical note

## Key decisions

**A supervisor graph, not a chain.** The orchestrator keeps a task graph in shared LangGraph state. Ready tasks fan out to specialists in parallel through `Send`, and reducers merge their concurrent writes. The critic can send work back to the orchestrator, so the evidence decides how many rounds run.

**Code checks the evidence; the model isn't trusted.** Every tool call is logged with an ID that agents must cite. Code assigns evidence IDs, drops invented citations, and downgrades unbacked "facts" to inferences. The final report is assembled from state, so every reference in it resolves.

**The critic combines fixed rules with judgment.** Before the critic model reviews, a rule-based audit caps confidence for hypotheses that blame a change made after detection, rest only on past incidents, name an unknown service, are contradicted by verified facts, or have failed queries about the suspect. Both systems share one status rule: a root cause is "identified" only at ≥0.6 confidence with a ≥0.15 lead over the runner-up; otherwise the result is "inconclusive".

**Failures are part of the design.** Tools inject timeouts, errors and partial data, and agents are crashed deliberately. Every agent has bounded retries and a deterministic fallback. Hard limits on rounds, tasks, tool calls, tokens and time guarantee termination.

**The model layer is provider-neutral.** Agents call a small `LlmClient` interface, backed by the OpenAI Responses API (`gpt-5-mini`, strict schemas, `store: false`). Tests swap in a scripted client.

## Trade-offs

- **Thoroughness costs money.** The multi-agent system used about 6× the tokens and 3.7× the time of the baseline.
- **Caution trades against hit rate.** Confidence caps prevented overconfident answers (0 versus the baseline's 1), but also turned one correct finding into "inconclusive" (S05).
- **Simulated data is easy to score but unrealistic.** It's reproducible and gradable, but far smaller and cleaner than real telemetry.
- **Jobs live in memory.** That keeps the API simple, but jobs are lost on restart.

## Limitations

- **The evaluation is small:** one trial, 12 incidents, one model, so one scenario shifts accuracy about 8 points. The baseline was more accurate on this run (92% vs 75%). A schema bug caused two multi-agent misses; the fix was verified only on those two.
- **Scoring uses regex patterns**, so unusually worded correct answers can be marked wrong.
- **Grounding checks are shallow:** they confirm cited calls exist and succeeded, not that claims match the tool output.
- **The multi-agent system over-explores**, nearly exhausting its 45-call tool budget every run.

## Potential improvements

1. Re-run the full evaluation with several trials and report variance.
2. Go hybrid: one agent investigates first, and the full team joins only when the audit or critic finds conflicting or weak evidence. This combines the baseline's efficiency with multi-agent calibration.
3. Add an LLM judge alongside regex scoring, and check each claim against the tool output it cites.
4. Connect real sources (metrics, logs, deploy history) behind the existing tool interface, and store jobs persistently.
