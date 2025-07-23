import { SSMClient, UpdateServiceSettingCommand } from '@aws-sdk/client-ssm';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
} from 'aws-lambda';


/**
 * Entry point of the custom resource
 */
exports.handler = async (event: CloudFormationCustomResourceEvent): Promise<CloudFormationCustomResourceResponse> => {
  console.log(JSON.stringify(event));
  switch (event.RequestType) {
    case 'Create': return onCreateUpdate(event);
    case 'Update': return onCreateUpdate(event);
    case 'Delete': return response('SUCCESS', event, 'Note: the setting is not changed back');
  }
};

async function onCreateUpdate(event: CloudFormationCustomResourceEvent): Promise<CloudFormationCustomResourceResponse> {
  try {
    const ssm = new SSMClient();
    await ssm.send(new UpdateServiceSettingCommand({
      SettingId: '/ssm/documents/console/public-sharing-permission',
      SettingValue: 'Disable',
    }));
    return response('SUCCESS', event);
  } catch (error) {
    console.error(error);
    return response('FAILED', event, JSON.stringify(error));
  }
}

/**
 * Return reponse to CloudFormation
 * @param status
 * @param event
 * @param reason
 * @returns
 */
function response(
  status: 'SUCCESS' | 'FAILED',
  event: CloudFormationCustomResourceEvent,
  reason?: string,
): CloudFormationCustomResourceResponse {
  return {
    Status: status,
    Reason: reason ? reason : '',
    LogicalResourceId: event.LogicalResourceId,
    PhysicalResourceId: event.ResourceProperties.PhysicalResourceId,
    RequestId: event.RequestId,
    StackId: event.StackId,
  };
}
