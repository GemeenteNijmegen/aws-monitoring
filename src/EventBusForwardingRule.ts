import { Stack } from 'aws-cdk-lib';
import { EventBus, EventPattern, Rule } from 'aws-cdk-lib/aws-events';
import { EventBus as EventBusTarget } from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

interface EventBusForwardingRuleProps {
  /**
   * Specify which region events should end up in
   */
  targetRegion: string;
  /**
   * Specific target Eventbus ARN
   */
  targetBusArn?: string;
  /**
   * If provided, only events conforming to this pattern will be forwarded.
   */
  eventPattern?: EventPattern;
}
/** Create an event forwarding rule to a different region
 *
 * Provide just the target region to forward all events to the default bus in that region,
 * provide a specific target ARN to target a specific event bus.
 */
export class EventBusForwardingRule extends Construct {
  constructor(scope: Construct, id: string, props: EventBusForwardingRuleProps) {
    super(scope, id);
    const targetBusArn = props.targetBusArn ?? `arn:aws:events:${props.targetRegion}:${Stack.of(this).account}:event-bus/default`;
    const targetBus = EventBus.fromEventBusArn(this, 'target-event-bus', targetBusArn);
    new Rule(this, 'forward', {
      description: `Route events to ${props.targetRegion}`,
      targets: [new EventBusTarget(targetBus)],
      eventPattern: props.eventPattern,
    });
  }
}
