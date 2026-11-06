# Evaluation results

The multi-agent system and the single-agent baseline, run live on all 12 test incidents.

- **Model:** `gpt-5-mini` (OpenAI Responses API), 1 trial per scenario, run on 2026-11-06.
- **Same conditions for both systems:** model, tools, injected tool faults, evidence validation, report assembly and status policy. Reasoning effort is `medium` for the baseline and the reasoning agent, and `low` for the other agents.
- **Cost:** $1.21 for all 24 investigations, using token prices from `src/llm/models.ts`.

These are the results as run, before the fix described under [Findings](#findings).

## Summary

| Metric | multi-agent | single-agent |
| --- | --- | --- |
| Root-cause accuracy | 75% | 92% |
| Partial credit | 83% | 92% |
| Outcome (identified vs inconclusive) correct | 75% | 92% |
| True cause in top 3 | 83% | 100% |
| Overconfident wrong answers | 0 | 1 |
| Grounded citation rate | 100% | 100% |
| Key evidence recall | 94% | 92% |
| Invalid citations / run | 0.0 | 0.0 |
| Tool calls / run | 44.3 | 13.0 |
| Failed tool calls / run | 9.8 | 1.1 |
| LLM calls / run | 29.6 | 4.8 |
| Latency / run (s) | 225.8 | 61.3 |
| Tokens / run | 168,998 | 36,991 |
| Output tokens / run | 31,964 | 5,572 |
| Est. cost / run (USD) | $0.087 | $0.014 |
| Runs (errors) | 12 (0) | 12 (0) |

## Findings

**The single-agent baseline was more accurate on this run (92% vs 75%) and much cheaper.** The multi-agent system used about 6× the tokens and cost, and took about 3.7× as long. With one trial over 12 scenarios, each scenario moves accuracy by about 8 points, so treat the gap as indicative, not precise.

**The multi-agent system was better calibrated.** It was the only system to answer S08 correctly. S08 is designed to be unanswerable: logs are down and the email provider has no telemetry. The baseline named a root cause at 0.7 confidence; the multi-agent system concluded "inconclusive". The multi-agent system made no overconfident wrong calls and had slightly higher key evidence recall (94% vs 92%).

**Two of its three misses came from one bug, since fixed.** In S11 and S12, the reasoning agent wrote free-text service names such as `user-service (certificate provisioning/config)` and `external_traffic (api-gateway entrypoint)`. They didn't match the service catalog, so the audit's unknown-service rule capped confidence at 0.3. The status policy then reported "inconclusive" even though the right component had been identified. Both systems' schemas now limit `rootCauseService` to the catalog's service names.

**The third miss (S05) was a calibration call.** With log search timing out and then returning 40% of the data, the multi-agent system put its top hypothesis at 0.5, below the 0.6 threshold for naming a root cause.

**The multi-agent system over-explores.** It averages about 44 tool calls per run against a 45-call budget, and about 10 calls per run fail. Most of those failures are queries refused after the budget was spent, or invalid queries. A smaller task budget and stricter lead review are the obvious next levers on cost.

**Recovery worked under chaos.** In S12, injected crashes of the observability agent and the critic were retried and recovered, and the baseline recovered from its injected crash too.

## After the fix: spot check

I re-ran the two scenarios the bug affected on the multi-agent system only. This is a targeted check of the fix, not a re-run of the whole evaluation, so the tables above are unchanged.

| Scenario | Before | After | Cost |
| --- | --- | --- | --- |
| S11 scraper-traffic | inconclusive (unknown service, capped at 0.3) | **correct**: api-gateway, 0.85 | $0.10 |
| S12 expired-certificate | wrong (unknown service, capped at 0.3) | **correct**: user-service, 0.75 | $0.10 |

Both runs show the critic loop changing the answer:
- **S12:** round 1 favored the reporter's suspect (api-gateway, 0.6). The critic asked for more evidence, and round 2 moved to user-service.
- **S11:** round 1 leaned toward search-service, the red herring. Round 2 concluded the traffic entry point, api-gateway.

With these two fixed, the multi-agent system would score 11/12, level with the baseline. This hasn't been confirmed by a full re-run with several trials; that is the next step.

## Per scenario (as run)

| Scenario | Tags | System | Correct | Status | Top hypothesis | Tools | Tokens | Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S01 payment-pool-regression | bad-deploy, misleading-report, misleading-precedent | multi-agent | yes | root_cause_identified | payment-service (0.95) | 42 | 161,309 | 230.2 |
| S01 payment-pool-regression | bad-deploy, misleading-report, misleading-precedent | single-agent | yes | root_cause_identified | payment-service (0.85) | 10 | 13,461 | 40.6 |
| S02 orders-db-disk-full | red-herring-change, misleading-report | multi-agent | yes | root_cause_identified | orders-db (0.92) | 41 | 160,365 | 178.5 |
| S02 orders-db-disk-full | red-herring-change, misleading-report | single-agent | yes | root_cause_identified | orders-db (0.8) | 23 | 109,802 | 95.8 |
| S03 search-feature-flag | config-change, misleading-precedent, red-herring-change | multi-agent | yes | root_cause_identified | search-service (0.95) | 48 | 218,928 | 311.3 |
| S03 search-feature-flag | config-change, misleading-precedent, red-herring-change | single-agent | yes | root_cause_identified | search-service (0.85) | 8 | 10,199 | 46.0 |
| S04 payment-provider-outage | external-dependency, red-herring-change | multi-agent | yes | root_cause_identified | stripe-api (0.75) | 57 | 200,339 | 296.6 |
| S04 payment-provider-outage | external-dependency, red-herring-change | single-agent | yes | root_cause_identified | stripe-api (0.9) | 12 | 36,037 | 60.0 |
| S05 jwt-key-rotation | config-change, tool-failure | multi-agent | partial | inconclusive | api-gateway (0.5) | 48 | 198,348 | 283.9 |
| S05 jwt-key-rotation | config-change, tool-failure | single-agent | yes | root_cause_identified | auth-service (0.85) | 9 | 35,571 | 65.8 |
| S06 inventory-memory-leak | bad-deploy, conflicting-signals, misleading-report | multi-agent | yes | root_cause_identified | inventory-service (0.9) | 42 | 138,470 | 134.2 |
| S06 inventory-memory-leak | bad-deploy, conflicting-signals, misleading-report | single-agent | yes | root_cause_identified | inventory-service (0.85) | 11 | 36,069 | 55.3 |
| S07 redis-maxmemory-cascade | cascading-failure, config-change, red-herring-change, misleading-report | multi-agent | yes | root_cause_identified | redis-cache (0.9) | 43 | 137,056 | 166.2 |
| S07 redis-maxmemory-cascade | cascading-failure, config-change, red-herring-change, misleading-report | single-agent | yes | root_cause_identified | redis-cache (0.9) | 13 | 41,163 | 68.0 |
| S08 delayed-emails-inconclusive | insufficient-evidence, tool-failure, external-dependency | multi-agent | yes | inconclusive | notification-service (0.4) | 54 | 197,283 | 250.3 |
| S08 delayed-emails-inconclusive | insufficient-evidence, tool-failure, external-dependency | single-agent | no | root_cause_identified | notification-service (0.7) | 11 | 32,236 | 58.5 |
| S09 fulfillment-sync-call | bad-deploy, misleading-precedent, misleading-report | multi-agent | yes | root_cause_identified | fulfillment-service (0.6) | 39 | 166,002 | 266.4 |
| S09 fulfillment-sync-call | bad-deploy, misleading-precedent, misleading-report | single-agent | yes | root_cause_identified | fulfillment-service (0.85) | 13 | 21,362 | 66.6 |
| S10 migration-lock | tool-failure, bad-deploy | multi-agent | yes | root_cause_identified | orders-db (0.95) | 46 | 129,289 | 164.1 |
| S10 migration-lock | tool-failure, bad-deploy | single-agent | yes | root_cause_identified | orders-db (0.9) | 16 | 23,132 | 57.1 |
| S11 scraper-traffic | red-herring-change, misleading-report | multi-agent | partial | inconclusive | external_traffic (api-gateway entrypoint) (0.3) | 44 | 218,409 | 286.5 |
| S11 scraper-traffic | red-herring-change, misleading-report | single-agent | yes | root_cause_identified | api-gateway (0.9) | 10 | 20,249 | 47.3 |
| S12 expired-certificate | conflicting-signals, agent-failure, misleading-report | multi-agent | no | inconclusive | user-service (certificate provisioning/config) (0.3) | 27 | 102,173 | 141.6 |
| S12 expired-certificate | conflicting-signals, agent-failure, misleading-report | single-agent | yes | root_cause_identified | user-service (0.85) | 20 | 64,608 | 74.2 |
