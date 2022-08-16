import { aws_events_targets, aws_kms, aws_sns } from 'aws-cdk-lib';
import { EventPattern, Rule } from 'aws-cdk-lib/aws-events';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface EventSubscriptionProps {
  topic: aws_sns.Topic;
  pattern: EventPattern;
  ruleDescription: string;
}
export class EventSubscription extends Construct {
  /**
   * Add an eventbridge rule for an event pattern, and
   * subscribe the provided SNS topic to this rule. Also
   * grants eventbridge publish permissions for this rule.
   */
  constructor(scope: Construct, id: string, props: EventSubscriptionProps) {
    super(scope, id);

    const rule = new Rule(this, `${id}-rule`, {
      description: props.ruleDescription,
      targets: [new aws_events_targets.SnsTopic(props.topic)],
      eventPattern: props.pattern,
    });

    const principal = new ServicePrincipal('events.amazonaws.com', {
      conditions: { StringEquals: { 'sns:Endpoint': rule.ruleArn } },
    });
    props.topic.grantPublish(principal);
  }
}
