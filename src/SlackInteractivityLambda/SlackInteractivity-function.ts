// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

/**
 * Props for SlackInteractivityFunction
 */
export interface SlackInteractivityFunctionProps extends lambda.FunctionOptions {
}

/**
 * An AWS Lambda function which executes src/SlackInteractivityLambda/SlackInteractivity.
 */
export class SlackInteractivityFunction extends lambda.Function {
  constructor(scope: Construct, id: string, props?: SlackInteractivityFunctionProps) {
    super(scope, id, {
      description: 'src/SlackInteractivityLambda/SlackInteractivity.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../assets/SlackInteractivityLambda/SlackInteractivity.lambda')),
    });
    this.addEnvironment('AWS_NODEJS_CONNECTION_REUSE_ENABLED', '1', { removeInEdge: true });
  }
}