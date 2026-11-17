import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Code } from 'aws-cdk-lib/aws-lambda';
import { IntegrationsStack } from '../../IntegrationsStack';

// Stacks synth without bundled assets (/assets is only built by `projen bundle`)
const fromAsset = Code.fromAsset;
jest.spyOn(Code, 'fromAsset').mockImplementation(() => fromAsset(__dirname));

test('audit secrets keep their logical ids, so CloudFormation never replaces them', () => {
  const app = new App();
  const stack = new IntegrationsStack(app, 'int', {
    env: { account: '123456789012', region: 'eu-west-1' },
    prefix: 'dev',
    branchName: 'main',
    deployAuditSlackbot: true,
    securityHubActionsUserGroupId: 'S1',
  });
  // A changed id means a new secret: the Slack signing secret and bot token would be lost
  const ids = Object.keys(Template.fromStack(stack).findResources('AWS::SecretsManager::Secret')).sort();
  expect(ids).toEqual(['auditsupportslackbotsecretdev0A0591C0', 'auditsupportslackbottokendev7F3EC6F5']);
});
