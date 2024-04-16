import { StackSetStack } from 'cdk-stacksets';
import { Construct } from 'constructs';
import { EventBusForwardingRule } from './EventBusForwardingRule';

interface EventbridgeForwarderStackProps {
  targetRegion: string;
}
/**
 * Some alarms or other eventbridge events end up outside our primary region.
 * This stack forwards events to the event bus in the default region.
 */
export class EventbridgeForwarderStack extends StackSetStack {
  constructor(scope: Construct, id: string, props: EventbridgeForwarderStackProps) {
    super(scope, id);

    new EventBusForwardingRule(this, 'forward', {
      targetRegion: props.targetRegion,
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
      },
    });
  }
}
