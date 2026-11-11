import { AwsSecurityFinding } from '@aws-sdk/client-securityhub';

/**
 * Only findings with this severity can be suppressed from Slack.
 */
export const SUPPRESS_SEVERITY = 'CRITICAL';

export function isSuppressEligibleSeverity(severity?: string): boolean {
  return severity?.toUpperCase() === SUPPRESS_SEVERITY;
}

/**
 * Normalized view on a Security Hub finding, independent of whether it
 * originates from the (flattened) SNS payload or a full ASFF finding.
 */
export interface SecurityHubView {
  title: string;
  severity?: string;
  accountId: string;
  region?: string;
  controlId?: string;
  complianceStatus?: string;
  workflowStatus?: string;
  standard?: string;
  description?: string;
  resources: { type: string; id: string }[];
  remediationUrl?: string;
  fixAvailable?: string;
  exploitAvailable?: string;
  findingId?: string;
  productArn?: string;
}

function stripStandardsPrefix(standardsId?: string): string | undefined {
  return standardsId ? standardsId.replace(/^standards\//, '') : undefined;
}

/**
 * Build a view from the flattened payload that is sent over SNS. Never throws.
 */
export function viewFromPayload(payload: any): SecurityHubView {
  const resources = Array.isArray(payload?.Resources) ? payload.Resources : [];
  return {
    title: payload?.Title ?? '(no title)',
    severity: payload?.Severity,
    accountId: payload?.AccountId ?? '',
    region: payload?.Region,
    controlId: payload?.ControlId ?? payload?.Compliance?.SecurityControlId,
    complianceStatus: payload?.Compliance?.Status,
    workflowStatus: payload?.WorkflowState,
    standard: stripStandardsPrefix(payload?.Compliance?.AssociatedStandards?.[0]?.StandardsId),
    description: payload?.Description,
    resources: resources.map((r: any) => ({ type: String(r?.Type ?? ''), id: String(r?.Id ?? '') })),
  };
}

const FIX_RANK: Record<string, number> = { NO: 0, PARTIAL: 1, YES: 2 };

function bestFix(values: (string | undefined)[]): string | undefined {
  let best: string | undefined;
  for (const value of values) {
    if (value === undefined) { continue; }
    if (best === undefined || (FIX_RANK[value] ?? -1) > (FIX_RANK[best] ?? -1)) {
      best = value;
    }
  }
  return best;
}

/**
 * Build a view from a full ASFF finding (as returned by GetFindings).
 */
export function viewFromFinding(finding: AwsSecurityFinding): SecurityHubView {
  const vulnerabilities = finding.Vulnerabilities ?? [];
  return {
    title: finding.Title ?? '(no title)',
    severity: finding.Severity?.Label,
    accountId: finding.AwsAccountId ?? '',
    region: finding.Region,
    controlId: finding.Compliance?.SecurityControlId,
    complianceStatus: finding.Compliance?.Status,
    workflowStatus: finding.Workflow?.Status ?? finding.WorkflowState,
    standard: stripStandardsPrefix(finding.Compliance?.AssociatedStandards?.[0]?.StandardsId),
    description: finding.Description,
    resources: (finding.Resources ?? []).map(r => ({ type: r.Type ?? '', id: r.Id ?? '' })),
    remediationUrl: finding.Remediation?.Recommendation?.Url,
    fixAvailable: bestFix(vulnerabilities.map(v => v.FixAvailable)),
    exploitAvailable: bestFix(vulnerabilities.map(v => v.ExploitAvailable)),
    findingId: finding.Id,
    productArn: finding.ProductArn,
  };
}
