import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { MonitoringTargetStack } from '../src/MonitoringTargetStage';

test('Snapshot', () => {
  const app = new App();
  const stack = new MonitoringTargetStack(app, 'test', { accountName: 'sandbox', env: { account: '123', region: 'eu-west-1' } });

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});

describe('cdk-nag AwsSolutions Pack', () => {
  let app: App;
  let stack: Stack;
  beforeAll(() => {
    // GIVEN
    app = new App();
    stack = new MonitoringTargetStack(app, 'test', { accountName: 'sandbox', env: { account: '123', region: 'eu-west-1' } });

    Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));
  });

  // THEN
  test('No unsuppressed Warnings', () => {
    const warnings = Annotations.fromStack(stack).findWarning(
      '*',
      Match.stringLikeRegexp('AwsSolutions-.*'),
    );
    expect(warnings).toHaveLength(0);
  });

  test('No unsuppressed Errors', () => {
    const errors = Annotations.fromStack(stack).findError(
      '*',
      Match.stringLikeRegexp('AwsSolutions-.*'),
    );
    expect(errors).toHaveLength(0);
  });
});