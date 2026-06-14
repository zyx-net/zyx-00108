const dataStore = require('../utils/dataStore');
const auditService = require('./auditService');
const sampleService = require('./sampleService');
const { generateId, now, addDays } = require('../utils/helpers');
const { SAMPLE_STATUS, REQUEST_TYPE, REQUEST_STATUS, ACTION_TYPE } = require('../utils/constants');

class RequestService {
  async createRequest(requestData) {
    const request = {
      id: generateId('REQ'),
      sampleId: requestData.sampleId,
      type: requestData.type,
      applicant: requestData.applicant,
      status: REQUEST_STATUS.PENDING,
      approvalBasis: requestData.approvalBasis || null,
      approver: null,
      approverRole: null,
      approveDate: null,
      reason: requestData.reason,
      newDueDate: requestData.newDueDate || null,
      createdAt: now(),
      updatedAt: now()
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

    await dataStore.update('requests', requestId, {
      status: REQUEST_STATUS.APPROVED,
      approver,
      approverRole,
      approvalBasis,
      approveDate: now()
    });

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
  }

  async reject(requestId, approver, approverRole, reason) {
    const request = await this.findById(requestId);
    
    if (!request) {
      throw new Error('Request not found');
    }

    if (request.status !== REQUEST_STATUS.PENDING) {
      throw new Error(`Request is not pending, current status: ${request.status}`);
    }

    const sample = await sampleService.findById(request.sampleId);

    await dataStore.update('requests', requestId, {
      status: REQUEST_STATUS.REJECTED,
      approver,
      approverRole,
      approvalBasis: reason,
      approveDate: now()
    });

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
  }

  async cancel(requestId, user, reason = null) {
    const request = await this.findById(requestId);
    
    if (!request) {
      throw new Error('Request not found');
    }

    if (request.applicant !== user) {
      throw new Error('Only the applicant can cancel the request');
    }

    if (request.status !== REQUEST_STATUS.PENDING) {
      throw new Error(`Request is not pending, current status: ${request.status}`);
    }

    await dataStore.update('requests', requestId, {
      status: REQUEST_STATUS.CANCELLED,
      cancelledAt: now(),
      cancelReason: reason || null
    });

    const updatedRequest = await this.findById(requestId);

    await auditService.log(
      ACTION_TYPE.REQUEST_CANCELLED,
      user,
      'APPLICANT',
      null,
      { requestType: request.type, reason: reason || null, previousStatus: 'PENDING' },
      'SUCCESS',
      null,
      request.id
    );

    return updatedRequest;
  }
}

module.exports = new RequestService();
