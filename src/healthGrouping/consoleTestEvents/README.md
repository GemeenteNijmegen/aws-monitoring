# Health Console Test Events

Gebruik deze JSON-bestanden in de AWS Lambda console om de nieuwe Health-flow snel handmatig te testen.

## Voorwaarden

- `HEALTH_GROUPING_ENABLED=true` in de environment vars van de lambdas
- de `healthEventLambda` en `healthTimerLambda` zijn gedeployed

## Aanpak

1. Open in AWS de `healthEventLambda`
2. Ga naar het tabblad `Test`
3. Maak een nieuw test event aan
4. Kopieer de inhoud van een van deze bestanden
5. Voer de test uit

## Bestanden

- `healthEventLambda-single-event.json`
  - verwacht: `FIRST`
  - geen `GROUPED`

- `healthEventLambda-full-flow-6-events.json`
  - verwacht:
    - 3 groepen
    - 3x `FIRST`
    - 2x `GROUPED`
    - 1 groep alleen `FIRST`

- `healthEventLambda-full-flow-6-events-unique.json`
  - zelfde flow als hierboven
  - maar met unieke event- en communication-ids
  - handig als de standaard full-flow al eerder tegen dezelfde tabel is gebruikt

## Wat je daarna controleert

- logs van `healthEventLambda`
- logs van `healthTimerLambda`
- Slack-berichten
- eventueel DynamoDB-state van de groepen

## Opmerking

Deze console test events roepen direct de `healthEventLambda` aan. Dan hoef je niet te wachten op een echt health event.
De verdere flow naar SQS en `healthTimerLambda` moet daarna automatisch volgen via de gedeployde infrastructuur.
