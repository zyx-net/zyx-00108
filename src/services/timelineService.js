const dataStore = require('../utils/dataStore');
const auditConfig = require('../utils/auditConfig');
const { generateId, now } = require('../utils/helpers');
const { REQUEST_STATUS } = require('../utils/constants');
const crypto = require('crypto');

const TIMELINE_EVENT_TYPE = {
  REQUEST_CREATED: 'REQUEST_CREATED',
  REQUEST_APPROVED: 'REQUEST_APPROVED',
  REQUEST_REJECTED: 'REQUEST_REJECTED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  CONCURRENCY_CONFLICT: 'CONCURRENCY_CONFLICT',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  DUPLICATE_OPERATION: 'DUPLICATE_OPERATION',
  APPROVAL_CANCEL_RACE: 'APPROVAL_CANCEL_RACE',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  TIMELINE_QUERIED: 'TIMELINE_QUERIED',
  EXPORT_GENERATED: 'EXPORT_GENERATED'
};

class TimelineService {
  computeChecksum(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  async recordEvent(eventData) {
    if (!auditConfig.isEnabled()) {
      return null;
    }

    const eventType = eventData.eventType;
    if (!auditConfig.shouldLogEvent(eventType)) {
      return null;
    }

    const event = {
      id: generateId('TLE'),
      timestamp: now(),
      eventType,
      requestId: eventData.requestId || null,
      sampleId: eventData.sampleId || null,
      user: eventData.user || null,
      userRole: eventData.userRole || null,
      previousStatus: eventData.previousStatus || null,
      newStatus: eventData.newStatus || null,
      requestSnapshot: eventData.requestSnapshot || null,
      sampleSnapshot: eventData.sampleSnapshot || null,
      details: eventData.details || {},
      result: eventData.result || 'SUCCESS',
      errorMessage: eventData.errorMessage || null,
      conflictInfo: eventData.conflictInfo || null,
      metadata: {
        recordedAt: now(),
        auditEnabled: auditConfig.isEnabled(),
        retentionMaxDays: auditConfig.get('retentionMaxDays'),
        retentionMaxRecords: auditConfig.get('retentionMaxRecords')
      }
    };

    await dataStore.insert('timeline-events', event);
    await this.enforceRetentionLimits();

    return event;
  }

  async recordRequestCreated(request, sample, user, userRole) {
    return await this.recordEvent({
      eventType: TIMELINE_EVENT_TYPE.REQUEST_CREATED,
      requestId: request.id,
      sampleId: sample?.id || null,
      user,
      userRole,
      previousStatus: null,
      newStatus: REQUEST_STATUS.PENDING,
      requestSnapshot: auditConfig.shouldCaptureRequestSnapshots() ? this.snapshotRequest(request) : null,
      sampleSnapshot: auditConfig.shouldCaptureSampleSnapshots() ? this.snapshotSample(sample) : null,
      details: {
        requestType: request.type,
        reason: request.reason,
        applicant: request.applicant,
        creator: request.creator
      },
      result: 'SUCCESS'
    });
  }

  async recordRequestApproved(request, sample, approver, approverRole) {
    return await this.recordEvent({
      eventType: TIMELINE_EVENT_TYPE.REQUEST_APPROVED,
      requestId: request.id,
      sampleId: sample?.id || null,
      user: approver,
      userRole: approverRole,
      previousStatus: REQUEST_STATUS.PENDING,
      newStatus: REQUEST_STATUS.APPROVED,
      requestSnapshot: auditConfig.shouldCaptureRequestSnapshots() ? this.snapshotRequest(request) : null,
      sampleSnapshot: auditConfig.shouldCaptureSampleSnapshots() ? this.snapshotSample(sample) : null,
      details: {
        requestType: request.type,
        approvalBasis: request.approvalBasis
      },
      result: 'SUCCESS'
    });
  }

  async recordRequestRejected(request, sample, rejector, rejectorRole, reason) {
    return await this.recordEvent({
      eventType: TIMELINE_EVENT_TYPE.REQUEST_REJECTED,
      requestId: request.id,
      sampleId: sample?.id || null,
      user: rejector,
      userRole: rejectorRole,
      previousStatus: REQUEST_STATUS.PENDING,
      newStatus: REQUEST_STATUS.REJECTED,
      requestSnapshot: auditConfig.shouldCaptureRequestSnapshots() ? this.snapshotRequest(request) : null,
      details: { requestType: request.type, rejectReason: reason },
      result: 'SUCCESS'
    });
  }

  async recordRequestCancelled(request, sample, user, userRole, reason) {
    return await this.recordEvent({
      eventType: TIMELINE_EVENT_TYPE.REQUEST_CANCELLED,
      requestId: request.id,
      sampleId: sample?.id || null,
      user,
      userRole,
      previousStatus: REQUEST_STATUS.PENDING,
      newStatus: REQUEST_STATUS.CANCELLED,
      requestSnapshot: auditConfig.shouldCaptureRequestSnapshots() ? this.snapshotRequest(request) : null,
      details: {
        requestType: request.type,
        cancelReason: reason,
        creator: request.creator,
        creatorRole: request.creatorRole
      },
      result: 'SUCCESS'
    });
  }

  async recordConcurrencyConflict(requestId, sampleId, operation, conflictingUser, conflictingRole, details) {
    if (!auditConfig.shouldRecordConcurrencyConflicts()) {
      return null;
    }

    return await this.recordEvent({
      eventType: TIMELINE_EVENT_TYPE.CONCURRENCY_CONFLICT,
      requestId,
      sampleId,
      user: conflictingUser,
      userRole: conflictingRole,
      details: {
        operation,
        ...details
      },
      result: 'FAILURE',
      errorMessage: 'Concurrent operation conflict detected'
    });
  }

  async recordUnauthorizedAccess(requestId, sampleId, user, userRole, attemptedAction, details) {
    if (!auditConfig.shouldRecordSecurityEvents()) {
      return null;
    }

    return await this.recordEvent({
      eventType: TIMELINE_EVENT_TYPE.UNAUTHORIZED_ACCESS,
      requestId,
      sampleId,
      user,
      userRole,
      details: {
        attemptedAction,
        ...details
      },
      result: 'FAILURE',
      errorMessage: 'Unauthorized access attempt'
    });
  }

  async recordIdentityMismatch(requestId, user, userRole, expectedUser, expectedRole, details) {
    if (!auditConfig.shouldRecordSecurityEvents()) {
      return null;
    }

    return await this.recordEvent({
      eventType: TIMELINE_EVENT_TYPE.IDENTITY_MISMATCH,
      requestId,
      user,
      userRole,
      details: {
        expectedUser,
        expectedRole,
        ...details
      },
      result: 'FAILURE',
      errorMessage: 'Identity mismatch: user or role does not match'
    });
  }

  async recordDuplicateOperation(requestId, sampleId, user, userRole, operation, existingStatus) {
    return await this.recordEvent({
      eventType: TIMELINE_EVENT_TYPE.DUPLICATE_OPERATION,
      requestId,
      sampleId,
      user,
      userRole,
      details: {
        attemptedOperation: operation,
        currentStatus: existingStatus
      },
      result: 'FAILURE',
      errorMessage: 'Duplicate operation on non-pending request'
    });
  }

  async recordApprovalCancelRace(requestId, sampleId, winner, loser, winnerRole, loserRole, operation, details) {
    return await this.recordEvent({
      eventType: TIMELINE_EVENT_TYPE.APPROVAL_CANCEL_RACE,
      requestId,
      sampleId,
      user: winner,
      userRole: winnerRole,
      details: {
        loser,
        loserRole,
        winnerOperation: operation,
        ...details
      },
      result: 'SUCCESS',
      conflictInfo: {
        raceCondition: true,
        winner,
        winnerRole,
        loser,
        loserRole
      }
    });
  }

  async recordVersionConflict(requestId, sampleId, user, userRole, operation, currentVersion) {
    return await this.recordEvent({
      eventType: TIMELINE_EVENT_TYPE.VERSION_CONFLICT,
      requestId,
      sampleId,
      user,
      userRole,
      details: {
        operation,
        expectedVersion: currentVersion - 1,
        currentVersion
      },
      result: 'FAILURE',
      errorMessage: 'Version conflict: request was modified by another operation'
    });
  }

  snapshotRequest(request) {
    if (!request) return null;
    return JSON.parse(JSON.stringify({
      id: request.id,
      sampleId: request.sampleId,
      type: request.type,
      status: request.status,
      applicant: request.applicant,
      creator: request.creator,
      creatorRole: request.creatorRole,
      reason: request.reason,
      approvalBasis: request.approvalBasis,
      approver: request.approver,
      approverRole: request.approverRole,
      approveDate: request.approveDate,
      version: request.version,
      statusHistory: request.statusHistory,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    }));
  }

  snapshotSample(sample) {
    if (!sample) return null;
    return JSON.parse(JSON.stringify({
      id: sample.id,
      name: sample.name,
      category: sample.category,
      status: sample.status,
      currentHolder: sample.currentHolder,
      storageLocation: sample.storageLocation,
      validityPeriod: sample.validityPeriod,
      version: sample.version
    }));
  }

  async query(filters = {}) {
    const { requestId, sampleId, user, userRole, eventType, startDate, endDate, result, page = 1, limit = 20 } = filters;

    let events = await dataStore.read('timeline-events');

    if (requestId) {
      events = events.filter(e => e.requestId === requestId);
    }

    if (sampleId) {
      events = events.filter(e => e.sampleId === sampleId);
    }

    if (user) {
      events = events.filter(e => e.user === user);
    }

    if (userRole) {
      events = events.filter(e => e.userRole === userRole);
    }

    if (eventType) {
      events = events.filter(e => e.eventType === eventType);
    }

    if (startDate) {
      events = events.filter(e => new Date(e.timestamp) >= new Date(startDate));
    }

    if (endDate) {
      events = events.filter(e => new Date(e.timestamp) <= new Date(endDate));
    }

    if (result) {
      events = events.filter(e => e.result === result);
    }

    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = events.length;
    const startIndex = (page - 1) * limit;
    const paginatedEvents = events.slice(startIndex, startIndex + limit);

    return {
      events: paginatedEvents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getTimelineByRequestId(requestId) {
    const { events, total } = await this.query({ requestId, page: 1, limit: 1000 });
    return { events, total };
  }

  async exportToJson(filters = {}) {
    const { events } = await this.query({ ...filters, page: 1, limit: 100000 });

    const exportData = {
      exportedAt: now(),
      totalRecords: events.length,
      filters,
      checksum: this.computeChecksum(events),
      config: {
        auditEnabled: auditConfig.isEnabled(),
        retentionMaxDays: auditConfig.get('retentionMaxDays'),
        retentionMaxRecords: auditConfig.get('retentionMaxRecords')
      },
      events
    };

    return JSON.stringify(exportData, null, 2);
  }

  async exportToCsv(filters = {}) {
    const { events } = await this.query({ ...filters, page: 1, limit: 100000 });

    if (events.length === 0) {
      return '';
    }

    const headers = [
      'ID', 'Timestamp', 'Event Type', 'Request ID', 'Sample ID',
      'User', 'User Role', 'Previous Status', 'New Status',
      'Result', 'Error Message', 'Details', 'Conflict Info'
    ];

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(typeof value === 'object' ? JSON.stringify(value) : value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = events.map(event => [
      escapeCsv(event.id),
      escapeCsv(event.timestamp),
      escapeCsv(event.eventType),
      escapeCsv(event.requestId),
      escapeCsv(event.sampleId),
      escapeCsv(event.user),
      escapeCsv(event.userRole),
      escapeCsv(event.previousStatus),
      escapeCsv(event.newStatus),
      escapeCsv(event.result),
      escapeCsv(event.errorMessage),
      escapeCsv(JSON.stringify(event.details)),
      escapeCsv(event.conflictInfo ? JSON.stringify(event.conflictInfo) : '')
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    const metadata = [
      `# Exported at: ${now()}`,
      `# Total records: ${events.length}`,
      `# Checksum: ${this.computeChecksum(events)}`,
      `# Audit enabled: ${auditConfig.isEnabled()}`,
      `# Filters: ${JSON.stringify(filters)}`
    ].join('\n');

    return metadata + '\n\n' + csvContent;
  }

  async enforceRetentionLimits() {
    const maxRecords = auditConfig.get('retentionMaxRecords');
    const maxDays = auditConfig.get('retentionMaxDays');

    let events = await dataStore.read('timeline-events');

    if (events.length <= maxRecords) {
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDays);

    events = events.filter(e => new Date(e.timestamp) >= cutoffDate);

    if (events.length > maxRecords) {
      events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      events = events.slice(0, maxRecords);
    }

    await dataStore.write('timeline-events', events);
  }

  async getStatistics() {
    const events = await dataStore.read('timeline-events');
    const now = new Date();

    const stats = {
      totalEvents: events.length,
      eventsByType: {},
      eventsByResult: { SUCCESS: 0, FAILURE: 0 },
      eventsByRole: {},
      recentEvents: events.filter(e => {
        const eventDate = new Date(e.timestamp);
        const diffDays = (now - eventDate) / (1000 * 60 * 60 * 24);
        return diffDays <= 7;
      }).length,
      concurrencyConflicts: events.filter(e => e.eventType === TIMELINE_EVENT_TYPE.CONCURRENCY_CONFLICT).length,
      securityEvents: events.filter(e => e.eventType === TIMELINE_EVENT_TYPE.UNAUTHORIZED_ACCESS || e.eventType === TIMELINE_EVENT_TYPE.IDENTITY_MISMATCH).length,
      raceConditions: events.filter(e => e.eventType === TIMELINE_EVENT_TYPE.APPROVAL_CANCEL_RACE).length,
      config: {
        auditEnabled: auditConfig.isEnabled(),
        retentionMaxDays: auditConfig.get('retentionMaxDays'),
        retentionMaxRecords: auditConfig.get('retentionMaxRecords')
      }
    };

    events.forEach(e => {
      stats.eventsByType[e.eventType] = (stats.eventsByType[e.eventType] || 0) + 1;
      stats.eventsByResult[e.result] = (stats.eventsByResult[e.result] || 0) + 1;
      if (e.userRole) {
        stats.eventsByRole[e.userRole] = (stats.eventsByRole[e.userRole] || 0) + 1;
      }
    });

    return stats;
  }

  async verifyConsistency(exportData, filters = {}) {
    const freshData = await this.query({ ...filters, page: 1, limit: 100000 });
    const freshChecksum = this.computeChecksum(freshData.events);
    const exportedChecksum = exportData.checksum || this.computeChecksum(exportData.events || exportData);

    return {
      consistent: freshChecksum === exportedChecksum,
      freshChecksum,
      exportedChecksum,
      exportedAt: exportData.exportedAt,
      verifiedAt: now()
    };
  }
}

module.exports = new TimelineService();
module.exports.TIMELINE_EVENT_TYPE = TIMELINE_EVENT_TYPE;
