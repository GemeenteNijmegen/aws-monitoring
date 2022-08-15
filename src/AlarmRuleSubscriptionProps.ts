import { aws_events_targets, aws_kms, aws_sns } from 'aws-cdk-lib';
import { Rule } from 'aws-cdk-lib/aws-events';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface AlarmRuleSubscriptionProps {
  topic: aws_sns.Topic;
  topicKey: aws_kms.Key;
}
export class AlarmRuleSubscription extends Construct {

  constructor(scope: Construct, id: string, props: AlarmRuleSubscriptionProps) {
    super(scope, id);
    const alarmRule = new Rule(this, 'alarm-state-changed', {
      description: 'Send all alarm state change notifications to SNS',
      targets: [new aws_events_targets.SnsTopic(props.topic)],
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
      },
    });

    const principal = new ServicePrincipal('events.amazonaws.com', {
      conditions: { StringEquals: { 'sns:Endpoint': alarmRule.ruleArn } },
    });

    props.topic.grantPublish(principal);
  }
}
