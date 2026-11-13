import { AwsSecurityFinding, GetFindingsCommand, SecurityHubClient } from '@aws-sdk/client-securityhub';

export class SecurityHubFindingLookup {
  private client: SecurityHubClient;

  constructor(client?: SecurityHubClient) {
    this.client = client ?? new SecurityHubClient({
      maxAttempts: 3,
      requestHandler: { requestTimeout: 5000 },
    });
  }

  /**
   * The single matching finding, or undefined when there is none, more than one, or the lookup fails.
   */
  async lookup(payload: any): Promise<AwsSecurityFinding | undefined> {
    try {
      const resourceIds: string[] = (payload?.Resources ?? [])
        .map((r: any) => r?.Id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
      if (resourceIds.length === 0) {
        return undefined;
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
      return findings.length === 1 ? findings[0] : undefined;
    } catch (error) {
      console.error('Security Hub finding lookup failed', error);
      return undefined;
    }
  }
}
