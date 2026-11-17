export const SUPPRESS_ACTION_ID = 'securityhub_suppress';

export interface FindingRef {
  id: string;
  productArn: string;
}

export const SUPPRESS_CALLBACK_ID = 'securityhub_suppress_reason';
export const REASON_BLOCK_ID = 'reason';
export const REASON_ACTION_ID = 'reason_input';
export const MAX_REASON_LENGTH = 400;

export interface SuppressMetadata extends FindingRef {
  responseUrl: string;
}

export interface SuppressJob extends SuppressMetadata {
  slackUserId: string;
  reason: string;
}

export function decodeButtonValue(value: string): FindingRef {
  const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf-8'));
  if (!parsed || typeof parsed.id !== 'string' || typeof parsed.productArn !== 'string' || !parsed.id || !parsed.productArn) {
    throw new Error('Invalid button value');
  }
  return { id: parsed.id, productArn: parsed.productArn };
}

export function buildSuppressView(meta: SuppressMetadata): object {
  return {
    type: 'modal',
    callback_id: SUPPRESS_CALLBACK_ID,
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: 'Suppress finding' },
    submit: { type: 'plain_text', text: 'Suppress' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: REASON_BLOCK_ID,
        label: { type: 'plain_text', text: 'Reason' },
        element: {
          type: 'plain_text_input',
          action_id: REASON_ACTION_ID,
          multiline: true,
          max_length: MAX_REASON_LENGTH,
        },
      },
    ],
  };
}
