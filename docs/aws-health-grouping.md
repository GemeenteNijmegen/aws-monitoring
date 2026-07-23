# AWS Health grouping

AWS Health-berichten kunnen voor meerdere accounts inhoudelijk hetzelfde zijn.

Bij een grotere issue of outage is `detail.eventArn` meestal hetzelfde voor het bredere Health-incident over die accounts heen. Bijvoorbeeld een outage van Cloudfront wereldwijd. Dat raakt veel accounts en AWS zal dan gedurende het incident meerdere updates geven over de voortgang.

Binnen datzelfde incident heeft iedere inhoudelijke update een eigen `detail.communicationId`.

`detail.eventScopeCode` is volgens AWS `PUBLIC` of `ACCOUNT_SPECIFIC`.
Voor deze eerste iteratie is dat minder bepalend, omdat we het eerste Health-event altijd direct naar Slack sturen en pas vervolgevents groeperen.

Praktisch:

- zelfde `eventArn` + zelfde `communicationId`
  - zelfde communicatie over meerdere accounts
- zelfde `eventArn` + andere `communicationId`
  - zelfde incident, maar een andere inhoudelijke update

Voor grouping op hetzelfde Slack-bericht is `detail.communicationId` daarom de belangrijkste sleutel.

## Functionele flow

```mermaid
flowchart TD
  A[AWS Health event via SNS] -->|ontvang| B[healthEventLambda]
  B -->|bepaal sleutel| C[Groepssleutel bepalen<br/>eventArn + communicationId]
  C -->|sla event op| H[Event item opslaan in DynamoDB]
  C -->|check| D{Bestaat groep al?}

  D -->|nee| E[FIRST naar Slack]
  E -->|maak groep| F[Group item opslaan in DynamoDB]
  F -->|plan timer| G[Timerbericht naar SQS queue]

  G -->|wacht| I[SQS delivery delay]
  I -->|lever af| J[healthTimerLambda]
  J -->|laad groep + events| K[Groep en events ophalen uit DynamoDB]
  K -->|tel events| L{Aantal events > 1?}

  L -->|nee| M[Groep sluiten in DynamoDB]
  L -->|ja| N[GROUPED naar Slack]
  N -->|sluit groep| O[Groep sluiten in DynamoDB]
```

AWS docs:
https://docs.aws.amazon.com/health/latest/ug/aws-health-events-eventbridge-schema.html
https://docs.aws.amazon.com/health/latest/ug/pagnation-of-health-events.html
