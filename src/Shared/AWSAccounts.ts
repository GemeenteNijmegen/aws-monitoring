import { OrganizationsClient, ListAccountsCommand } from '@aws-sdk/client-organizations';

export class AWSAccounts {
  private accounts?: { [key: string]: string };

  /**
   * From the delegated admin account (gn-audit) or organization root (gn-mpa)
   * we can get a list full list of account names.
   * This class requests and caches the account information.
   * Note: can only be used in gn-audit or gn-mpa accounts! 
   * Note2: Lambda using this requires organizations:ListAccounts permission
   */
  constructor() {}

  private async obtainAccountInformation(){
    this.accounts = {};
    const client = new OrganizationsClient();

    let nextToken: any = '';
    while(nextToken != undefined){

      const command = new ListAccountsCommand({
        MaxResults: 20, // max api allows
        NextToken: nextToken === '' ? undefined : nextToken,
      });
  
      const result = await client.send(command);
      result.Accounts?.forEach(account => {
        const accountId = account.Id ?? 'unknown';
        const accountName = account.Name ?? 'unknown';
        if(this.accounts){
          this.accounts[accountId] = accountName;
        }
      });
      nextToken = result.NextToken;

    }
  }

  /**
   * Use the list-accounts api to collect a list of accounts and
   * lookup the account name.
   * @param account
   * @returns - account name if found or account param otherwise
   */
  lookupAccountName(account: string) {
    if(!this.accounts){
      this.obtainAccountInformation()
        .catch(() => { throw new Error('Could not load accounts list')})
        .then(() => console.info('Successfully obtained account list, cached now.'));
    }
    const name = this.accounts?.[account];
    return name ?? account;
  }

}