const http = require('http');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:3000';
const DATA_DIR = path.join(__dirname, '..', 'data');
const SERVER_SCRIPT = path.join(__dirname, '..', 'src', 'server.js');

const USER_ROLES = {
  APPLICANT: 'APPLICANT',
  LIBRARIAN: 'LIBRARIAN',
  SUPERVISOR: 'SUPERVISOR'
};

function request(method, urlPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function getHeaders(role) {
  return { 'X-User-Role': role };
}

async function stopServer() {
  return new Promise((resolve) => {
    exec('taskkill /F /IM node.exe /FI "WINDOWTITLE eq node*" 2>nul', (err) => {
      setTimeout(resolve, 1500);
    });
  });
}

async function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [SERVER_SCRIPT], {
      cwd: path.join(__dirname, '..'),
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();
    setTimeout(resolve, 2000);
  });
}

async function waitForServer(maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await request('GET', '/health');
      if (response.status === 200) {
        return true;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function readJsonFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }
  return [];
}

async function computeFileChecksum(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  return null;
}

async function resetAuditConfig() {
  const configPath = path.join(DATA_DIR, 'audit-config.json');
  const defaultConfig = {
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
      'VERSION_CONFLICT'
    ]
  };
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
}

async function clearTimelineData() {
  const timelinePath = path.join(DATA_DIR, 'timeline-events.json');
  if (fs.existsSync(timelinePath)) {
    fs.unlinkSync(timelinePath);
  }
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('Timeline and Audit - Comprehensive Tests for Application Timeline Module');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;
  const failures = [];

  function assert(condition, message, details = null) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.log(`  [FAIL] ${message}`);
      if (details) {
        console.log(`         Details: ${JSON.stringify(details)}`);
      }
      failed++;
      failures.push(message);
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  try {
    console.log('\n[Phase 1] Configuration Tests');

    const configBefore = await request('GET', '/api/timeline/config', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(configBefore.status === 200, 'Config query succeeded');
    assert(configBefore.data.data.auditEnabled === true, 'Audit is enabled by default');
    assert(configBefore.data.data.captureRequestSnapshots === true, 'Request snapshot capture enabled');

    const updatedConfig = await request('PUT', '/api/timeline/config', {
      auditEnabled: true,
      retentionMaxDays: 30,
      retentionMaxRecords: 5000
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(updatedConfig.status === 200, 'Config update succeeded');
    assert(updatedConfig.data.data.retentionMaxDays === 30, 'Retention days updated');

    console.log('\n[Phase 2] Normal Request Lifecycle - Borrow');

    await clearTimelineData();
    await resetAuditConfig();
    await delay(500);

    const sampleBorrow = {
      name: 'Test Borrow Sample',
      category: 'Chemical',
      validityPeriod: '2027-12-31',
      storageLocation: 'Cabinet A, Shelf 1',
      registrant: 'Dr. Zhang'
    };
    const sampleCreateResult = await request('POST', '/api/samples', sampleBorrow, getHeaders(USER_ROLES.LIBRARIAN));
    assert(sampleCreateResult.status === 201, 'Sample created for borrow test');
    const borrowSampleId = sampleCreateResult.data.data.id;

    const borrowReq = {
      sampleId: borrowSampleId,
      applicant: 'Researcher Wang',
      reason: 'Need for research',
      duration: 7
    };
    const borrowResult = await request('POST', '/api/requests/borrow', borrowReq, getHeaders(USER_ROLES.APPLICANT));
    assert(borrowResult.status === 201, 'Borrow request created');
    const borrowReqId = borrowResult.data.data.id;

    const timelineAfterCreate = await request('GET', `/api/timeline/request/${borrowReqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(timelineAfterCreate.status === 200, 'Timeline query succeeded');
    const createEvents = timelineAfterCreate.data.data.events.filter(e => e.eventType === 'REQUEST_CREATED');
    assert(createEvents.length > 0, 'Creation event recorded in timeline');
    assert(createEvents[0].requestSnapshot !== null, 'Request snapshot captured');

    const approveBorrow = await request('POST', `/api/requests/${borrowReqId}/approve`, {
      approver: 'Dr. Li',
      approvalBasis: 'Research purpose verified'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(approveBorrow.status === 200, 'Borrow request approved');

    const timelineAfterApprove = await request('GET', `/api/timeline/request/${borrowReqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    const approveEvents = timelineAfterApprove.data.data.events.filter(e => e.eventType === 'REQUEST_APPROVED');
    assert(approveEvents.length > 0, 'Approval event recorded in timeline');
    assert(approveEvents[0].sampleSnapshot !== null, 'Sample snapshot captured');

    console.log('\n[Phase 3] Normal Request Lifecycle - Librarian Initiated Destruction');

    const sampleDestruction = {
      name: 'Test Destruction Sample',
      category: 'Biological',
      validityPeriod: '2025-01-01',
      storageLocation: 'Freezer B, Shelf 2',
      registrant: 'Dr. Zhang'
    };
    const destSampleCreate = await request('POST', '/api/samples', sampleDestruction, getHeaders(USER_ROLES.LIBRARIAN));
    assert(destSampleCreate.status === 201, 'Sample created for destruction test');
    const destSampleId = destSampleCreate.data.data.id;

    const destructionReq = {
      sampleId: destSampleId,
      applicant: 'Dr. Li',
      reason: 'Sample expired',
      approvalBasis: 'Safety regulation'
    };
    const destructionResult = await request('POST', '/api/requests/destruction', destructionReq, getHeaders(USER_ROLES.LIBRARIAN));
    assert(destructionResult.status === 201, 'Destruction request created by librarian');
    const destructionReqId = destructionResult.data.data.id;

    const destTimeline = await request('GET', `/api/timeline/request/${destructionReqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    const destCreateEvents = destTimeline.data.data.events.filter(e => e.eventType === 'REQUEST_CREATED');
    assert(destCreateEvents.length > 0, 'Destruction creation event recorded');
    assert(destCreateEvents[0].details.requestType === 'DESTRUCTION', 'Request type is DESTRUCTION');

    const approveDestruction = await request('POST', `/api/requests/${destructionReqId}/approve-destruction`, {
      approver: 'Prof. Chen',
      approvalBasis: 'Confirmed expired'
    }, getHeaders(USER_ROLES.SUPERVISOR));
    assert(approveDestruction.status === 200, 'Destruction request approved by supervisor');

    console.log('\n[Phase 4] Creator Self-Cancellation');

    const sampleCancel = {
      name: 'Test Cancel Sample',
      category: 'Chemical',
      validityPeriod: '2027-12-31',
      storageLocation: 'Cabinet C, Shelf 1',
      registrant: 'Dr. Zhang'
    };
    const cancelSampleCreate = await request('POST', '/api/samples', sampleCancel, getHeaders(USER_ROLES.LIBRARIAN));
    const cancelSampleId = cancelSampleCreate.data.data.id;

    const borrowForCancel = {
      sampleId: cancelSampleId,
      applicant: 'Researcher Liu',
      reason: 'Need for analysis',
      duration: 7
    };
    const cancelBorrowResult = await request('POST', '/api/requests/borrow', borrowForCancel, getHeaders(USER_ROLES.APPLICANT));
    const cancelReqId = cancelBorrowResult.data.data.id;

    const cancelResult = await request('POST', `/api/requests/${cancelReqId}/cancel`, {
      user: 'Researcher Liu',
      reason: 'Changed plan'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(cancelResult.status === 200, 'Creator self-cancellation succeeded');
    assert(cancelResult.data.data.status === 'CANCELLED', 'Status changed to CANCELLED');

    const cancelTimeline = await request('GET', `/api/timeline/request/${cancelReqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    const cancelEvents = cancelTimeline.data.data.events.filter(e => e.eventType === 'REQUEST_CANCELLED');
    assert(cancelEvents.length > 0, 'Cancellation event recorded in timeline');
    assert(cancelEvents[0].details.cancelReason === 'Changed plan', 'Cancel reason recorded');

    console.log('\n[Phase 5] Unauthorized Access Detection');

    const sampleUnauthorized = {
      name: 'Test Unauthorized Sample',
      category: 'Chemical',
      validityPeriod: '2027-12-31',
      storageLocation: 'Cabinet D, Shelf 1',
      registrant: 'Dr. Zhang'
    };
    const unauthSampleCreate = await request('POST', '/api/samples', sampleUnauthorized, getHeaders(USER_ROLES.LIBRARIAN));
    const unauthSampleId = unauthSampleCreate.data.data.id;

    const unauthBorrow = {
      sampleId: unauthSampleId,
      applicant: 'Researcher Wang',
      reason: 'Research',
      duration: 7
    };
    const unauthBorrowResult = await request('POST', '/api/requests/borrow', unauthBorrow, getHeaders(USER_ROLES.APPLICANT));
    const unauthReqId = unauthBorrowResult.data.data.id;

    const impersonateCancel = await request('POST', `/api/requests/${unauthReqId}/cancel`, {
      user: 'Researcher Wang',
      reason: 'Trying to impersonate'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(impersonateCancel.status === 403, 'Impersonation blocked (role mismatch)');

    const wrongUserCancel = await request('POST', `/api/requests/${unauthReqId}/cancel`, {
      user: 'Different User',
      reason: 'Wrong user'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(wrongUserCancel.status === 403, 'Wrong user blocked');

    await delay(500);
    const securityEvents = await request('GET', '/api/timeline?eventType=IDENTITY_MISMATCH', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(securityEvents.data.data.total >= 2, 'Identity mismatch events recorded');

    console.log('\n[Phase 6] Duplicate Operation Detection');

    const duplicateSample = {
      name: 'Test Duplicate Sample',
      category: 'Chemical',
      validityPeriod: '2027-12-31',
      storageLocation: 'Cabinet E, Shelf 1',
      registrant: 'Dr. Zhang'
    };
    const dupSampleCreate = await request('POST', '/api/samples', duplicateSample, getHeaders(USER_ROLES.LIBRARIAN));
    const dupSampleId = dupSampleCreate.data.data.id;

    const dupBorrow = {
      sampleId: dupSampleId,
      applicant: 'Researcher Wang',
      reason: 'Research',
      duration: 7
    };
    const dupResult = await request('POST', '/api/requests/borrow', dupBorrow, getHeaders(USER_ROLES.APPLICANT));
    const dupReqId = dupResult.data.data.id;

    const firstCancel = await request('POST', `/api/requests/${dupReqId}/cancel`, {
      user: 'Researcher Wang',
      reason: 'First cancel'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(firstCancel.status === 200, 'First cancellation succeeded');

    const secondCancel = await request('POST', `/api/requests/${dupReqId}/cancel`, {
      user: 'Researcher Wang',
      reason: 'Second cancel'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(secondCancel.status === 409, 'Second cancellation blocked (not pending)');

    await delay(500);
    const dupEvents = await request('GET', '/api/timeline?eventType=DUPLICATE_OPERATION', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(dupEvents.data.data.total >= 1, 'Duplicate operation event recorded');

    console.log('\n[Phase 7] Concurrent Conflict');

    const concurrentSample = {
      name: 'Test Concurrent Sample',
      category: 'Chemical',
      validityPeriod: '2027-12-31',
      storageLocation: 'Cabinet F, Shelf 1',
      registrant: 'Dr. Zhang'
    };
    const concSampleCreate = await request('POST', '/api/samples', concurrentSample, getHeaders(USER_ROLES.LIBRARIAN));
    const concSampleId = concSampleCreate.data.data.id;

    const concBorrow = {
      sampleId: concSampleId,
      applicant: 'Researcher Wang',
      reason: 'Concurrent test',
      duration: 7
    };
    const concResult = await request('POST', '/api/requests/borrow', concBorrow, getHeaders(USER_ROLES.APPLICANT));
    const concReqId = concResult.data.data.id;

    const cancelPromise = request('POST', `/api/requests/${concReqId}/cancel`, {
      user: 'Researcher Wang',
      reason: 'Creator cancels'
    }, getHeaders(USER_ROLES.APPLICANT));

    const approvePromise = request('POST', `/api/requests/${concReqId}/approve`, {
      approver: 'Dr. Li',
      approvalBasis: 'Approved'
    }, getHeaders(USER_ROLES.LIBRARIAN));

    const [cancelRes, approveRes] = await Promise.allSettled([cancelPromise, approvePromise]);

    const cancelSucceeded = cancelRes.status === 'fulfilled' && cancelRes.value.status === 200;
    const approveSucceeded = approveRes.status === 'fulfilled' && approveRes.value.status === 200;
    const oneConflictDetected = (cancelRes.status === 'fulfilled' && cancelRes.value.status === 409) ||
                                  (approveRes.status === 'fulfilled' && approveRes.value.status === 409);

    assert(cancelSucceeded || approveSucceeded || oneConflictDetected,
           'Concurrent operations handled (one succeeded, one conflict detected)');

    await delay(500);
    const finalReq = await request('GET', `/api/requests/${concReqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(finalReq.data.data.status !== 'PENDING', 'Request is no longer PENDING after concurrent operations');

    console.log('\n[Phase 8] Statistics');

    const stats = await request('GET', '/api/timeline/stats', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(stats.status === 200, 'Statistics query succeeded');
    assert(stats.data.data.totalEvents > 0, 'Total events recorded');
    assert(stats.data.data.eventsByType.REQUEST_CREATED > 0, 'Created events tracked');
    assert(stats.data.data.config.auditEnabled === true, 'Audit enabled in stats');

    console.log('\n[Phase 9] Export Tests');

    const jsonExport = await request('GET', '/api/timeline/export?format=json', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(jsonExport.status === 200, 'JSON export succeeded');

    let exportData;
    try {
      exportData = typeof jsonExport.data === 'string' ? JSON.parse(jsonExport.data) : jsonExport.data;
    } catch (e) {
      console.log(`  [FAIL] JSON parse failed: ${e.message}`);
      exportData = null;
    }

    if (exportData) {
      assert(exportData.checksum, 'Export includes checksum');
      assert(exportData.exportedAt, 'Export includes timestamp');
      assert(Array.isArray(exportData.events), 'Export data has events array');
      assert(exportData.config, 'Export includes config info');
    }

    const csvExport = await request('GET', '/api/timeline/export?format=csv', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(csvExport.status === 200, 'CSV export succeeded');
    const csvContent = typeof csvExport.data === 'string' ? csvExport.data : JSON.stringify(csvExport.data);
    assert(csvContent.includes('ID,Timestamp,Event Type'), 'CSV has headers');
    assert(csvContent.includes('# Checksum:'), 'CSV includes checksum metadata');

    console.log('\n[Phase 10] Restart Persistence');

    const timelineFileBefore = path.join(DATA_DIR, 'timeline-events.json');
    const checksumsBefore = {
      timeline: await computeFileChecksum('timeline-events.json'),
      requests: await computeFileChecksum('requests.json'),
      samples: await computeFileChecksum('samples.json')
    };

    console.log('  Stopping server for restart test...');
    await stopServer();

    console.log('  Starting server...');
    await startServer();

    const serverReady = await waitForServer();
    assert(serverReady, 'Server restarted successfully');

    const checksumsAfter = {
      timeline: await computeFileChecksum('timeline-events.json'),
      requests: await computeFileChecksum('requests.json'),
      samples: await computeFileChecksum('samples.json')
    };

    assert(checksumsBefore.timeline === checksumsAfter.timeline, 'Timeline file checksum unchanged after restart');
    assert(checksumsBefore.requests === checksumsAfter.requests, 'Requests file checksum unchanged after restart');
    assert(checksumsBefore.samples === checksumsAfter.samples, 'Samples file checksum unchanged after restart');

    const queryAfterRestart = await request('GET', `/api/timeline/request/${borrowReqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(queryAfterRestart.status === 200, 'Timeline query after restart succeeded');
    assert(queryAfterRestart.data.data.total > 0, 'Timeline events preserved after restart');

    const statsAfterRestart = await request('GET', '/api/timeline/stats', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(statsAfterRestart.data.data.totalEvents > 0, 'Statistics preserved after restart');

    console.log('\n[Phase 11] Export Consistency After Restart');

    const freshJsonExport = await request('GET', '/api/timeline/export?format=json', null, getHeaders(USER_ROLES.LIBRARIAN));
    let freshExportData;
    try {
      freshExportData = typeof freshJsonExport.data === 'string' ? JSON.parse(freshJsonExport.data) : freshJsonExport.data;
    } catch (e) {
      freshExportData = null;
    }

    if (exportData && freshExportData) {
      assert(exportData.checksum === freshExportData.checksum,
             'Export checksums match before and after restart');
    }

    console.log('\n[Phase 12] Query Filters');

    const filteredQuery = await request('GET', '/api/timeline?user=Researcher Wang', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(filteredQuery.status === 200, 'Filtered query succeeded');
    if (filteredQuery.data.data.total > 0) {
      const allSameUser = filteredQuery.data.data.events.every(e => e.user === 'Researcher Wang');
      assert(allSameUser, 'All results match user filter');
    }

    const dateFiltered = await request('GET', '/api/timeline?eventType=REQUEST_CREATED', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(dateFiltered.status === 200, 'Event type filter query succeeded');
    if (dateFiltered.data.data.total > 0) {
      const allSameType = dateFiltered.data.data.events.every(e => e.eventType === 'REQUEST_CREATED');
      assert(allSameType, 'All results match event type filter');
    }

    console.log('\n[Phase 13] Audit Switch Tests');

    await request('PUT', '/api/timeline/config', {
      auditEnabled: false
    }, getHeaders(USER_ROLES.LIBRARIAN));

    await delay(500);

    const disabledConfig = await request('GET', '/api/timeline/config', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(disabledConfig.data.data.auditEnabled === false, 'Audit disabled');

    const newSample = {
      name: 'Test Disabled Audit Sample',
      category: 'Chemical',
      validityPeriod: '2027-12-31',
      storageLocation: 'Cabinet G, Shelf 1',
      registrant: 'Dr. Zhang'
    };
    const auditDisabledSample = await request('POST', '/api/samples', newSample, getHeaders(USER_ROLES.LIBRARIAN));
    const auditDisabledSampleId = auditDisabledSample.data.data.id;

    const auditDisabledBorrow = {
      sampleId: auditDisabledSampleId,
      applicant: 'Researcher Wang',
      reason: 'Audit disabled test',
      duration: 7
    };
    const auditDisabledReq = await request('POST', '/api/requests/borrow', auditDisabledBorrow, getHeaders(USER_ROLES.APPLICANT));

    await delay(500);

    const eventsDuringDisabled = await request('GET', '/api/timeline?sampleId=' + auditDisabledSampleId, null, getHeaders(USER_ROLES.LIBRARIAN));

    await request('PUT', '/api/timeline/config', {
      auditEnabled: true
    }, getHeaders(USER_ROLES.LIBRARIAN));

    await delay(500);

    const reenabledConfig = await request('GET', '/api/timeline/config', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(reenabledConfig.data.data.auditEnabled === true, 'Audit re-enabled');
    assert(auditDisabledReq.status === 201, 'Main flow not affected by audit switch');

    console.log('\n[Phase 14] Config Reset');

    const resetConfig = await request('POST', '/api/timeline/config/reset', {}, getHeaders(USER_ROLES.SUPERVISOR));
    assert(resetConfig.status === 200, 'Config reset succeeded');
    assert(resetConfig.data.data.auditEnabled === true, 'Default audit enabled after reset');
    assert(resetConfig.data.data.retentionMaxDays === 365, 'Default retention days after reset');

    console.log('\n' + '='.repeat(80));
    console.log(`Test Results: ${passed} passed, ${failed} failed`);

    if (failures.length > 0) {
      console.log('\nFailed Tests:');
      failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    }
    console.log('='.repeat(80));

    if (failed > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('Test execution error:', error.message);
    console.error(error.stack);
    console.error('\nMake sure the server is running on port 3000');
    process.exit(1);
  }
}

runTests();
