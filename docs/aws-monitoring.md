### Overzicht huidige monitoring
- SNS Topics naar Slack (en nog oude naar Teams), zoals CWAlert topic in audit account, eform submissions topic in accp.
- Generiek monitoring project waarin EventBridge wordt gebruikt om events af te vangen en te loggen naar Slack.
- Alarms binnen CloudWatch, zoals 'Application Insights vanuit lambda's' en 'TotalErrorRate' vanuit CloudFront.
- Loggroups 'filters' in cloudwatch.
- Pipeline notificaties: direct via de codepipeline notificatie service naar Husran en Saskia in webformulieren project en Eventbridge? + irma pipelines naar Operations channel.
- Eventbridge ruels zoals: 'Notifications on EC2 BastionHost start events', 'Notifications on container start and stop events', 'Triggers notification to Event Bus in audit account when Drift Detection detected', 'GuardDuty Findings event rule'
- Cloudtrail
- IRMA security findings in operations channel.
- Health Dashboard
- ApplicationInisghts
- Devops Guru

### Overzicht lopende monitoring projecten
- Application Logging (via X-Ray in mijn-nijmegen). Potentieel om uit te breiden naar andere projecten.
- Onderzoek naar andere logging mechanismes zoals: DevOps Guru log anlomaly detection, Contributer Insights...
- Container scanning generiek regelen zie: https://github.com/GemeenteNijmegen/devops/issues/46

### Aws-Monitoring
![aws-monitoring-v1 drawio](https://user-images.githubusercontent.com/7393481/194315447-704b065a-1468-418f-b3fc-e79c4d0e4da0.png)

### Aws-Monitoring-Totaal
![aws-monitoring-totaal-v1 drawio(3)](https://user-images.githubusercontent.com/7393481/194315547-b3d0423a-1639-41fc-92a0-fc08eb35a083.png)

