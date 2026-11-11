# Actionable Security Hub alerts in Slack (Suppress)

Status: design, awaiting review. Supersedes the earlier plan `security-hub-slack-resolve-suppress-actions.md`
(Resolve was dropped, see Decisions).

## Goal
A responder can triage a Security Hub finding from the real-time Slack alert without opening the console,
and a named Slack user group can **suppress** one finding with a required reason that is stored as a
Security Hub note. The daily overview is out of scope.

Success: the alert shows enough to triage (severity, control, region, compliance, standard, links, fix/exploit
availability); a member of the user group can suppress a finding from Slack; a non-member, a stale click or any
failure changes nothing and tells the user why.

## Decisions
| Topic | Decision |
|---|---|
| Scope | Real-time alerts only |
| Information | Severity, control ID, region, compliance status, workflow status, standard, links, fix available, exploit available |
| Action | **Suppress only**, per finding, reason required, stored as a Security Hub note. Resolving is done by fixing the finding; Security Hub sets `RESOLVED` itself once a control passes |
| Permissions | Existing Slack user group, checked server-side, fails closed |
| Slack apps | One app per environment: "Monitoring" (prod, `main`) and "Sandbox monitoring" (dev, `sandbox`). Each has its own Interactivity URL, signing secret and bot token |
| Slack URLs | Events URL stays `/slackbot` (audit slackbot). Interactivity URL is the new `POST /slack` on the same API |
| Secrets | Reuse the `AuditSupport` secrets (`slackbot-secret-<env>`, `slack-bot-token-<env>`). They are exposed from `AuditSupport`, not moved (moving changes the logical ID and wipes the values) |
| Gating | `securityHubActionsUserGroupId` in the environment config. Unset: no endpoint, no buttons. Setting it without `deployAuditSlackbot` fails synthesis |
| Stale clicks | If the finding is no longer `NEW`/`NOTIFIED`: refuse, change nothing, redraw without buttons. Already `SUPPRESSED` counts as success without a write |

## Prerequisites (owner: Indy), confirm before implementing
1. **Security Hub admin account and aggregation region.** Assumed gn-audit, eu-central-1 (the aggregator environment). If gn-audit cannot update member findings, cross-account roles are needed (old pattern at `c85c663^:src/LogQueryAccessRole.ts`).
2. **Landing zone forwarding rule.**
   - Does it filter on workflow status? `BatchUpdateFindings` also emits events, so a suppressed finding could alert again.
   - Do Inspector findings use this path? If not, fix/exploit availability never appears.
   - Does the live payload match the 2023 samples? Can it carry the finding `Id` and `ProductArn`? If so, the lookup in section 1 becomes an exact match.
3. **Slack user group** name and its ID, for prod and dev.
4. **Per Slack app (Monitoring, Sandbox monitoring):** add scope `usergroups:read`, enable Interactivity with the environment's `/slack` URL, reinstall the app, and make sure the signing secret and bot token are in that environment's two secrets (the dev secrets may never have been filled).

## Design

```
SNS -> monitoring Lambda -> GetFindings lookup -> alert with [Suppress]
Click  -> POST /slack -> receiver: verify signature, views.open (reason form)
Submit -> POST /slack -> receiver: verify signature, enqueue, close form
SQS    -> worker: check group, re-read finding, check status, BatchUpdateFindings, redraw message
```

The receiver does only what must finish in Slack's 3 seconds. Authorization and state checks happen in the
worker. Refusals reach the user as an ephemeral message through `response_url`.

### 1. Richer alert
**Lookup: new `src/monitoringLambda/SecurityHubFindingLookup.ts`**
- `GetFindings` filtered on `AwsAccountId`, `ResourceId`, `RecordState=ACTIVE`, plus `ComplianceSecurityControlId` when `ControlId` is set, otherwise `Title`. If prerequisite 2 delivers `Id` and `ProductArn`, filter on those instead.
- Buttons are attached only when exactly one finding matches and its workflow status is `NEW` or `NOTIFIED`. Otherwise, or on any lookup error, the alert is posted from the SNS payload without buttons and says actions are unavailable. An alert is never lost because of the lookup.
- `GetFindings` is rate limited (about 3 requests per second). Use the SDK retry with backoff and limit concurrency; a throttled lookup falls back to the no-button alert.

**Rendering: `SecurityHubFormatter` in `src/monitoringLambda/MessageFormatter.ts`**
- Render from one normalized view, built from ASFF when available and from the SNS payload otherwise. The worker reuses it to redraw the message (Slack needs the full message on update).
- Context: severity, account, region, compliance status, workflow status, control ID, standard.
- Vulnerabilities: `FixAvailable` and `ExploitAvailable`, only when present.
- Links: `Remediation.Recommendation.Url` and the finding in the console (region from the finding; verify the deep-link encoding against a real finding). No resource console link in v1.
- Fix existing bugs on this path: resources joined without a newline, missing `Resources` throwing and losing the alert, long descriptions replaced by `(message ommited)` (truncate in the formatter instead).

**Plumbing**
- `Message.ts` / `SlackMessage.ts`: carry an actions block (one button for now, structured for more) and multiple links. Button value holds `Id` and `ProductArn`.
- `SnsEventHandler.handle` stays synchronous. `HandledEvent` gets an optional async `enrich` step, awaited in `monitoring.lambda.ts` before `send`; only the `SecurityHub` entry provides one. This leaves `sns-handler.test.ts` and the Logs handler untouched.
- `AggregatorStack.setupMonitoringFunction`: grant `securityhub:GetFindings`, raise the timeout from 3s to 30s.

### 2. Slack endpoint and worker
**New `src/securityHubActions/`**, following `src/audit/AuditSupport.ts` and the handler structure of `healthEvent.lambda.ts`:
- `SecurityHubActions.ts`: receiver and worker Lambdas, queue plus DLQ (template: `src/healthGrouping/HealthGroupingResources.ts`), and a `POST /slack` route on the existing API (`IntegrationsStack.ts`). Takes the signing secret and bot token from `AuditSupport`. SQS visibility timeout exceeds the worker timeout.
- `receiver/receiver.lambda.ts`: form parsing restored from `bff6230^:src/SlackInteractivityLambda/SlackInteractivity.lambda.ts`. No `url_verification` challenge is needed for an Interactivity URL.
  - `block_actions`: `views.open` with a required reason (max 400 characters, leaving room in the 512-character note). `private_metadata` carries `Id`, `ProductArn` and `response_url`. The modal opens for everyone; membership is checked in the worker.
  - `view_submission`: enqueue, return 200.
- `worker/worker.lambda.ts`, in order:
  1. Check membership with `usergroups.users.list`. Any error counts as not allowed.
  2. Read the finding again with `GetFindings`.
  3. If workflow status is not `NEW` or `NOTIFIED`: refuse and change nothing, with an ephemeral message ("Already <status> by <user> (reason)") and redraw the message without buttons. If it is already `SUPPRESSED`, report success without a write.
  4. `BatchUpdateFindings` with `Workflow.Status = SUPPRESSED` and `Note` (`Text`: Slack user and reason; `UpdatedBy`: `slack:<user id>`). Treat `UnprocessedFindings` as a failure. Note: `Note` replaces any existing note (earlier text remains only in finding history).
  5. Redraw through `response_url`: new status, who, reason, no buttons. The reason is escaped so `<!channel>` and `<@user>` do not notify anyone. Log the action with Powertools `Logger`.
- Permissions: worker gets `securityhub:GetFindings` and `securityhub:BatchUpdateFindings`. Check that `PermissionsBoundaryAspect` (applied in `MonitoringTargetStage`) allows the latter.

No DynamoDB table: the update is idempotent and the note, finding history and logs form the audit trail.

**Signature check: `src/audit/slackbot/slack-authenticate.ts`**
Shared with the audit slackbot, so harden it without breaking `src/audit/slackbot/test` or its `url_verification` flow: `timingSafeEqual`, reject missing, non-numeric or future timestamps (today `parseInt('')` is `NaN` and passes the age check), case-insensitive header lookup, stop logging signatures. Do not log the raw request in the new Lambdas.

### 3. Config and rollout
- Add `securityHubActionsUserGroupId` to `Configuration` (`DeploymentEnvironments.ts`) and pass it through `MonitoringTargetStage` and `IntegrationsStackProps` (pattern: `deployAuditSlackbot`). `IntegrationsStack` fails synthesis if it is set without `deployAuditSlackbot`.
- Expose the two secrets from `AuditSupport` (public readonly).
- `@aws-sdk/client-sqs` and `client-securityhub` are already in `.projenrc.ts`; run `npx projen` to generate the new `*-function.ts` files.
- Update `src/audit/slackbot-manifest.json`: scope `usergroups:read`, an `interactivity` block, real URL placeholders.
- Write `docs/SlackInteraction.md` (fixes the dead link at `docs/README.md:111`): Slack app setup per environment, secrets, permissions, how Suppress behaves, and that the note is replaced.

## Risks
- **A dev click changes real findings.** Prod and dev aggregators both run in gn-audit and read the same central topics. Keep the dev user group limited to testers.
- **Cold starts against the 3-second limit.** The receiver fetches two secrets and calls `views.open`. Cache secrets per container, raise memory if tests show it is needed.
- **Ambiguous lookup.** A control can match more than one finding on the same resource. The result is an alert without buttons, not a guess.
- **Expired `response_url`** (valid 30 minutes). The action still succeeds; only the redraw fails, and that is logged.

## Verification
**Automated (`npx projen test`, `npx projen eslint`)**
- Formatter: control, Inspector and minimal payloads (existing samples plus new ASFF samples); long descriptions; missing `Resources`.
- Lookup: one, zero and multiple matches, closed finding (no buttons), throttling and errors (`aws-sdk-client-mock`, as in `SecurityHubOverview.test.ts`).
- Signature check: valid, tampered, expired, future, missing and non-numeric timestamp, lowercase headers (real tests, not mocked). The audit slackbot tests stay green.
- Receiver: click, submit, unsigned request.
- Worker: not in group, Slack error fails closed, stale status refused with no write, already `SUPPRESSED` reported as success, successful suppress, `UnprocessedFindings`, reason escaping, expired `response_url`.
- CDK: route, permissions, nothing deployed when the config is unset, synthesis error when set without `deployAuditSlackbot`.
- `enrich`: `sns-handler.test.ts` unchanged and green.

**End to end in dev (only after you approve a specific test finding)**
1. Agree on one low-risk finding in a non-production account and note its current status so it can be restored.
2. Check the alert's fields and links against the console.
3. As a non-member: submit and confirm it is refused with no change.
4. As a member: Suppress with a reason; confirm status and note in the console and the redrawn Slack message.
5. Click again on the stale message: confirm it is refused with no change.
6. Check whether the finding alerts again (prerequisite 2).
7. Restore the finding's original status.
