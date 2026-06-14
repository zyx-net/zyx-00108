const dataStore = require('../utils/dataStore');
const { generateId, now } = require('../utils/helpers');
const { ACTION_TYPE } = require('../utils/constants');
const crypto = require('crypto');

class AuditService {
  computeChecksum(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  async log(action, user, role, sample, details = {}, result = 'SUCCESS', errorMessage = null, requestId = null, approvalBasis = null) {
    const auditLog = {
      id: generateId('AUDIT'),
      timestamp: now(),
      action,
      user,
      role,
      sampleId: sample?.id || null,
      sampleName: sample?.name || null,
      validityPeriod: sample?.validityPeriod || null,
      storageLocation: sample?.storageLocation || null,
      requestId,
      approvalBasis,
      details,
      result,
      errorMessage
    };

    await dataStore.insert('audit-logs', auditLog);
    return auditLog;
  }

  async query(filters = {}) {
    const { sampleId, user, action, startDate, endDate, requestId, result, page = 1, limit = 20 } = filters;

    let logs = await dataStore.read('audit-logs');

    if (sampleId) {
      logs = logs.filter(log => log.sampleId === sampleId);
    }

    if (user) {
      logs = logs.filter(log => log.user === user);
    }

    if (action) {
      logs = logs.filter(log => log.action === action);
    }

    if (startDate) {
      logs = logs.filter(log => new Date(log.timestamp) >= new Date(startDate));
    }

    if (endDate) {
      logs = logs.filter(log => new Date(log.timestamp) <= new Date(endDate));
    }

    if (requestId) {
      logs = logs.filter(log => log.requestId === requestId);
    }

    if (result) {
      logs = logs.filter(log => log.result === result);
    }

    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = logs.length;
    const startIndex = (page - 1) * limit;
    const paginatedLogs = logs.slice(startIndex, startIndex + limit);

    return { logs: paginatedLogs, total };
  }

  async exportToJson(filters = {}) {
    const { logs } = await this.query({ ...filters, page: 1, limit: 10000 });

    const exportData = {
      exportedAt: now(),
      totalRecords: logs.length,
      filters: filters,
      checksum: this.computeChecksum(logs),
      logs: logs
    };

    return JSON.stringify(exportData, null, 2);
  }

  async exportToCsv(filters = {}) {
    const { logs } = await this.query({ ...filters, page: 1, limit: 10000 });

    if (logs.length === 0) {
      return '';
    }

    const headers = [
      'ID', 'Timestamp', 'Action', 'User', 'Role',
      'Sample ID', 'Sample Name', 'Validity Period', 'Storage Location',
      'Request ID', 'Result', 'Error Message', 'Details'
    ];

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = logs.map(log => [
      escapeCsv(log.id),
      escapeCsv(log.timestamp),
      escapeCsv(log.action),
      escapeCsv(log.user),
      escapeCsv(log.role),
      escapeCsv(log.sampleId),
      escapeCsv(log.sampleName),
      escapeCsv(log.validityPeriod),
      escapeCsv(log.storageLocation),
      escapeCsv(log.requestId),
      escapeCsv(log.result),
      escapeCsv(log.errorMessage),
      escapeCsv(JSON.stringify(log.details))
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    const metadata = [
      `# Exported at: ${now()}`,
      `# Total records: ${logs.length}`,
      `# Checksum: ${this.computeChecksum(logs)}`,
      `# Filters: ${JSON.stringify(filters)}`
    ].join('\n');

    return metadata + '\n\n' + csvContent;
  }

  async verifyExportConsistency(exportData, filters = {}) {
    const freshData = await this.query({ ...filters, page: 1, limit: 10000 });
    const freshChecksum = this.computeChecksum(freshData.logs);
    const exportedChecksum = exportData.checksum || this.computeChecksum(exportData.logs || exportData);

    return {
      consistent: freshChecksum === exportedChecksum,
      freshChecksum,
      exportedChecksum,
      exportedAt: exportData.exportedAt,
      verifiedAt: now()
    };
  }
}

module.exports = new AuditService();
