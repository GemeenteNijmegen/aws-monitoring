import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AggregatorStack } from './AggregatorStack';

describe('AggregatorStack monitoring lambda', () => {
  const app = new App();
  const stack = new AggregatorStack(app, 'agg', {
    env: { account: '123456789012', region: 'eu-central-1' },
    prefix: 'dev',
    branchName: 'sandbox',
  });
  const template = Template.fromStack(stack);

  test('has a 30 second timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Description: 'Slack notification lambda (dev)',
      Timeout: 30,
    });
  });

  test('may look up security hub findings', () => {
    const functions = template.findResources('AWS::Lambda::Function', {
      Properties: { Description: 'Slack notification lambda (dev)' },
    });
    const [functionId] = Object.keys(functions);
    const roleRef = functions[functionId].Properties.Role['Fn::GetAtt'][0];

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'securityhub:GetFindings',
            Effect: 'Allow',
            Resource: '*',
          }),
        ]),
      },
      Roles: Match.arrayWith([{ Ref: roleRef }]),
    });
  });
});
