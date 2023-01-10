fields @timestamp, errorMessage, userIdentity.invokedBy, @message, userIdentity.principalId as id
| filter errorCode in [ 'UnauthorizedOperation', 'AccessDenied']
| filter userIdentity.sessionContext.sessionIssuer.userName != 'oblcc-capacity'
| filter id not like /.*:b.withaar/ 
    and id not like /.*:m.dessing/ 
    and id not like /.*:m.vandijk/ 
    and id not like /.*:j.vanderborg/