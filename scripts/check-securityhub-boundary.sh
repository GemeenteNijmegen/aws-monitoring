#!/usr/bin/env bash
# Read-only check: does the landingzone workload permissions boundary allow the
# Security Hub actions the suppress worker needs?
#
# Every call here is a read or an IAM policy simulation. Nothing is created,
# changed or deleted, and no Security Hub findings are touched.
#
# Usage:
#   AWS_PROFILE=<audit-profile> ./scripts/check-securityhub-boundary.sh [worker-role-name]
#
# Arguments:
#   worker-role-name  Optional. The deployed worker Lambda role. If you pass it,
#                     check 3 also simulates that real role (its own policies
#                     plus the boundary).
#
# Required read permissions: iam:ListPolicies, iam:GetPolicy, iam:GetPolicyVersion,
# iam:SimulateCustomPolicy, plus iam:GetRole and iam:SimulatePrincipalPolicy for check 3.
#
# Not covered: organization SCPs. IAM simulation does not evaluate them.

set -euo pipefail

BOUNDARY_NAME="landingzone-workload-permissions-boundary"
ACTIONS=(securityhub:GetFindings securityhub:BatchUpdateFindings)
ROLE_NAME="${1:-}"

echo "== Caller identity (confirm this is the audit account) =="
aws sts get-caller-identity --output table

echo
echo "== 1. Boundary policy document =="
ARN=$(aws iam list-policies --scope Local \
  --query "Policies[?PolicyName=='${BOUNDARY_NAME}'].Arn" --output text)
if [[ -z "$ARN" || "$ARN" == "None" ]]; then
  echo "No customer-managed policy named ${BOUNDARY_NAME} in this account." >&2
  exit 1
fi
echo "Policy ARN: $ARN"

VER=$(aws iam get-policy --policy-arn "$ARN" --query 'Policy.DefaultVersionId' --output text)
echo "Default version: $VER"

DOC=$(aws iam get-policy-version --policy-arn "$ARN" --version-id "$VER" \
  --query 'PolicyVersion.Document' --output json)
echo "$DOC"

echo
echo "== 2. Simulate the boundary against the required actions =="
IDENTITY_POLICY='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["securityhub:GetFindings","securityhub:BatchUpdateFindings"],"Resource":"*"}]}'
aws iam simulate-custom-policy \
  --policy-input-list "$IDENTITY_POLICY" \
  --permissions-boundary-policy-input-list "$DOC" \
  --action-names "${ACTIONS[@]}" \
  --query 'EvaluationResults[].{action:EvalActionName,decision:EvalDecision,boundaryAllowed:PermissionsBoundaryDecisionDetail.AllowedByPermissionsBoundary}' \
  --output table

if [[ -n "$ROLE_NAME" ]]; then
  echo
  echo "== 3. Simulate the deployed worker role: ${ROLE_NAME} =="
  aws iam get-role --role-name "$ROLE_NAME" \
    --query 'Role.{arn:Arn,boundary:PermissionsBoundary.PermissionsBoundaryArn}' --output table
  ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)
  aws iam simulate-principal-policy --policy-source-arn "$ROLE_ARN" \
    --action-names "${ACTIONS[@]}" \
    --query 'EvaluationResults[].{action:EvalActionName,decision:EvalDecision}' \
    --output table
else
  echo
  echo "(Check 3 skipped: pass the worker role name as an argument to simulate the deployed role.)"
fi

echo
echo "Reading the results: 'allowed' with boundaryAllowed=True means the boundary permits the action."
echo "'implicitDeny' or 'explicitDeny' means it blocks the action."
