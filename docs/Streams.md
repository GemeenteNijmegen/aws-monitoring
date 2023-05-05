# Streams from topic to slack

| Topics                      | Slack app          | Channels                |
| --------------------------- | ------------------ | ----------------------- |
| critical                    | Monitoring         | monitoring-critical     |
| high                        | Monitoring         | monitoring-high         |
| medium                      | Monitoring         | monitoring-medium       |
| low                         | Monitoring         | monitoring-low          |
| critical                    | Sandbox monitoring | monitoring-dev-critical |
| high                        | Sandbox monitoring | monitoring-dev-high     |
| medium                      | Sandbox monitoring | monitoring-dev-medium   |
| low                         | Sandbox monitoring | monitoring-dev-low      |
| critical, high, medium, low | Monitoring*        | monitoring-all          |

\* Uses the Xebia provied lambda intergraiont to forward all events in JSON.