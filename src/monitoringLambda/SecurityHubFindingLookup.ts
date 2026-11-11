import { AwsSecurityFinding, GetFindingsCommand, SecurityHubClient } from '@aws-sdk/client-securityhub';

export type LookupResult =
  { kind: 'found'; finding: AwsSecurityFinding } |
  { kind: 'none' } |
  { kind: 'multiple' } |
  { kind: 'error'; error: unknown };

export class SecurityHubFindingLookup {
  private client: SecurityHubClient;

  constructor(client?: SecurityHubClient) {
    this.client = client ?? new SecurityHubClient({
      maxAttempts: 3,
      requestHandler: { requestTimeout: 5000 },
    });
  }

  async lookup(payload: any): Promise<LookupResult> {
    try {
      const resourceIds: string[] = (payload?.Resources ?? [])
        .map((r: any) => r?.Id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
      if (resourceIds.length === 0) {
        return { kind: 'none' };
      }
      const equals = (value: string) => ({ Comparison: 'EQUALS' as const, Value: value });
      const response = await this.client.send(new GetFindingsCommand({
        MaxResults: 2,
        Filters: {
          AwsAccountId: [equals(payload.AccountId)],
          ResourceId: resourceIds.map(equals),
          RecordState: [equals('ACTIVE')],
          SeverityLabel: [equals('CRITICAL')],
          ...(payload.ControlId
            ? { ComplianceSecurityControlId: [equals(payload.ControlId)] }
            : { Title: [equals(payload.Title)] }),
        },
      }));
      const findings = response.Findings ?? [];
      if (findings.length === 0) {
        return { kind: 'none' };
      }
      if (findings.length > 1) {
        return { kind: 'multiple' };
      }
      return { kind: 'found', finding: findings[0] };
    } catch (error) {
      return { kind: 'error', error };
    }
  }
}
