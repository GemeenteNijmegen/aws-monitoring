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


## Slack interaction
[Slack interaction documentation can be found here](./SlackInteraction.md)