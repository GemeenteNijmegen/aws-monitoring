import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SlackThread } from './models/ArchivedThread';

export class S3StorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(bucketName: string) {
    this.s3Client = new S3Client({});
    this.bucketName = bucketName;
  }

  async storeThread(commandId: string, thread: SlackThread, originalTimestamp: Date): Promise<string> {
    const key = this.generateS3Key(commandId, thread.threadId, originalTimestamp);
    const content = JSON.stringify({
      commandId,
      threadId: thread.threadId,
      archivedAt: new Date().toISOString(),
      messages: thread.messages,
    }, null, 2);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: content,
      ContentType: 'application/json',
    });

    await this.s3Client.send(command);
    return key;
  }

  async storeFile(
    commandId: string,
    threadId: string,
    fileId: string,
    fileName: string,
    fileData: Buffer,
    contentType: string,
    originalTimestamp: Date,
  ): Promise<string> {
    const year = originalTimestamp.getFullYear();
    const month = String(originalTimestamp.getMonth() + 1).padStart(2, '0');
    const day = String(originalTimestamp.getDate()).padStart(2, '0');
    const key = `slack-threads/${year}/${month}/${day}/${commandId}-${threadId}/${fileId}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: fileData,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
    return key;
  }

  private generateS3Key(commandId: string, threadId: string, timestamp: Date): string {
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');

    return `slack-threads/${year}/${month}/${day}/${commandId}-${threadId}.json`;
  }
}