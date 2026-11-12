import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { IntegrationsStack } from '../../IntegrationsStack';

const env = { account: '123456789012', region: 'eu-west-1' };

function synth(props: { deployAuditSlackbot?: boolean; securityHubActionsUserGroupId?: string }) {
  const app = new App();
  const stack = new IntegrationsStack(app, 'int', { env, prefix: 'dev', branchName: 'main', ...props });
  return Template.fromStack(stack);
}

function functionByDescription(template: Template, description: string) {
  const entries = Object.entries(template.findResources('AWS::Lambda::Function', { Properties: { Description: description } }));
  expect(entries).toHaveLength(1);
  return entries[0][1].Properties;
}

describe('SecurityHubActions', () => {
  const template = synth({ deployAuditSlackbot: true, securityHubActionsUserGroupId: 'S1' });

  test('adds a POST /slack method', () => {
    const resources = template.findResources('AWS::ApiGateway::Resource', { Properties: { PathPart: 'slack' } });
    const ids = Object.keys(resources);
    expect(ids).toHaveLength(1);
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      ResourceId: { Ref: ids[0] },
    });
  });

  test('adds no new secrets or tables; audit secrets keep their construct paths', () => {
    template.resourceCountIs('AWS::SecretsManager::Secret', 2);
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    // logical ids are derived from the construct path (audit-support/<id>); they must not change
    const ids = Object.keys(template.findResources('AWS::SecretsManager::Secret')).sort();
    expect(ids[0]).toMatch(/^auditsupportslackbotsecretdev[0-9A-F]{8}$/);
    expect(ids[1]).toMatch(/^auditsupportslackbottokendev[0-9A-F]{8}$/);
  });

  test('stage throttles POST /slack', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      MethodSettings: Match.arrayWith([
        Match.objectLike({
          HttpMethod: 'POST',
          ResourcePath: '/~1slack',
          ThrottlingRateLimit: 5,
          ThrottlingBurstLimit: 10,
        }),
      ]),
    });
  });

  test('rest api does not deliver base64 bodies (no binary media types)', () => {
    const apis = Object.values(template.findResources('AWS::ApiGateway::RestApi'));
    expect(apis).toHaveLength(1);
    expect(apis[0].Properties.BinaryMediaTypes).toBeUndefined();
  });

  test('lambdas get the environment their handlers require', () => {
    const receiver = functionByDescription(template, 'Security Hub actions receiver (Slack interactions)');
    const worker = functionByDescription(template, 'Security Hub actions worker (suppress findings)');
    expect(Object.keys(receiver.Environment.Variables)).toEqual(
      expect.arrayContaining(['SLACK_SECRET_ARN', 'SLACK_BOT_TOKEN_ARN', 'QUEUE_URL']));
    expect(Object.keys(worker.Environment.Variables)).toEqual(
      expect.arrayContaining(['SLACK_BOT_TOKEN_ARN', 'USER_GROUP_ID', 'BRANCH_NAME']));
    expect(worker.Environment.Variables.USER_GROUP_ID).toBe('S1');
  });

  test('IAM permissions', () => {
    const policies = Object.values(template.findResources('AWS::IAM::Policy')) as any[];
    const serialized = JSON.stringify(policies);
    expect(serialized).toContain('securityhub:GetFindings');
    expect(serialized).toContain('securityhub:BatchUpdateFindings');
    expect(serialized).toContain('sqs:SendMessage');
    // both new lambdas read secrets (receiver: both, worker: bot token) on top of the audit ones
    const withSecrets = policies.filter(p => JSON.stringify(p).includes('secretsmanager:GetSecretValue'));
    expect(withSecrets.length).toBeGreaterThanOrEqual(4);
  });
});

describe('SecurityHubActions gating', () => {
  test('absent without user group id', () => {
    const base = synth({ deployAuditSlackbot: true });
    const withActions = synth({ deployAuditSlackbot: true, securityHubActionsUserGroupId: 'S1' });
    expect(Object.keys(base.findResources('AWS::ApiGateway::Resource'))).toHaveLength(1);
    expect(Object.keys(withActions.findResources('AWS::Lambda::Function')).length)
      .toBe(Object.keys(base.findResources('AWS::Lambda::Function')).length + 2);
    base.resourceCountIs('AWS::SQS::Queue', 0);
    const settings = Object.values(base.findResources('AWS::ApiGateway::Stage'))
      .flatMap((s: any) => s.Properties.MethodSettings ?? []);
    expect(JSON.stringify(settings)).not.toContain('~1slack');
  });

  test.each([false, undefined])('throws when deployAuditSlackbot is %s', (deploy) => {
    expect(() => synth({ deployAuditSlackbot: deploy, securityHubActionsUserGroupId: 'S1' }))
      .toThrow('securityHubActionsUserGroupId requires deployAuditSlackbot');
  });
});
