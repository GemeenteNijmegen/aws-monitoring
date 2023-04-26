import { aws_events_targets, aws_ssm } from 'aws-cdk-lib';
import { EventPattern, Rule } from 'aws-cdk-lib/aws-events';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { ITopic, Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

interface EventSubscriptionProps {
  criticality: 'low' | 'medium' | 'high' | 'critical';
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

    const topic = this.topic(props.criticality);
    const rule = new Rule(this, `${id}-rule`, {
      description: props.ruleDescription,
      targets: [new aws_events_targets.SnsTopic(topic)],
      eventPattern: props.pattern,
    });

    const principal = new ServicePrincipal('events.amazonaws.com', {
      conditions: { StringEquals: { 'sns:Endpoint': rule.ruleArn } },
    });
    topic.grantPublish(principal);
  }

  private topic(criticality: string): ITopic {
    const arn = aws_ssm.StringParameter.valueForStringParameter(this,
      `/landingzone/platform-events/${criticality}-sns-topic-arn`);
    return Topic.fromTopicArn(this, 'topic', arn);
  }
}
