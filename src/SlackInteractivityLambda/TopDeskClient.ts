import { AWS } from '@gemeentenijmegen/utils';
import axios, { Axios } from 'axios';

export class TopDeskClient {

  private static readonly entryType = 'Monitoring & Beheer';
  private static readonly callType = 'Incident';
  private static readonly category = 'Generiek';
  private static readonly subCategory = 'AWS';

  private branchId?: string;
  private operatorId?: string;
  private topDeskUser?: string;
  private topDeskPassword?: string;

  async getClient() {

    if (!this.topDeskUser || !this.topDeskPassword) {
      this.topDeskUser = process.env.TOPDESK_USERNAME;
      this.topDeskPassword = await AWS.getSecret(process.env.TOPDESK_PASSWORD_ARN ?? '');
    }
    if (!this.topDeskUser || !this.topDeskPassword) {
      throw Error('No topdesk username or password could be set');
    }

    return new Axios({
      baseURL: process.env.TOPDESK_API_URL,
      auth: {
        username: this.topDeskUser,
        password: this.topDeskPassword,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async obtainRequiredIds() {
    if (this.operatorId && this.branchId) {
      return;
    }
    try {
      const client = await this.getClient();
      const response = await client.get('operatorgroups', {
        params: {
          name: 'Nijmegen - DevOps',
        },
      });
      const operatorGroups = JSON.parse(response.data);
      this.operatorId = operatorGroups[0].id;
      this.branchId = operatorGroups[0].branch.id;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error', error.code, error.message);
      } else {
        console.error(error);
      }
      throw Error('Could not load required ids in topdesk client');
    }
  }

  async createNewTicket(ticket: TicketOptions) {
    await this.obtainRequiredIds();

    const ticketJson = {
      request: ticket.htmlDescription,
      briefDescription: ticket.title,
      status: 'secondLine',
      caller: {
        dynamicName: 'AWS automation',
        branch: {
          id: this.branchId,
        },
      },
      entryType: {
        name: ticket.entryType ?? TopDeskClient.entryType,
      },
      operator: {
        id: this.operatorId,
      },
      operatorGroup: {
        id: this.operatorId,
      },
      category: {
        name: ticket.category ?? TopDeskClient.category,
      },
      subcategory: {
        name: ticket.subCategory ?? TopDeskClient.subCategory,
      },
      callType: {
        name: ticket.callType ?? TopDeskClient.callType,
      },
      priority: {
        name: this.mapPriority(ticket.priority),
      },
    };
    const serialized = JSON.stringify(ticketJson);

    try {
      const client = await this.getClient();
      const response = await client.post('incidents', serialized);
      const topdeskTicket = JSON.parse(response.data);
      return topdeskTicket.id;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error', error.stack, error.message);
      } else {
        console.error(error);
      }
      throw Error('Could not crate topdesk ticket');
    }
  }

  private mapPriority(priority: string) {
    switch (priority) {
      case 'critical':
        return 'B1 - Krietiek';
      case 'high':
        return 'B2 - Hoog';
      case 'medium':
        return 'B3 - Midden';
      case 'low':
        return 'B4 - Laag';
      default:
        return 'B1 - Krietiek';
    }
  }

}


export interface TicketOptions {
  title: string;
  htmlDescription: string;
  priority: 'critical' | 'high' | 'medium' | 'low';

  entryType?: string;
  callType?: string;
  category?: string;
  subCategory?: string;
}