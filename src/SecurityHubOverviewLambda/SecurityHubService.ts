import { AwsSecurityFinding, GetFindingsCommand, SecurityHubClient } from '@aws-sdk/client-securityhub';

export const MAX_FINDINGS_PER_CRITICALITY = 50;
export type SeverityLabel = 'CRITICAL' | 'HIGH';

export class SecurityHubService {

  private client: SecurityHubClient;

  constructor(client: SecurityHubClient) {
    this.client = client;
  }

  async getActiveFindings(severityLabel: SeverityLabel): Promise<AwsSecurityFinding[]> {
    const command = new GetFindingsCommand({
      Filters: {
        SeverityLabel: [{ Comparison: 'EQUALS', Value: severityLabel }],
        WorkflowStatus: [
          { Comparison: 'EQUALS', Value: 'NEW' },
          { Comparison: 'EQUALS', Value: 'NOTIFIED' },
        ],
        RecordState: [{ Comparison: 'EQUALS', Value: 'ACTIVE' }],
      },
    });

    const findings: AwsSecurityFinding[] = [];
    let nextToken: string | undefined;
    do {
      command.input.NextToken = nextToken;
      const resp = await this.client.send(command);
      if (resp.Findings) {
        findings.push(...resp.Findings);
      }
      nextToken = resp.NextToken;
    } while (nextToken && findings.length < MAX_FINDINGS_PER_CRITICALITY);
    return findings;
  }
}
