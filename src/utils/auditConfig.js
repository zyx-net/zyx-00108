const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '../../data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'audit-config.json');

const DEFAULT_CONFIG = {
  auditEnabled: true,
  retentionMaxDays: 365,
  retentionMaxRecords: 100000,
  logLevel: 'INFO',
  captureRequestSnapshots: true,
  captureSampleSnapshots: true,
  recordSecurityEvents: true,
  recordConcurrencyConflicts: true,
  recordDataConsistencyIssues: true,
  enabledEventTypes: [
    'REQUEST_CREATED',
    'REQUEST_APPROVED',
    'REQUEST_REJECTED',
    'REQUEST_CANCELLED',
    'CONCURRENCY_CONFLICT',
    'UNAUTHORIZED_ACCESS',
    'IDENTITY_MISMATCH',
    'DUPLICATE_OPERATION',
    'APPROVAL_CANCEL_RACE',
    'DATA_INCONSISTENCY'
  ]
};

class AuditConfig {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const loaded = JSON.parse(content);
        this.config = { ...DEFAULT_CONFIG, ...loaded };
      } else {
        this.save();
      }
    } catch (error) {
      console.error('Failed to load audit config, using defaults:', error.message);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  save() {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save audit config:', error.message);
    }
  }

  get(key) {
    return this.config[key];
  }

  set(key, value) {
    this.config[key] = value;
    this.save();
    return this.config;
  }

  getAll() {
    return { ...this.config };
  }

  update(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.save();
    return this.config;
  }

  isEnabled() {
    return this.config.auditEnabled === true;
  }

  shouldLogEvent(actionType) {
    if (!this.isEnabled()) {
      return false;
    }
    if (!this.config.enabledEventTypes || this.config.enabledEventTypes.length === 0) {
      return true;
    }
    return this.config.enabledEventTypes.includes(actionType);
  }

  shouldCaptureRequestSnapshots() {
    return this.isEnabled() && this.config.captureRequestSnapshots === true;
  }

  shouldCaptureSampleSnapshots() {
    return this.isEnabled() && this.config.captureSampleSnapshots === true;
  }

  shouldRecordSecurityEvents() {
    return this.isEnabled() && this.config.recordSecurityEvents === true;
  }

  shouldRecordConcurrencyConflicts() {
    return this.isEnabled() && this.config.recordConcurrencyConflicts === true;
  }

  reset() {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
    return this.config;
  }
}

module.exports = new AuditConfig();
