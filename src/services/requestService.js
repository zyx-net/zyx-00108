const dataStore = require('../utils/dataStore');
const auditService = require('./auditService');
const sampleService = require('./sampleService');
const { generateId, now, addDays } = require('../utils/helpers');
const { SAMPLE_STATUS, REQUEST_TYPE, REQUEST_STATUS, ACTION_TYPE } = require('../utils/constants');
const crypto = require('crypto');

class RequestService {
  constructor() {
    this.operationLocks = new Map();
  }

  async acquireOperationLock(requestId, operation, timeout = 5000) {
    const lockKey = `${requestId}:${operation}`;
    const lockId = crypto.randomUUID();
    const startTime = Date.now();

    while (this.operationLocks.has(lockKey)) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Operation timeout: concurrent operation in progress');
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    this.operationLocks.set(lockKey, lockId);
    return lockId;
  }

  async releaseOperationLock(requestId, operation, lockId) {
    const lockKey = `${requestId}:${operation}`;
    if (this.operationLocks.get(lockKey) === lockId) {
      this.operationLocks.delete(lockKey);
    }
  }

  verifyCreatorIdentity(request, user, userRole) {
    const creatorNameMatch = request.creator === user;
    const creatorRoleMatch = request.creatorRole === userRole;

    if (!creatorNameMatch && !creatorRoleMatch) {
      return {
        valid: false,
        reason: `Identity mismatch: user '${user}' with role '${userRole}' cannot cancel request created by '${request.creator}' (role: ${request.creatorRole})`
      };
    }

    if (!creatorNameMatch) {
      return {
        valid: false,
        reason: `Name mismatch: cannot impersonate creator. Provided user '${user}' does not match creator '${request.creator}'`
      };
    }

    if (!creatorRoleMatch) {
      return {
        valid: false,
        reason: `Role mismatch: user role '${userRole}' does not match creator's role '${request.creatorRole}'. Only the original creator can cancel this request`
      };
    }

    return { valid: true };
  }

  async createRequest(requestData) {
    const request = {
      id: generateId('REQ'),
      sampleId: requestData.sampleId,
      type: requestData.type,
      applicant: requestData.applicant,
      creator: requestData.creator || requestData.applicant,
      creatorRole: requestData.creatorRole || requestData.applicantRole || 'APPLICANT',
      status: REQUEST_STATUS.PENDING,
      approvalBasis: requestData.approvalBasis || null,
      approver: null,
      approverRole: null,
      approveDate: null,
      reason: requestData.reason,
      newDueDate: requestData.newDueDate || null,
      createdAt: now(),
      updatedAt: now(),
      version: 1,
      statusHistory: [{
        status: REQUEST_STATUS.PENDING,
        timestamp: now(),
        actor: requestData.creator || requestData.applicant,
        actorRole: requestData.creatorRole || requestData.applicantRole || 'APPLICANT'
      }]
    };

    await dataStore.insert('requests', request);

    const sample = await sampleService.findById(requestData.sampleId);
    await auditService.log(
      ACTION_TYPE.REQUEST_CREATED,
      requestData.applicant,
      requestData.applicantRole || 'APPLICANT',
      sample,
      { requestType: requestData.type, reason: requestData.reason },
      'SUCCESS',
      null,
      request.id
    );

    return request;
  }

  async findById(id) {
    return await dataStore.findById('requests', id);
  }

  async findAll(filters = {}) {
    const { sampleId, type, status, applicant, page = 1, limit = 20 } = filters;
    
    let requests = await dataStore.read('requests');
    
    if (sampleId) {
      requests = requests.filter(r => r.sampleId === sampleId);
    }
    
    if (type) {
      requests = requests.filter(r => r.type === type);
    }
    
    if (status) {
      requests = requests.filter(r => r.status === status);
    }
    
    if (applicant) {
      requests = requests.filter(r => r.applicant === applicant);
    }
    
    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const total = requests.length;
    const startIndex = (page - 1) * limit;
    const paginatedRequests = requests.slice(startIndex, startIndex + limit);
    
    return { requests: paginatedRequests, total };
  }

  async approve(requestId, approver, approverRole, approvalBasis) {
    const lockId = await this.acquireOperationLock(requestId, 'approve');

    try {
      const request = await this.findById(requestId);

      if (!request) {
        throw new Error('Request not found');
      }

      if (request.status !== REQUEST_STATUS.PENDING) {
        throw new Error(`Request is not pending, current status: ${request.status}`);
      }

      const sample = await sampleService.findById(request.sampleId);
      if (!sample) {
        throw new Error('Associated sample not found');
      }

      const currentVersion = request.version;

      let updatedSample;

      switch (request.type) {
        case REQUEST_TYPE.BORROW:
          updatedSample = await sampleService.borrow(
            request.sampleId,
            request.applicant,
            request.newDueDate || addDays(now(), 30),
            approver,
            approverRole
          );
          break;

        case REQUEST_TYPE.RETURN:
          updatedSample = await sampleService.return(
            request.sampleId,
            approver,
            approverRole
          );
          break;

        case REQUEST_TYPE.RENEW:
          if (sample.status === SAMPLE_STATUS.FROZEN) {
            await auditService.log(
              ACTION_TYPE.ERROR_OCCURRED,
              approver,
              approverRole,
              sample,
              { action: 'Approve renew for frozen sample' },
              'FAILURE',
              'Cannot renew frozen sample',
              request.id
            );
            throw new Error('Cannot renew frozen sample');
          }
          updatedSample = await sampleService.renew(
            request.sampleId,
            request.newDueDate,
            approver,
            approverRole
          );
          break;

        case REQUEST_TYPE.DESTRUCTION:
          const preDestructionSample = await sampleService.markForDestruction(
            request.sampleId,
            approver,
            approverRole
          );
          updatedSample = await sampleService.destroy(
            request.sampleId,
            approver,
            approverRole
          );
          break;

        default:
          throw new Error(`Unknown request type: ${request.type}`);
      }

      const updateResult = await dataStore.updateWithVersion('requests', requestId, {
        status: REQUEST_STATUS.APPROVED,
        approver,
        approverRole,
        approvalBasis,
        approveDate: now(),
        statusHistory: [
          ...(request.statusHistory || []),
          {
            status: REQUEST_STATUS.APPROVED,
            timestamp: now(),
            actor: approver,
            actorRole: approverRole
          }
        ]
      }, currentVersion);

      if (!updateResult.success) {
        if (updateResult.error === 'VERSION_CONFLICT') {
          throw new Error('Request was modified by another operation. Please retry.');
        }
        throw new Error('Failed to update request');
      }

      const updatedRequest = await this.findById(requestId);

      await auditService.log(
        ACTION_TYPE.REQUEST_APPROVED,
        approver,
        approverRole,
        updatedSample,
        { requestType: request.type },
        'SUCCESS',
        null,
        request.id,
        approvalBasis
      );

      return { request: updatedRequest, sample: updatedSample };
    } finally {
      await this.releaseOperationLock(requestId, 'approve', lockId);
    }
  }

  async reject(requestId, approver, approverRole, reason) {
    const lockId = await this.acquireOperationLock(requestId, 'reject');

    try {
      const request = await this.findById(requestId);

      if (!request) {
        throw new Error('Request not found');
      }

      if (request.status !== REQUEST_STATUS.PENDING) {
        throw new Error(`Request is not pending, current status: ${request.status}`);
      }

      const currentVersion = request.version;
      const sample = await sampleService.findById(request.sampleId);

      const updateResult = await dataStore.updateWithVersion('requests', requestId, {
        status: REQUEST_STATUS.REJECTED,
        approver,
        approverRole,
        approvalBasis: reason,
        approveDate: now(),
        statusHistory: [
          ...(request.statusHistory || []),
          {
            status: REQUEST_STATUS.REJECTED,
            timestamp: now(),
            actor: approver,
            actorRole: approverRole
          }
        ]
      }, currentVersion);

      if (!updateResult.success) {
        if (updateResult.error === 'VERSION_CONFLICT') {
          throw new Error('Request was modified by another operation. Please retry.');
        }
        throw new Error('Failed to update request');
      }

      const updatedRequest = await this.findById(requestId);

      await auditService.log(
        ACTION_TYPE.REQUEST_REJECTED,
        approver,
        approverRole,
        sample,
        { requestType: request.type, reason },
        'SUCCESS',
        null,
        request.id,
        reason
      );

      return updatedRequest;
    } finally {
      await this.releaseOperationLock(requestId, 'reject', lockId);
    }
  }

  async cancel(requestId, user, userRole = 'APPLICANT', reason = null) {
    const lockId = await this.acquireOperationLock(requestId, 'cancel');

    try {
      const request = await this.findById(requestId);

      if (!request) {
        throw new Error('Request not found');
      }

      const identityCheck = this.verifyCreatorIdentity(request, user, userRole);
      if (!identityCheck.valid) {
        await auditService.log(
          ACTION_TYPE.ERROR_OCCURRED,
          user,
          userRole,
          null,
          {
            action: 'CANCEL_REQUEST',
            requestId: request.id,
            requestCreator: request.creator,
            requestCreatorRole: request.creatorRole,
            reason: identityCheck.reason
          },
          'FAILURE',
          identityCheck.reason,
          requestId
        );
        throw new Error(identityCheck.reason);
      }

      if (request.status !== REQUEST_STATUS.PENDING) {
        throw new Error(`Request is not pending, current status: ${request.status}`);
      }

      const previousStatus = request.status;
      const currentVersion = request.version;

      const updateResult = await dataStore.updateWithVersion('requests', requestId, {
        status: REQUEST_STATUS.CANCELLED,
        cancelledAt: now(),
        cancelReason: reason || null,
        cancelledBy: user,
        cancelledByRole: userRole,
        statusHistory: [
          ...(request.statusHistory || []),
          {
            status: REQUEST_STATUS.CANCELLED,
            timestamp: now(),
            actor: user,
            actorRole: userRole,
            reason: reason
          }
        ]
      }, currentVersion);

      if (!updateResult.success) {
        if (updateResult.error === 'VERSION_CONFLICT') {
          throw new Error('Request was modified by another operation (possibly approved or rejected). Please retry.');
        }
        throw new Error('Failed to cancel request');
      }

      const updatedRequest = await this.findById(requestId);
      const sample = await sampleService.findById(request.sampleId);

      await auditService.log(
        ACTION_TYPE.REQUEST_CANCELLED,
        user,
        userRole,
        sample,
        {
          requestType: request.type,
          cancelReason: reason || null,
          previousStatus,
          applicant: request.applicant,
          creator: request.creator,
          creatorRole: request.creatorRole,
          verifiedIdentity: {
            user: user,
            userRole: userRole,
            creator: request.creator,
            creatorRole: request.creatorRole,
            nameVerified: true,
            roleVerified: true
          }
        },
        'SUCCESS',
        null,
        request.id
      );

      return updatedRequest;
    } finally {
      await this.releaseOperationLock(requestId, 'cancel', lockId);
    }
  }
}

module.exports = new RequestService();
