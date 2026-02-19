import { Criticality } from '@gemeentenijmegen/aws-constructs';
import { Duration, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { Statics } from './statics';

const VPN_TUNNEL_ALARM_CRITICALITY = Criticality.fromString('critical');

export interface NetworkStackProps extends StackProps {
  /**
   * VPN Gateway ID to monitor
   */
  vpnGatewayId?: string;
}

export class NetworkStack extends Stack {
  constructor(scope: Construct, id: string, props?: NetworkStackProps) {
    super(scope, id, props);

    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    this.addVpnTunnelDownAlarm(props?.vpnGatewayId);
  }

  /**
   * Add an alarm for VPN tunnel state.
   *
   * Alarm triggers when a VPN tunnel is down.
   */
  private addVpnTunnelDownAlarm(vpnGatewayId?: string) {
    const metric = new Metric({
      metricName: 'TunnelState',
      namespace: 'AWS/VPN',
      statistic: 'Maximum',
      period: Duration.minutes(5),
      dimensionsMap: vpnGatewayId ? {
        VpnId: vpnGatewayId,
      } : undefined,
    });

    new Alarm(this, 'vpn-tunnel-down', {
      alarmName: `vpn-tunnel-down${VPN_TUNNEL_ALARM_CRITICALITY.alarmSuffix()}`,
      metric: metric,
      evaluationPeriods: 2,
      threshold: 0.5,
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
      alarmDescription: 'VPN tunnel is down - connectivity may be impacted',
    });
  }
}