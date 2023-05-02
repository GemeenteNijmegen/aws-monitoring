# AWS Monitoring

Monitor various resources, events and alarms in AWS accounts.

## Adding an event to be monitored:
- Add the event pattern to the list of subscriptions in `MonitoringTargetStack.addEventSubscriptions`. This will add an rule to eventbridge, and subscribe the SNS topic to this event.
- The monitoring lambda will now receive events of this type. To process them:
   - Add the event type to the `events` mapping in the lambda. Use the `detail-type` as the key.
   - Create a messageFormatter subclass to format the slack message parameters. See `MessageFormatter` for examples. (TODO: Use default messageformatter for unhandled events)
   - Use the subclass name as the value for `formatter` in the `events`-mapping.

## Installatie
Om de eerste keer te installeren moet een handmatige deploy gedaan worden. Zorg dat je naar de gn-build-account deployt. Vanuit daar worden afhankelijk van de gekozen branch in de juiste account resources aangemaakt. Let op dat je environment de juiste branch moet hebben. Daarnaast moet je bij de eerste deploy de arn van de codestarConnection naar Github meegeven. Een voorbeeld:
``` 
export BRANCH_NAME=acceptance
export AWS_PROFILE=deployment
cdk deploy --parameters connectionArn=<arnvancodestarconnection>
```
Vervolgens worden wijzigingen in de verbonden repository in de gekoppelde branche door de pipeline opgepakt.
