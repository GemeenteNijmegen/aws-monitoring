import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MonitoringTargetStack } from '../src/MonitoringTargetStage';

test('Snapshot', () => {
  const app = new App();
  const stack = new MonitoringTargetStack(app, 'test');

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});