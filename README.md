# AWS Monitoring

Monitor various resources, events and alarms in AWS accounts.

## Adding an event to be monitored:
- Add the event pattern to the list of subscriptions in `MonitoringTargetStack.addEventSubscriptions`. This will add an rule to eventbridge, and subscribe the SNS topic to this event.
- The monitoring lambda will now receive events of this type. To process them:
   - Add the event type to the `events` mapping in the lambda. Use the `detail-type` as the key.
   - Create a messageFormatter subclass to format the slack message parameters. See `MessageFormatter` for examples. (TODO: Use default messageformatter for unhandled events)
   - Use the subclass name as the value for `formatter` in the `events`-mapping.