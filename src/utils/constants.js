const SAMPLE_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BORROWED: 'BORROWED',
  OVERDUE: 'OVERDUE',
  FROZEN: 'FROZEN',
  PENDING_DESTRUCTION: 'PENDING_DESTRUCTION',
  DESTROYED: 'DESTROYED'
};

const REQUEST_TYPE = {
  BORROW: 'BORROW',
  RETURN: 'RETURN',
  RENEW: 'RENEW',
  DESTRUCTION: 'DESTRUCTION'
};

const REQUEST_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
};

const USER_ROLE = {
  APPLICANT: 'APPLICANT',
  LIBRARIAN: 'LIBRARIAN',
  SUPERVISOR: 'SUPERVISOR'
};

const ACTION_TYPE = {
  SAMPLE_REGISTERED: 'SAMPLE_REGISTERED',
  SAMPLE_UPDATED: 'SAMPLE_UPDATED',
  SAMPLE_BORROWED: 'SAMPLE_BORROWED',
  SAMPLE_RETURNED: 'SAMPLE_RETURNED',
  SAMPLE_RENEWED: 'SAMPLE_RENEWED',
  SAMPLE_FROZEN: 'SAMPLE_FROZEN',
  SAMPLE_UNFROZEN: 'SAMPLE_UNFROZEN',
  SAMPLE_DESTROYED: 'SAMPLE_DESTROYED',
  SAMPLE_OVERDUE: 'SAMPLE_OVERDUE',
  REQUEST_CREATED: 'REQUEST_CREATED',
  REQUEST_APPROVED: 'REQUEST_APPROVED',
  REQUEST_REJECTED: 'REQUEST_REJECTED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  ERROR_OCCURRED: 'ERROR_OCCURRED'
};

const ROLE_PERMISSIONS = {
  [USER_ROLE.APPLICANT]: {
    canCreateBorrowRequest: true,
    canCreateReturnRequest: true,
    canCreateRenewRequest: true,
    canCreateDestructionRequest: true,
    canCancelOwnPendingRequest: true,
    canRegisterSample: false,
    canApproveBorrow: false,
    canFreezeSample: false,
    canUnfreezeSample: false,
    canApproveDestruction: false,
    canExportAudit: false
  },
  [USER_ROLE.LIBRARIAN]: {
    canCreateBorrowRequest: false,
    canCreateReturnRequest: false,
    canCreateRenewRequest: false,
    canCreateDestructionRequest: true,
    canCancelOwnPendingRequest: false,
    canRegisterSample: true,
    canApproveBorrow: true,
    canFreezeSample: true,
    canUnfreezeSample: false,
    canApproveDestruction: false,
    canExportAudit: true
  },
  [USER_ROLE.SUPERVISOR]: {
    canCreateBorrowRequest: false,
    canCreateReturnRequest: false,
    canCreateRenewRequest: false,
    canCreateDestructionRequest: false,
    canCancelOwnPendingRequest: false,
    canRegisterSample: false,
    canApproveBorrow: false,
    canFreezeSample: false,
    canUnfreezeSample: true,
    canApproveDestruction: true,
    canExportAudit: true
  }
};

module.exports = {
  SAMPLE_STATUS,
  REQUEST_TYPE,
  REQUEST_STATUS,
  USER_ROLE,
  ACTION_TYPE,
  ROLE_PERMISSIONS
};
