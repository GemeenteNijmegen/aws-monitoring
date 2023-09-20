import * as fs from 'fs';
import { Configuration } from '../../DeploymentEnvironments';
import { OrgTrailMonitorHandler } from '../OrgTrailMonitorHandler';
//import { mockClient} from 'aws-sdk-client-mock';
//import { SNSClient } from '@aws-sdk/client-sns';

/**
 * I know we should use mockClient
 * However: https://github.com/m-radzikowski/aws-sdk-client-mock/issues/185
 */
class SNSClient {
  public results: any[] = [];
  send(command: any) {
    this.results.push(command);
  }
  reset() {
    this.results = [];
  }
}

describe('orgtrail', () => {

  const sns = new SNSClient() as any;
  const assumeRoleEvent = JSON.parse(fs.readFileSync(__dirname + '/orgTrailAssumeRoleSAML.json', 'utf-8'));
  const generateDataKeyEvent = JSON.parse( fs.readFileSync(__dirname + '/orgTrailGenerateDataKey.json', 'utf-8'));

  // Test related statics
  const keyArn = 'arn:aws:kms:eu-central-1:123456789012:key/xxxx-xxxx-xxxx-xxxx';
  const roleName = 'role-name';

  beforeEach(() => {
    sns.reset();
    process.env.SNS_ALERTS_LOW = 'arn:sns:eu-central-1:123456789012:test-sns-low';
    process.env.SNS_ALERTS_MEDIUM = 'arn:sns:eu-central-1:123456789012:test-sns-medium';
    process.env.SNS_ALERTS_HIGH = 'arn:sns:eu-central-1:123456789012:test-sns-high';
    process.env.SNS_ALERTS_CRITICAL = 'arn:sns:eu-central-1:123456789012:test-sns-critical';
  });

  test('assume role (global)', async () => {
    const config: Configuration = {
      branchName: 'test',
      environmentName: 'development',
      pipelineStackCdkName: 'test',
      globalMonitoringRules: [
        {
          description: 'test',
          priority: 'high',
          roleMonitoring: {
            roleName: roleName,
          },
        },
      ],
      deployToEnvironments: [
        {
          accountName: 'test',
          env: {
            account: '123456789012',
            region: 'eu-central-1',
          },
        },
      ],
    };
    const handler = new OrgTrailMonitorHandler(config, sns);
    const events = convertToLogEvents(assumeRoleEvent) as any;
    await handler.handleLogEvents(events);
    expect(sns.results).toHaveLength(1);
    expect(sns.results[0].input.Message).toContain('AssumeRole event detected for role role-name');
  });

  test('assume role (account specific)', async () => {
    const config: Configuration = {
      branchName: 'test',
      environmentName: 'development',
      pipelineStackCdkName: 'test',
      deployToEnvironments: [
        {
          accountName: 'test',
          env: {
            account: '123456789012',
            region: 'eu-central-1',
          },
          monitoringRules: [
            {
              description: 'test',
              priority: 'high',
              roleMonitoring: {
                roleName: roleName,
              },
            },
          ],
        },
      ],
    };
    const handler = new OrgTrailMonitorHandler(config, sns);
    const events = convertToLogEvents(assumeRoleEvent) as any;
    await handler.handleLogEvents(events);
    expect(sns.results).toHaveLength(1);
    expect(sns.results[0].input.Message).toContain('AssumeRole event detected for role role-name');
    expect(sns.results[0].input.Message).toContain('GemeenteNijmegen/mpa-monitoring-event');
  });

  test('no result on assume role in different account', async () => {
    const config: Configuration = {
      branchName: 'test',
      environmentName: 'development',
      pipelineStackCdkName: 'test',
      deployToEnvironments: [
        {
          accountName: 'test',
          env: {
            account: '111111111111',
            region: 'eu-central-1',
          },
          monitoringRules: [
            {
              description: 'test',
              priority: 'high',
              roleMonitoring: {
                roleName: roleName,
              },
            },
          ],
        },
      ],
    };
    const handler = new OrgTrailMonitorHandler(config, sns);
    const events = convertToLogEvents(assumeRoleEvent) as any;
    await handler.handleLogEvents(events);
    expect(sns.results).toHaveLength(0);
  });

  test('kms key (global)', async () => {
    const config: Configuration = {
      branchName: 'test',
      environmentName: 'development',
      pipelineStackCdkName: 'test',
      globalMonitoringRules: [
        {
          description: 'test',
          priority: 'high',
          keyMonitoring: {
            keyArn: keyArn,
            eventNames: ['GenerateDataKey'],
          },
        },
      ],
      deployToEnvironments: [
        {
          accountName: 'test',
          env: {
            account: '123456789012',
            region: 'eu-central-1',
          },
        },
      ],
    };
    const handler = new OrgTrailMonitorHandler(config, sns);

    const events = convertToLogEvents(generateDataKeyEvent) as any;
    await handler.handleLogEvents(events);
    expect(sns.results).toHaveLength(1);
    expect(sns.results[0].input.Message).toContain('KMS key GenerateDataKey event detected');
    expect(sns.results[0].input.Message).toContain('arn:aws:kms:eu-central-1:123456789012:key/xxxx-xxxx-xxxx-xxxx');
    expect(sns.results[0].input.Message).toContain('logs.amazonaws.com');
    expect(sns.results[0].input.Message).toContain('GemeenteNijmegen/mpa-monitoring-event');
  });

  test('kms key different event', async () => {
    const config: Configuration = {
      branchName: 'test',
      environmentName: 'development',
      pipelineStackCdkName: 'test',
      deployToEnvironments: [
        {
          accountName: 'test',
          env: {
            account: '123456789012',
            region: 'eu-central-1',
          },
          monitoringRules: [
            {
              description: 'test',
              priority: 'high',
              keyMonitoring: {
                keyArn: keyArn,
                eventNames: ['ABC'],
              },
            },
          ],
        },
      ],
    };
    const handler = new OrgTrailMonitorHandler(config, sns);
    const events = convertToLogEvents(generateDataKeyEvent) as any;
    await handler.handleLogEvents(events);
    expect(sns.results).toHaveLength(0);
  });

  test('kms key (global)', async () => {
    const config: Configuration = {
      branchName: 'test',
      environmentName: 'development',
      pipelineStackCdkName: 'test',
      globalMonitoringRules: [
        {
          description: 'test',
          priority: 'high',
          keyMonitoring: {
            keyArn: keyArn,
            eventNames: ['GenerateDataKey'],
          },
        },
        {
          description: 'test',
          priority: 'high',
          roleMonitoring: {
            roleName: roleName,
          },
        },
      ],
      deployToEnvironments: [
        {
          accountName: 'test',
          env: {
            account: '123456789012',
            region: 'eu-central-1',
          },
        },
      ],
    };
    const handler = new OrgTrailMonitorHandler(config, sns);

    const events = convertToLogEvents(generateDataKeyEvent, assumeRoleEvent) as any;
    await handler.handleLogEvents(events);
    expect(sns.results).toHaveLength(2);
  });

});


function convertToLogEvents(...events: any[]) {
  return {
    logEvents: events.map(event => {
      return {
        id: '1',
        timestamp: '2022-01-01T12:12:00',
        message: JSON.stringify(event),
      };
    }),
  };
}
