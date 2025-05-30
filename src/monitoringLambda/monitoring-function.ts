// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

/**
 * Props for MonitoringFunction
 */
export interface MonitoringFunctionProps extends lambda.FunctionOptions {
}

/**
 * An AWS Lambda function which executes src/monitoringLambda/monitoring.
 */
export class MonitoringFunction extends lambda.Function {
  constructor(scope: Construct, id: string, props?: MonitoringFunctionProps) {
    super(scope, id, {
      description: 'src/monitoringLambda/monitoring.lambda.ts',
      ...props,
      runtime: new lambda.Runtime('nodejs22.x', lambda.RuntimeFamily.NODEJS),
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../assets/monitoringLambda/monitoring.lambda')),
    });
    this.addEnvironment('AWS_NODEJS_CONNECTION_REUSE_ENABLED', '1', { removeInEdge: true });
  }
}