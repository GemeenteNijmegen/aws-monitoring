# Security Hub Suppress Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make critical Security Hub alerts in Slack triageable, and let members of one Slack user group suppress a critical finding from Slack with a required reason, at minimal AWS cost.

**Architecture:** The monitoring Lambda enriches `CRITICAL` alerts through a `GetFindings` lookup and attaches a Suppress button. A new `POST /slack` route (Slack Interactivity URL) on the existing integrations API hits a thin receiver (verify signature, open a reason modal, enqueue). An SQS-fed worker checks the user group, re-reads the finding, calls `BatchUpdateFindings`, and redraws the Slack message. No new state store, no new secrets.

**Tech Stack:** TypeScript, AWS CDK, projen (`*.lambda.ts` to `*-function.ts`), Jest + `aws-sdk-client-mock` + `axios-mock-adapter`, `@aws-sdk/client-securityhub`, `@aws-sdk/client-sqs`, Powertools `Logger`, global `fetch` (Node 24) for Slack.

**Spec:** `docs/superpowers/specs/2026-11-11-security-hub-suppress-action-design.md`

## Global Constraints
- Action is **Suppress only** (`Workflow.Status = SUPPRESSED`); there is no Resolve.
- Severity gate: `Severity` equals `CRITICAL`, case-insensitive, defined once as `SUPPRESS_SEVERITY` in `SecurityHubView.ts`. Worker re-checks `Severity.Label`.
- Reason: required, max 400 characters; Security Hub note text max 512 characters; `UpdatedBy` is `slack:<user id>`.
- Buttons only when exactly one `ACTIVE` finding matches, its workflow status is `NEW` or `NOTIFIED`, and `securityHubActionsUserGroupId` is set. A lookup failure never loses the alert.
- Stale click (finding not `NEW`/`NOTIFIED`): refuse, change nothing, redraw without buttons. Already `SUPPRESSED` is success without a write.
- Authorization (Slack user group) is checked in the worker and fails closed on any error.
- Slack signature window is 60 seconds; do not log signatures or raw requests.
- Secrets are reused from `AuditSupport` (`slackbot-secret-<env>`, `slack-bot-token-<env>`); never create or move secrets (moving changes logical IDs and wipes values).
- `securityHubActionsUserGroupId` set without `deployAuditSlackbot` fails synthesis; unset deploys nothing new.
- Lambda runtime comes from projen (`nodejs24.x`); logging via Powertools `Logger`.
- Tests: `npx jest <path> --coverage=false`; full run `npx projen test`; lint `npx projen eslint`. CDK tests need `assets/` (run `npx projen bundle` once if it is missing).
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`).

## FinOps Controls
All services used are pay-per-use, so idle cost is about zero. Each control below is implemented and asserted in a task.

| Control | Why it saves or caps cost | Task |
|---|---|---|
| Lookup only for `CRITICAL` alerts; `GetFindings` `MaxResults: 2`, SDK `maxAttempts: 3`, `requestTimeout: 5s` | Few API calls; the 30s Lambda timeout cannot be billed by a hung call | 2, 4, 6 |
| Reuse the two `AuditSupport` secrets, cache them per container | No new secrets (about $0.40/secret/month each) and fewer `GetSecretValue` calls | 8, 10 |
| No DynamoDB, no VPC/NAT, no KMS CMK; queues use `SQS_MANAGED` encryption | No idle or per-key charges | 10 |
| Lambdas `arm64`, 256 MB; receiver timeout 5s (Slack gives up at 3s), worker 30s | Lower GB-second price, bounded runtime | 10 |
| Worker `SqsEventSource` `batchSize: 1`, `maxConcurrency: 2`; DLQ `maxReceiveCount: 2` | Caps parallel spend and retry storms, and protects Security Hub/Slack rate limits | 10 |
| Stage throttle on `POST /slack` (5 rps, burst 10) | Caps invocation cost from unauthenticated traffic on a public endpoint | 10 |
| Log groups `ONE_MONTH` retention; `Logger` at INFO; no raw request logging | Lambda log groups never expire by default; ingestion is the largest cost line | 10 |
| Main queue retention 1 hour, DLQ 14 days | A request older than Slack's `response_url` lifetime is not worth storing | 10 |
| Cost-allocation tag `Feature=security-hub-actions` | Spend is visible per feature in Cost Explorer (the `Project` tag already exists) | 10 |

Estimate (verify with the AWS Pricing Calculator): at tens of critical alerts and a few suppressions per month, the added cost is well under $1/month, dominated by CloudWatch Logs and API Gateway requests. `GetFindings` and `BatchUpdateFindings` are free. Documented in Task 11. Not added: a DLQ alarm (about $0.10/month, worth a later decision) and log-retention changes for existing Lambdas (out of scope).

## Review Focus
Inputs and conditions the spec implies that a user is likely to hit; each has a test in the owning task.
1. A payload with no `Resources`, no `Compliance`, or no `Severity` still produces an alert (Task 3 `renders without Resources`, Task 5 `sends plain alert when severity is missing`).
2. A reason containing `<!channel>`, `<@U123>` or `&` never pings anyone in the redrawn message (Task 9 `escapes reason`).
3. Clicking an old message after another user already suppressed the finding writes nothing and says who did (Task 9 `refuses stale finding`).
4. Bodies sent to `/slack` that are not Slack's (empty, non-form, bad JSON, no `payload`) are rejected without enqueueing (Task 8 `rejects malformed body`).
5. A control that matches more than one finding on the resource gets no button, not a guess (Task 4 `multiple matches`, Task 5 `no button on ambiguous lookup`).

## File Structure
| File | Responsibility |
|---|---|
| `src/audit/slackbot/slack-authenticate.ts` (modify) | Hardened Slack signature check, shared with audit slackbot |
| `src/monitoringLambda/SecurityHubView.ts` (create) | Normalized finding view from payload or ASFF; severity gate |
| `src/monitoringLambda/SecurityHubMessage.ts` (create) | Render a view into a `Message`; Slack text escaping |
| `src/monitoringLambda/SecurityHubFindingLookup.ts` (create) | `GetFindings` lookup, one result or a reason |
| `src/monitoringLambda/SecurityHubEnrichment.ts` (create) | Decide button/notice, produce the final `SlackMessage` |
| `src/securityHubActions/shared/ActionPayload.ts` (create) | Constants and types shared by monitoring Lambda, receiver, worker |
| `src/securityHubActions/shared/SlackApi.ts` (create) | `views.open`, `usergroups.users.list`, `response_url` via `fetch` |
| `src/securityHubActions/receiver/` (create) | Interaction handler and Lambda entry |
| `src/securityHubActions/worker/` (create) | `SuppressWorker` and Lambda entry |
| `src/securityHubActions/SecurityHubActions.ts` (create) | CDK construct with the FinOps controls |
| Modified: `Message.ts`, `SlackMessage.ts`, `MessageFormatter.ts`, `IHandler.ts`, `SnsEventHandler.ts`, `monitoring.lambda.ts`, `AggregatorStack.ts`, `IntegrationsStack.ts`, `AuditSupport.ts`, `MonitoringTargetStage.ts`, `DeploymentEnvironments.ts`, `slackbot-manifest.json`, `docs/README.md` | See tasks |

Task order is sequential: 1; 2 to 6 (alert side); 7 to 10 (action side); 11; 12.

---

### Task 1: Harden `slackAuthenticate`

**Files:**
- Modify: `src/audit/slackbot/slack-authenticate.ts`
- Test: `src/audit/slackbot/test/slack-authenticate.test.ts`

**Interfaces:**
- Produces: `slackAuthenticate(event: APIGatewayProxyEvent, secret: string): Promise<boolean>` (signature unchanged).

- [ ] **Step 1: Write the failing tests**

```typescript
import { createHmac } from 'crypto';
import { slackAuthenticate } from '../slack-authenticate';

const SECRET = 'signing-secret';
const NOW = 1_700_000_000;
const sign = (ts: string, body: string) => 'v0=' + createHmac('sha256', SECRET).update(`v0:${ts}:${body}`).digest('hex');
const makeEvent = (headers: Record<string, string>, body = 'payload=x') => ({ body, headers } as any);

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(NOW * 1000); });
afterEach(() => jest.useRealTimers());

test('accepts a valid request', async () => {
  const ts = `${NOW}`;
  expect(await slackAuthenticate(makeEvent({ 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': sign(ts, 'payload=x') }), SECRET)).toBe(true);
});
test('accepts lowercase header names', async () => {
  const ts = `${NOW}`;
  expect(await slackAuthenticate(makeEvent({ 'x-slack-request-timestamp': ts, 'x-slack-signature': sign(ts, 'payload=x') }), SECRET)).toBe(true);
});
test('rejects a tampered body', async () => {
  const ts = `${NOW}`;
  expect(await slackAuthenticate(makeEvent({ 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': sign(ts, 'payload=x') }, 'payload=y'), SECRET)).toBe(false);
});
test.each([['expired', `${NOW - 61}`], ['future', `${NOW + 61}`], ['missing', ''], ['non-numeric', 'abc']])('rejects %s timestamp', async (_n, ts) => {
  expect(await slackAuthenticate(makeEvent({ 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': sign(ts, 'payload=x') }), SECRET)).toBe(false);
});
test('rejects a signature of different length without throwing', async () => {
  const ts = `${NOW}`;
  expect(await slackAuthenticate(makeEvent({ 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': 'v0=abc' }), SECRET)).toBe(false);
});
test('never logs signatures', async () => {
  const spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'debug')].map(s => s.mockImplementation());
  const ts = `${NOW}`; const sig = sign(ts, 'payload=x');
  await slackAuthenticate(makeEvent({ 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': sig }), SECRET);
  spies.forEach(s => s.mock.calls.forEach(c => expect(JSON.stringify(c)).not.toContain(sig)));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/audit/slackbot/test/slack-authenticate.test.ts --coverage=false`
Expected: FAIL (missing/future/non-numeric accepted, lowercase headers rejected, signature logged).

- [ ] **Step 3: Implement** in `slack-authenticate.ts`: case-insensitive header lookup; `Number.isFinite` check and `Math.abs(now - ts) > 60` rejection; compare with `timingSafeEqual` after checking equal buffer lengths; remove both signature log statements (keep a generic "Replay attack" log without values).

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/audit/slackbot --coverage=false`
Expected: PASS, including the existing `SlackbotHandler` tests.

- [ ] **Step 5: Commit** `git add src/audit/slackbot && git commit -m "fix: harden slack request signature check"`

---

### Task 2: Normalized finding view and severity gate

**Files:**
- Create: `src/monitoringLambda/SecurityHubView.ts`
- Test: `src/monitoringLambda/test/security-hub-view.test.ts`

**Interfaces:**
- Produces:
  - `export const SUPPRESS_SEVERITY = 'CRITICAL'`; `isSuppressEligibleSeverity(severity?: string): boolean`
  - `export interface SecurityHubView { title: string; severity?: string; accountId: string; region?: string; controlId?: string; complianceStatus?: string; workflowStatus?: string; standard?: string; description?: string; resources: { type: string; id: string }[]; remediationUrl?: string; fixAvailable?: string; exploitAvailable?: string; findingId?: string; productArn?: string }`
  - `viewFromPayload(payload: any): SecurityHubView` (never throws), `viewFromFinding(finding: AwsSecurityFinding): SecurityHubView` (type from `@aws-sdk/client-securityhub`)

- [ ] **Step 1: Write failing tests**
  - `isSuppressEligibleSeverity`: `'CRITICAL'` and `'critical'` true; `'HIGH'`, `''`, `undefined` false.
  - `viewFromPayload` on the `Message` of `samples/securityhub-new-lz.json`: `title` starts with `CodeBuild.5`, `severity === 'HIGH'`, `accountId === '836443378780'`, `region === 'eu-central-1'`, `controlId === 'CodeBuild.5'`, `complianceStatus === 'FAILED'`, `workflowStatus === 'NEW'`, `standard === 'aws-foundational-security-best-practices/v/1.0.0'` (leading `standards/` removed), one resource, `findingId` undefined.
  - `viewFromPayload({})` returns `title '(no title)'`, `resources []`, no throw.
  - `viewFromFinding` for an Inspector-like finding (`Vulnerabilities: [{FixAvailable:'NO'},{FixAvailable:'YES', ExploitAvailable:'NO'}]`, `Remediation.Recommendation.Url`, `Id`, `ProductArn`, `AwsAccountId`, `Workflow.Status`): `fixAvailable === 'YES'` (YES wins over PARTIAL over NO), `exploitAvailable === 'NO'`, `findingId`/`productArn`/`remediationUrl` set, `controlId` undefined. Without `Vulnerabilities`, both are `undefined`.

- [ ] **Step 2: Run** `npx jest src/monitoringLambda/test/security-hub-view.test.ts --coverage=false` to see FAIL (module missing).
- [ ] **Step 3: Implement** the signatures above. ASFF mapping: `severity = Severity.Label`, `accountId = AwsAccountId`, `controlId = Compliance.SecurityControlId`, `complianceStatus = Compliance.Status`, `workflowStatus = Workflow.Status ?? WorkflowState`, `standard` from `Compliance.AssociatedStandards[0].StandardsId` (same prefix stripping as the payload).
- [ ] **Step 4: Run** the same command; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: add normalized security hub finding view"`

---

### Task 3: Render the richer alert and fix formatter bugs

**Files:**
- Create: `src/monitoringLambda/SecurityHubMessage.ts`, `src/securityHubActions/shared/ActionPayload.ts`
- Modify: `src/monitoringLambda/Message.ts`, `src/monitoringLambda/SlackMessage.ts`, `src/monitoringLambda/MessageFormatter.ts` (`SecurityHubFormatter`)
- Create samples: `src/monitoringLambda/test/samples/securityhub-critical.json` (copy of `securityhub-new-lz.json` with `Severity` `CRITICAL`), `securityhub-no-resources.json` (no `Resources`, no `Compliance`)
- Test: `src/monitoringLambda/test/security-hub-message.test.ts`

**Interfaces:**
- Consumes: `SecurityHubView`, `viewFromPayload` (Task 2).
- Produces:
  - `ActionPayload.ts`: `export const SUPPRESS_ACTION_ID = 'securityhub_suppress'`; `export interface FindingRef { id: string; productArn: string }`
  - `SecurityHubMessage.ts`: `renderSecurityHubView(message: Message, view: SecurityHubView, opts: RenderOptions): Message` with `RenderOptions { accountName: string; button?: FindingRef; notice?: string; outcome?: { status: string; by?: string; reason?: string } }`; `escapeSlackText(text: string): string`; `findingConsoleUrl(region: string, findingId: string): string`
  - `Message.addButton(text: string, actionId: string, payload: any): void` and `Message.addLink` now appends to a `links` array (replaces the single `link` prop; `grep -rn "\.link\b\|link:" src` and update users)

- [ ] **Step 1: Write failing tests**
  - `escapeSlackText('<!channel> & <@U1>')` equals `'&lt;!channel&gt; &amp; &lt;@U1&gt;'`.
  - `renders context`: for the critical sample, blocks contain a context block with `severity`, `account`, `region`, `compliance`, `workflow`, `control`, `standard` entries, and the header is still `SecurityHub: <title>`.
  - `renders without Resources`: the no-resources sample renders without throwing and has no resources section.
  - `joins resources with newlines` and caps at 10 lines plus `...and N more`.
  - `truncates long description`: a 5000 character description produces a section of at most 3000 characters ending in `…`, never `(message ommited)`.
  - `renders vulnerability line` only when `fixAvailable`/`exploitAvailable` exist.
  - `renders links`: remediation URL and, when `findingId` exists, the console link; two links produce two link sections.
  - `findingConsoleUrl('eu-central-1','arn:aws:securityhub:eu-central-1:1:finding/x')` equals `https://eu-central-1.console.aws.amazon.com/securityhub/home?region=eu-central-1#/findings?search=Id%3D%255Coperator%255C%253AEQUALS%255C%253A${encodeURIComponent(encodeURIComponent(id))}` (confirm against a real finding in Task 12).
  - `renders button`: with `opts.button`, an `actions` block with `action_id === SUPPRESS_ACTION_ID`, text `Suppress`, `value` equal to base64 of `JSON.stringify({id, productArn})`.
  - `renders outcome` replaces the button with a section containing the escaped reason; `renders notice` adds a section.
  - Existing tests: `npx jest src/monitoringLambda --coverage=false` stays green.

- [ ] **Step 2: Run** the new test file; expect FAIL.
- [ ] **Step 3: Implement** the signatures above. `SecurityHubFormatter.constructMessage` becomes: `renderSecurityHubView(message, viewFromPayload(this.event), { accountName: this.lookupAccountName(this.account) })`. Order of blocks: header, context, description, resources, vulnerability line, links, notice, button, outcome.
- [ ] **Step 4: Run** `npx jest src/monitoringLambda --coverage=false`; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: richer security hub alert rendering"`

---

### Task 4: Finding lookup

**Files:**
- Create: `src/monitoringLambda/SecurityHubFindingLookup.ts`
- Test: `src/monitoringLambda/test/security-hub-lookup.test.ts` (use `mockClient(SecurityHubClient)` as in `src/SecurityHubOverviewLambda` tests)

**Interfaces:**
- Consumes: `SecurityHubClient`, `GetFindingsCommand`, `AwsSecurityFinding` from `@aws-sdk/client-securityhub`.
- Produces: `export type LookupResult = { kind: 'found'; finding: AwsSecurityFinding } | { kind: 'none' } | { kind: 'multiple' } | { kind: 'error'; error: unknown }`; `export class SecurityHubFindingLookup { constructor(client?: SecurityHubClient); lookup(payload: any): Promise<LookupResult> }`. The default client uses `maxAttempts: 3` and `requestHandler: { requestTimeout: 5000 }`.

- [ ] **Step 1: Write failing tests** with the critical sample payload:
  - `one match` returns `found`; the `GetFindingsCommand` input has `MaxResults: 2` and filters `AwsAccountId` (from `AccountId`), `ResourceId` (all payload resource IDs), `RecordState` `ACTIVE`, `SeverityLabel` `CRITICAL`, and `ComplianceSecurityControlId` equal to `ControlId`.
  - `title fallback`: without `ControlId` the filter uses `Title`, not `ComplianceSecurityControlId`.
  - `zero matches` returns `none`; `multiple matches` (two findings) returns `multiple`; a rejected `send` returns `error`, never throws.
  - `no resources` returns `none` without calling the API.
- [ ] **Step 2: Run** `npx jest src/monitoringLambda/test/security-hub-lookup.test.ts --coverage=false`; expect FAIL.
- [ ] **Step 3: Implement** per the interface; every filter uses `Comparison: 'EQUALS'`.
- [ ] **Step 4: Run** same command; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: add security hub finding lookup"`

---

### Task 5: Enrichment and wiring

**Files:**
- Create: `src/monitoringLambda/SecurityHubEnrichment.ts`
- Modify: `src/monitoringLambda/IHandler.ts`, `src/monitoringLambda/SnsEventHandler.ts` (the `SecurityHub` entry and `handle`), `src/monitoringLambda/monitoring.lambda.ts`, `src/DeploymentEnvironments.ts` (`Configuration`)
- Test: `src/monitoringLambda/test/security-hub-enrichment.test.ts`; extend `monitoring.lambda.test.ts`

**Interfaces:**
- Consumes: `SecurityHubFindingLookup` (Task 4), `viewFromFinding`/`viewFromPayload`/`isSuppressEligibleSeverity` (Task 2), `renderSecurityHubView` (Task 3).
- Produces:
  - `HandledEvent.enrich?: () => Promise<SlackMessage>`
  - `Configuration.securityHubActionsUserGroupId?: string` (documented: Slack user group ID; unset means no buttons and no endpoint)
  - `enrichSecurityHubMessage(payload: any, accountName: string, configuration: Configuration, lookup?: SecurityHubFindingLookup): Promise<SlackMessage>`

- [ ] **Step 1: Write failing tests** (fake `lookup` object and a `{ securityHubActionsUserGroupId: 'S1' }` configuration):
  - `button on single new finding`: `found` with `Workflow.Status NEW` gives an actions block; the view comes from the finding (fix/exploit lines present).
  - `no button when closed`: status `SUPPRESSED` or `RESOLVED` gives the ASFF view and no button, no notice.
  - `no button when group unset`: found + `NEW` and no group gives ASFF view, no button, no notice.
  - `notice on none, multiple, error` (group set): payload view, no button, notice `Actions unavailable for this alert`; with group unset, no notice.
  - `sends plain alert when severity is missing` (handler level): `SnsEventHandler.handle` on a payload without `Severity` returns no `enrich`; `HIGH` sample returns no `enrich`; `CRITICAL` sample returns an `enrich` function. `sns-handler.test.ts` stays untouched and green.
  - `monitoring.lambda` level with `mockClient(SecurityHubClient)` and axios mock: a `CRITICAL` sample posts a message containing the vulnerability line; when `GetFindings` rejects, the plain alert is still posted (one POST); a `HIGH` sample never calls `GetFindings`.
- [ ] **Step 2: Run** the three test files; expect FAIL.
- [ ] **Step 3: Implement.** In `SnsEventHandler`, add to the `Event` interface `enrich?: (message: any, account: string, configuration: Configuration) => (() => Promise<SlackMessage>) | undefined`; only the `SecurityHub` entry sets it (returns a function only when `isSuppressEligibleSeverity(message?.Severity)`), and `handle` copies it into the returned `HandledEvent`. `handle` stays synchronous. In `monitoring.lambda.ts`: `let message = handled.message; if (handled.enrich) { try { message = await handled.enrich(); } catch (e) { console.error('enrichment failed, sending plain alert', e); } } await message.send(handled.priority);`.
- [ ] **Step 4: Run** `npx jest src/monitoringLambda --coverage=false`; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: enrich critical security hub alerts with finding details"`

---

### Task 6: Monitoring Lambda permissions and timeout

**Files:**
- Modify: `src/AggregatorStack.ts` (`setupMonitoringFunction`)
- Test: `src/AggregatorStack.test.ts`

- [ ] **Step 1: Write failing test** that synthesizes `new AggregatorStack(app, 'agg', { env: { account: '123456789012', region: 'eu-central-1' }, prefix: 'dev', branchName: 'sandbox' })` and asserts: the function with description `Slack notification lambda (dev)` has `Timeout: 30`, and an `AWS::IAM::Policy` contains an action `securityhub:GetFindings` attached to that function's role.
- [ ] **Step 2: Run** `npx jest src/AggregatorStack.test.ts --coverage=false`; expect FAIL.
- [ ] **Step 3: Implement**: pass `timeout: Duration.seconds(30)` to `MonitoringFunction`, and `lambda.addToRolePolicy` with `securityhub:GetFindings` on `*` (the API does not support resource-level permissions).
- [ ] **Step 4: Run** the same command; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: allow monitoring lambda to look up security hub findings"`

---

### Task 7: Shared Slack payload types and `SlackApi`

**Files:**
- Modify: `src/securityHubActions/shared/ActionPayload.ts`
- Create: `src/securityHubActions/shared/SlackApi.ts`
- Test: `src/securityHubActions/shared/test/slack-api.test.ts`

**Interfaces:**
- Produces in `ActionPayload.ts`: `SUPPRESS_CALLBACK_ID = 'securityhub_suppress_reason'`, `REASON_BLOCK_ID = 'reason'`, `REASON_ACTION_ID = 'reason_input'`, `MAX_REASON_LENGTH = 400`; `SuppressMetadata extends FindingRef { responseUrl: string }`; `SuppressJob extends SuppressMetadata { slackUserId: string; reason: string }`; `decodeButtonValue(value: string): FindingRef` (throws on invalid JSON or missing fields); `buildSuppressView(meta: SuppressMetadata): object` (modal with `callback_id`, `private_metadata = JSON.stringify(meta)`, one multiline `plain_text_input` with `max_length: 400`, title `Suppress finding`, submit `Suppress`).
- Produces in `SlackApi.ts`: `class SlackApi { constructor(botToken: string); openModal(triggerId: string, view: object): Promise<void>; listGroupMembers(userGroupId: string): Promise<string[]>; static respond(responseUrl: string, body: object): Promise<void> }`. Slack API errors (`ok: false` or non-2xx) throw `Error('Slack <method> failed: <error>')`.

- [ ] **Step 1: Write failing tests** with `jest.spyOn(global, 'fetch')`: `openModal` posts JSON to `https://slack.com/api/views.open` with `Authorization: Bearer <token>`; `listGroupMembers` calls `usergroups.users.list?usergroup=S1` and returns `users`; `ok:false` throws; `respond` posts to the given URL; `decodeButtonValue` round-trips `Buffer.from(JSON.stringify({id,productArn})).toString('base64')` and throws on garbage; `buildSuppressView` has `max_length` 400 and parses back from `private_metadata`.
- [ ] **Step 2: Run** `npx jest src/securityHubActions/shared --coverage=false`; expect FAIL.
- [ ] **Step 3: Implement** per the interface using global `fetch`; do not log tokens.
- [ ] **Step 4: Run** the same command; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: add slack api client and action payload types"`

---

### Task 8: Receiver

**Files:**
- Create: `src/securityHubActions/receiver/SlackInteractionHandler.ts`, `src/securityHubActions/receiver/securityHubActionsReceiver.lambda.ts`
- Test: `src/securityHubActions/receiver/test/slack-interaction-handler.test.ts`

**Interfaces:**
- Consumes: `slackAuthenticate` (Task 1), `SlackApi`, `buildSuppressView`, `decodeButtonValue`, constants (Task 7).
- Produces: `handleSlackInteraction(event: APIGatewayProxyEvent, deps: ReceiverDeps): Promise<APIGatewayProxyResult>` with `ReceiverDeps { signingSecret: string; slack: Pick<SlackApi, 'openModal'>; enqueue: (job: SuppressJob) => Promise<void>; logger: Pick<Logger, 'info' | 'warn' | 'error'> }`. Lambda entry reads env `SLACK_SECRET_ARN`, `SLACK_BOT_TOKEN_ARN`, `QUEUE_URL`, fetches both secrets in parallel via `AWS.getSecret` and caches them at module scope.

- [ ] **Step 1: Write failing tests** (sign requests with the helper from Task 1; `payload` is form-encoded JSON):
  - `rejects unsigned request`: 403, no `openModal`, no `enqueue`.
  - `rejects malformed body` (empty body, non-form body, `payload=` with bad JSON, no `payload` key): 400 (after a valid signature), nothing enqueued or opened.
  - `opens modal on click`: `block_actions` with `action_id === SUPPRESS_ACTION_ID` calls `openModal(trigger_id, view)` once, 200 with empty body; metadata holds `id`, `productArn`, `responseUrl`.
  - `ignores other actions` and unknown payload types: 200, no calls.
  - `enqueues on submit`: `view_submission` with a valid reason enqueues `{ id, productArn, responseUrl, slackUserId, reason }` (reason trimmed) and returns 200 with empty body.
  - `rejects invalid reason`: empty/whitespace or 401 characters returns 200 with body `{"response_action":"errors","errors":{"reason":"<message>"}}` and no enqueue.
  - `enqueue failure` returns the same `errors` response (user can retry); `openModal` failure is logged and returns 200.
- [ ] **Step 2: Run** `npx jest src/securityHubActions/receiver --coverage=false`; expect FAIL.
- [ ] **Step 3: Implement.** Parse `new URLSearchParams(event.body).get('payload')`. Do not log the body or headers; log only the payload `type` and Slack user ID. Lambda entry: `SQSClient.send(new SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify(job) }))`.
- [ ] **Step 4: Run** the same command; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: add slack interaction receiver"`

---

### Task 9: Worker

**Files:**
- Create: `src/securityHubActions/worker/SuppressWorker.ts`, `src/securityHubActions/worker/securityHubActionsWorker.lambda.ts`
- Test: `src/securityHubActions/worker/test/suppress-worker.test.ts` (`mockClient(SecurityHubClient)`, fake `slack`/`respond`)

**Interfaces:**
- Consumes: `SlackApi`, `SuppressJob` (Task 7); `viewFromFinding`, `renderSecurityHubView`, `escapeSlackText`, `Message` (Tasks 2 and 3).
- Produces: `type SuppressOutcome = 'suppressed' | 'already-suppressed' | 'not-allowed' | 'not-critical' | 'stale' | 'not-found' | 'failed'`; `class SuppressWorker { constructor(deps: { slack: Pick<SlackApi, 'listGroupMembers'>; securityHub: SecurityHubClient; respond: (url: string, body: object) => Promise<void>; userGroupId: string; accountNameFor: (accountId: string) => string; logger: Pick<Logger, 'info' | 'warn' | 'error'> }); handle(job: SuppressJob): Promise<SuppressOutcome> }`. The Lambda entry takes an `SQSEvent`, parses each record body into a `SuppressJob`, and calls `handle`. Env: `SLACK_BOT_TOKEN_ARN`, `USER_GROUP_ID`, `BRANCH_NAME`. `handle` never throws for expected refusals or API errors (they return `failed`, with an ephemeral message so the user can click again).

Behavior order: (1) membership; (2) `GetFindings` by `Id` + `ProductArn`; (3) `Severity.Label` must be `CRITICAL`; (4) workflow status `NEW`/`NOTIFIED` else stale; (5) `BatchUpdateFindings`; (6) redraw. Refusals and errors respond with `{ response_type: 'ephemeral', replace_original: false, text }`; redraws respond with `{ replace_original: true, blocks }`.

- [ ] **Step 1: Write failing tests**
  - `refuses non-member`: no `GetFindings`/`BatchUpdateFindings` call; ephemeral text; returns `not-allowed`. `fails closed on Slack error`: `listGroupMembers` rejects gives `not-allowed`, no write.
  - `refuses not found` and `refuses non-critical` (`Severity.Label 'HIGH'`): no write.
  - `refuses stale finding`: for status `RESOLVED` the worker returns `stale`, no write, ephemeral names the status and `Note.UpdatedBy`/`Note.Text`, and the redraw has no `actions` block.
  - `already suppressed` returns `already-suppressed`, no write, redraw without buttons.
  - `suppresses`: `BatchUpdateFindings` input equals `{ FindingIdentifiers: [{ Id, ProductArn }], Workflow: { Status: 'SUPPRESSED' }, Note: { Text: <contains reason and user id, length <= 512 for a 400 character reason>, UpdatedBy: 'slack:U123' } }`; redraw has no `actions` block and shows status and reason; returns `suppressed`.
  - `escapes reason`: reason `<!channel> & <@U9>` appears in the redraw only as `&lt;!channel&gt; &amp; &lt;@U9&gt;`.
  - `UnprocessedFindings` non-empty returns `failed`, ephemeral error, no redraw; a rejected `BatchUpdateFindings` does the same.
  - `survives expired response_url`: `respond` rejecting after a successful write still returns `suppressed` and logs an error.
- [ ] **Step 2: Run** `npx jest src/securityHubActions/worker --coverage=false`; expect FAIL.
- [ ] **Step 3: Implement** per the order above. Display names: the acting user is `<@id>`; a note author starting `slack:` is turned into `<@id>`, otherwise escaped plain text. Log each outcome with the finding `Id` and Slack user ID only (never the reason text beyond its length).
- [ ] **Step 4: Run** the same command; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: add suppress worker"`

---

### Task 10: CDK construct, wiring and FinOps controls

**Files:**
- Create: `src/securityHubActions/SecurityHubActions.ts`
- Modify: `src/audit/AuditSupport.ts` (expose `slackSecret`, `slackBotToken` as `public readonly ISecret`), `src/IntegrationsStack.ts`, `src/MonitoringTargetStage.ts` (line near `deployAuditSlackbot`), `.projenrc.ts` only if `npx projen` does not generate the two `*-function.ts` files
- Test: `src/securityHubActions/test/SecurityHubActions.test.ts`

**Interfaces:**
- Produces: `class SecurityHubActions extends Construct { constructor(scope, id, props: { api: apigateway.RestApi; environment: string; userGroupId: string; slackSecret: ISecret; slackBotToken: ISecret }) }`; `IntegrationsStackProps.securityHubActionsUserGroupId?: string`. `IntegrationsStack` creates `SecurityHubActions` only when it is set, throws `Error('securityHubActionsUserGroupId requires deployAuditSlackbot')` when `deployAuditSlackbot` is not true, and `setupApi` adds `deployOptions.methodOptions['/slack/POST'] = { throttlingRateLimit: 5, throttlingBurstLimit: 10 }` only when it is set.

- [ ] **Step 1: Write failing tests** on `new IntegrationsStack(app, 'int', { env, prefix: 'dev', deployAuditSlackbot: true, securityHubActionsUserGroupId: 'S1' })`:
  - Resources: an API Gateway resource `slack` with a `POST` method; exactly 2 `AWS::SecretsManager::Secret` and exactly 1 `AWS::DynamoDB::Table` (the audit ones, nothing new); 2 SQS queues added (main with `MessageRetentionPeriod: 3600`, DLQ with `1209600`), both `SqsManagedSseEnabled: true` and no `KmsMasterKeyId`; main queue `RedrivePolicy.maxReceiveCount` 2.
  - FinOps: both new Lambdas have `Architectures: ['arm64']`, `MemorySize: 256`; receiver `Timeout: 5`, worker `Timeout: 30`; their log groups have `RetentionInDays: 30`; the event source mapping has `BatchSize: 1` and `ScalingConfig.MaximumConcurrency: 2`; the stage `MethodSettings` contains `HttpMethod: 'POST'`, `ResourcePath: '/~1slack'`, `ThrottlingRateLimit: 5`, `ThrottlingBurstLimit: 10`; all new resources carry tag `Feature: security-hub-actions`.
  - IAM: worker role has `securityhub:GetFindings` and `securityhub:BatchUpdateFindings`; receiver has `sqs:SendMessage`; both read both secrets.
  - Gating: without the prop there is no `/slack` resource and the Lambda count equals the audit-only count; setting it with `deployAuditSlackbot` false or unset throws the error above.
- [ ] **Step 2: Run** `npx projen` (generates the function constructs), then `npx jest src/securityHubActions/test --coverage=false`; expect FAIL.
- [ ] **Step 3: Implement** the construct: `SecurityHubActionsReceiverFunction` and `SecurityHubActionsWorkerFunction` with the sizes above, explicit `logGroup` with `RetentionDays.ONE_MONTH` and `RemovalPolicy.DESTROY`, `SqsEventSource(queue, { batchSize: 1, maxConcurrency: 2 })`, queue visibility timeout 60s, `Tags.of(this).add('Feature', 'security-hub-actions')`. Receiver env `SLACK_SECRET_ARN`, `SLACK_BOT_TOKEN_ARN`, `QUEUE_URL`; worker env `SLACK_BOT_TOKEN_ARN`, `USER_GROUP_ID`, `BRANCH_NAME`, `POWERTOOLS_LOG_LEVEL=INFO`. Add `securityHubActionsUserGroupId` to `MonitoringTargetStage` props passthrough from `Configuration`.
- [ ] **Step 4: Run** `npx jest src --coverage=false`; expect PASS.
- [ ] **Step 5: Permission boundary check (manual).** Read `PermissionsBoundaryAspect` in `node_modules/@gemeentenijmegen/aws-constructs` and confirm with Indy that the boundary policy attached in gn-audit allows `securityhub:BatchUpdateFindings`; record the answer in the PR description.
- [ ] **Step 6: Commit** `git commit -m "feat: add security hub actions endpoint and worker"`

---

### Task 11: Manifest and documentation

**Files:**
- Modify: `src/audit/slackbot-manifest.json`, `docs/README.md` (link at the `Slack interaction` heading already points to `./SlackInteraction.md`)
- Create: `docs/SlackInteraction.md`

- [ ] **Step 1:** Add to the manifest scope `usergroups:read`, an `interactivity` block (`is_enabled: true`, `request_url` `https://apigatewayurl.example.com/prod/slack`), and keep the Events URL as is.
- [ ] **Step 2:** Write `docs/SlackInteraction.md` with these sections: what the button does and for which severity; per-environment setup for each Slack app (Monitoring for `main`, Sandbox monitoring for `sandbox`): add `usergroups:read`, enable Interactivity with that environment's `/slack` URL, reinstall, store signing secret and bot token in `slackbot-secret-<env>` / `slack-bot-token-<env>`, set `securityHubActionsUserGroupId`; behavior (reason required, note replaces any earlier note, stale clicks refused, who can click); troubleshooting (DLQ, `response_url` expiry); **Cost** (the FinOps table from this plan, the estimate and how to see it via the `Feature` tag).
- [ ] **Step 3:** Run `npx projen test && npx projen eslint`; expect all green and no unexpected snapshot changes.
- [ ] **Step 4: Commit** `git commit -m "docs: document slack suppress action and setup"`

---

### Task 12: End-to-end verification (manual, needs Indy)

Do not start without Indy naming one low-risk test finding and a restricted test user group.
- [ ] Record the finding's current status, then check the alert fields and both links against the console (also confirms `findingConsoleUrl`).
- [ ] As a non-member: submit; confirm refusal and no change.
- [ ] As a member: Suppress with a reason; confirm status and note in the console and the redrawn message; click again on the stale message and confirm refusal.
- [ ] Confirm whether the finding alerts again (prerequisite 2) and that Cost Explorer shows the `Feature` tag after a day.
- [ ] Restore the finding's original status.
