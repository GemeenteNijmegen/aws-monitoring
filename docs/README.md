# Setup of monitoring in Nijmegen LZ

We're interested in landingzone-wide events (e.g. cloudtrail, securityhub are aggregated centrally) and workload-specific events. All workload-events we're interested in are sent to one of 4 priority SNS-topics. These topics
auto-forward to a matching topic in the audit account. A lambda function listens in the audit-account, and processes any (all?) relevant messages, and posts these to a (priority-specific) slack topic. 

The pipeline is set up as follows:
- The central pipeline creates an `AggregatorStack` in the audit-account. This is the stack responsible for subscribing to SNS and forwarding to Slack.
- The central pipeline creates a `MonitoredAccountStack` in *each* workload-account. This stack is responsible for pushing relevant events to the workload SNS topics. This is mostly done by adding eventbridge rules with the topic as target and creating cloudwatch alarms. (TODO: How do alarms get to the audit account?)

A rough diagram:

```mermaid
flowchart TD
    pipeline[[pipeline]]
    workload{{workload-account}}
    audit{{audit-account}}
    mpa{{mpa-account}}
    eventbridge[/eventbridge event/]
    sns-account[SNS in workload-account]
    sns-audit[SNS in audit-account]
    lambda[[Monitoring-lambda]]
    slack([Slack-topics])
    securityhub[Securityhub]

    subgraph accounts
        mpa
        audit
        workload
    end

    subgraph stacks
        pipeline -- MonitoredAccountStack --> workload
        pipeline -- ParameterStack --> audit
        pipeline -- AggregatorStack --> audit
    end
    subgraph events
        workload --> eventbridge --> sns-account --> sns-audit
        audit --> securityhub -- findings --> sns-audit
        mpa -- cloudtrail filter notifications --> sns-audit
    end
    subgraph verwerking
        sns-audit --> lambda --> slack
    end
```

<details>
  <summary>A more detailed diagram</summary>
  Below we'll find a more detailed diagram of the monitoring troughout the landingzone.
  
```mermaid
flowchart TD
    pipeline[[pipeline]]
    workloadEventbridge[/eventbridge events/]
    orgtrail[/orgtrail/]
    sns-account[SNS in workload-account]
    sns-mpa[SNS in mpa-account]
    sns-audit[SNS in audit-account]
    monitoringLambda[[Monitoring-lambda]]
    securityHubOverviewLambda[[SecurityHubOverview-lambda]]
    xebiaOrgTrailLambda[[OrgTrail monitor xebia]]
    nijmegenOrgTrailLambda[[OrgTrail monitor Nijmegen]]
    slack([Slack])
    securityhub[Securityhub]
    inspector[Inspector]
    guardduty[GuardDuty]
    cloudwatch[CloudWatch in workload-account]
    securityHubEventbridgeEvent[/eventbridge event/]

    subgraph mpa-account
        orgtrail
        sns-mpa
        xebiaOrgTrailLambda
        nijmegenOrgTrailLambda
        orgtrail -- events --> nijmegenOrgTrailLambda
        orgtrail -- events --> xebiaOrgTrailLambda
        nijmegenOrgTrailLambda -- notifications --> sns-mpa
    end
    
    sns-account -- forwarded --> sns-audit
    sns-mpa -- forwarded --> sns-audit

    subgraph workload-accounts
        cloudwatch
        workloadEventbridge
        sns-account
        workloadEventbridge -- subscriptions --> sns-account
        cloudwatch -- alarms and log subscriptions --> sns-account
        xebiaOrgTrailLambda -- push metrics --> cloudwatch
    end

    subgraph audit-account
        monitoringLambda
        securityHubOverviewLambda
        securityhub
        inspector -- findings --> securityhub
        guardduty -- findings --> securityhub
        securityhub --> securityHubEventbridgeEvent --> sns-audit
        sns-audit --> monitoringLambda
        monitoringLambda --> slack
        securityhub -- findings --> securityHubOverviewLambda
        securityHubOverviewLambda -- high and ciritcal findings --> slack
    end

    pipeline -- MonitoredAccountStack --> workload-accounts
    pipeline -- "Parameter- and AggregatorStack" --> audit-account
    pipeline -- MpaMonitoringStack --> mpa-account
```
</details> 

## Slack interaction
[Slack interaction documentation can be found here](./SlackInteraction.md)