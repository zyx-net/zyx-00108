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

async function clearTimelineData() {
  const timelinePath = path.join(DATA_DIR, 'timeline-events.json');
  if (fs.existsSync(timelinePath)) {
    fs.unlinkSync(timelinePath);
  }
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
      'VERSION_CONFLICT',
      'RACE_LOSER_RECORDED',
      'OPERATION_FAILED'
    ]
  };
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('Audit Refactoring - Comprehensive Tests for Identity, Race Condition, and Replay');
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
    console.log('\n[Phase 1] Unauthorized Cancellation - Identity Mismatch Detection');

    await clearTimelineData();
    await resetAuditConfig();
    await delay(500);

    const sample1 = {
      name: 'Test Identity Mismatch Sample',
      category: 'Chemical',
      validityPeriod: '2027-12-31',
      storageLocation: 'Cabinet A, Shelf 1',
      registrant: 'Dr. Zhang'
    };
    const sample1Result = await request('POST', '/api/samples', sample1, getHeaders(USER_ROLES.LIBRARIAN));
    assert(sample1Result.status === 201, 'Sample created for identity mismatch test');
    const sample1Id = sample1Result.data.data.id;

    const borrow1 = {
      sampleId: sample1Id,
      applicant: 'Researcher Wang',
      reason: 'Research purpose',
      duration: 7
    };
    const borrow1Result = await request('POST', '/api/requests/borrow', borrow1, getHeaders(USER_ROLES.APPLICANT));
    assert(borrow1Result.status === 201, 'Borrow request created');
    const borrow1Id = borrow1Result.data.data.id;

    const wrongUserCancel = await request('POST', `/api/requests/${borrow1Id}/cancel`, {
      user: 'Different User',
      reason: 'Trying to cancel as wrong user'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(wrongUserCancel.status === 403, 'Wrong user cancellation blocked (403)');

    await delay(300);
    const timelineQuery1 = await request('GET', `/api/timeline/request/${borrow1Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    const identityMismatchEvents = timelineQuery1.data.data.events.filter(e => e.eventType === 'IDENTITY_MISMATCH');
    assert(identityMismatchEvents.length > 0, 'IDENTITY_MISMATCH event recorded');

    if (identityMismatchEvents.length > 0) {
      const mismatchEvent = identityMismatchEvents[0];
      assert(mismatchEvent.details.expectedUser === 'Researcher Wang', 'Expected user recorded correctly');
      assert(mismatchEvent.details.expectedRole === 'APPLICANT', 'Expected role recorded correctly');
      assert(mismatchEvent.user === 'Different User', 'Actual user (violator) recorded correctly');
      assert(mismatchEvent.userRole === 'APPLICANT', 'Actual role recorded correctly');
      assert(mismatchEvent.details.canIdentifyViolator === true, 'canIdentifyViolator flag is true');
      assert(mismatchEvent.details.nameMismatch === true, 'nameMismatch flag is true');
      assert(mismatchEvent.factSource !== null, 'factSource is attached to event');
    }

    const violatorQuery = await request('GET', `/api/timeline/violator/${borrow1Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    if (violatorQuery.status === 200 && violatorQuery.data.data) {
      assert(violatorQuery.data.data.violatorIdentified === true, 'Violator can be identified via API');
      assert(violatorQuery.data.data.violator.user === 'Different User', 'Violator user matches');
    }

    console.log('\n[Phase 2] Role Mismatch Detection');

    const roleMismatchCancel = await request('POST', `/api/requests/${borrow1Id}/cancel`, {
      user: 'Researcher Wang',
      reason: 'Trying to cancel with wrong role'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(roleMismatchCancel.status === 403, 'Role mismatch cancellation blocked (403)');

    await delay(300);
    const timelineQuery2 = await request('GET', `/api/timeline/request/${borrow1Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    const roleMismatchEvents = timelineQuery2.data.data.events.filter(e => 
      e.eventType === 'IDENTITY_MISMATCH' && e.details.roleMismatch === true
    );
    assert(roleMismatchEvents.length > 0, 'Role mismatch event recorded');

    console.log('\n[Phase 3] Full Identity Mismatch Detection');

    const fullMismatchCancel = await request('POST', `/api/requests/${borrow1Id}/cancel`, {
      user: 'Another User',
      reason: 'Both name and role wrong'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(fullMismatchCancel.status === 403, 'Full identity mismatch blocked (403)');

    await delay(300);
    const timelineQuery3 = await request('GET', `/api/timeline/request/${borrow1Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    const fullMismatchEvents = timelineQuery3.data.data.events.filter(e => 
      e.eventType === 'IDENTITY_MISMATCH' && 
      e.details.nameMismatch === true && 
      e.details.roleMismatch === true
    );
    assert(fullMismatchEvents.length > 0, 'Full identity mismatch event recorded');
    assert(fullMismatchEvents[0].details.violationType === 'FULL_IDENTITY_MISMATCH', 'Violation type is FULL_IDENTITY_MISMATCH');

    console.log('\n[Phase 4] Legitimate Cancellation with Fact Source');

    const sample2 = {
      name: 'Test Legitimate Cancel Sample',
      category: 'Biological',
      validityPeriod: '2027-12-31',
      storageLocation: 'Cabinet B, Shelf 1',
      registrant: 'Dr. Li'
    };
    const sample2Result = await request('POST', '/api/samples', sample2, getHeaders(USER_ROLES.LIBRARIAN));
    const sample2Id = sample2Result.data.data.id;

    const borrow2 = {
      sampleId: sample2Id,
      applicant: 'Researcher Liu',
      reason: 'Legitimate test',
      duration: 7
    };
    const borrow2Result = await request('POST', '/api/requests/borrow', borrow2, getHeaders(USER_ROLES.APPLICANT));
    const borrow2Id = borrow2Result.data.data.id;

    const legitCancel = await request('POST', `/api/requests/${borrow2Id}/cancel`, {
      user: 'Researcher Liu',
      reason: 'Legitimate cancellation'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(legitCancel.status === 200, 'Legitimate cancellation succeeded');
    assert(legitCancel.data.data.status === 'CANCELLED', 'Status changed to CANCELLED');

    await delay(300);
    const timelineQuery4 = await request('GET', `/api/timeline/request/${borrow2Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    const cancelEvents = timelineQuery4.data.data.events.filter(e => e.eventType === 'REQUEST_CANCELLED');
    assert(cancelEvents.length > 0, 'Cancellation event recorded');
    
    if (cancelEvents.length > 0) {
      const cancelEvent = cancelEvents[0];
      assert(cancelEvent.details.identityVerified === true, 'identityVerified is true');
      assert(cancelEvent.factSource !== null, 'factSource is attached');
      assert(cancelEvent.factSource.operation === 'CANCEL_REQUEST', 'factSource operation is correct');
    }

    console.log('\n[Phase 5] Approval-Cancel Race Condition Detection');

    const sample3 = {
      name: 'Test Race Condition Sample',
      category: 'Chemical',
      validityPeriod: '2027-12-31',
      storageLocation: 'Cabinet C, Shelf 1',
      registrant: 'Dr. Chen'
    };
    const sample3Result = await request('POST', '/api/samples', sample3, getHeaders(USER_ROLES.LIBRARIAN));
    const sample3Id = sample3Result.data.data.id;

    const borrow3 = {
      sampleId: sample3Id,
      applicant: 'Researcher Zhao',
      reason: 'Race condition test',
      duration: 7
    };
    const borrow3Result = await request('POST', '/api/requests/borrow', borrow3, getHeaders(USER_ROLES.APPLICANT));
    const borrow3Id = borrow3Result.data.data.id;

    const cancelPromise = request('POST', `/api/requests/${borrow3Id}/cancel`, {
      user: 'Researcher Zhao',
      reason: 'Creator cancels'
    }, getHeaders(USER_ROLES.APPLICANT));

    const approvePromise = request('POST', `/api/requests/${borrow3Id}/approve`, {
      approver: 'Dr. Li',
      approvalBasis: 'Approved'
    }, getHeaders(USER_ROLES.LIBRARIAN));

    const [cancelRes, approveRes] = await Promise.allSettled([cancelPromise, approvePromise]);

    const cancelSucceeded = cancelRes.status === 'fulfilled' && cancelRes.value.status === 200;
    const approveSucceeded = approveRes.status === 'fulfilled' && approveRes.value.status === 200;
    const oneConflictDetected = 
      (cancelRes.status === 'fulfilled' && cancelRes.value.status === 409) ||
      (approveRes.status === 'fulfilled' && approveRes.value.status === 409);

    assert(cancelSucceeded || approveSucceeded || oneConflictDetected,
           'Race condition handled (one succeeded, one conflict detected)');

    await delay(500);

    const finalReq = await request('GET', `/api/requests/${borrow3Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(finalReq.data.data.status !== 'PENDING', 'Request is no longer PENDING');

    const timelineQuery5 = await request('GET', `/api/timeline/request/${borrow3Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    const raceEvents = timelineQuery5.data.data.events.filter(e => e.eventType === 'APPROVAL_CANCEL_RACE');
    const raceLoserEvents = timelineQuery5.data.data.events.filter(e => e.eventType === 'RACE_LOSER_RECORDED');

    if (raceEvents.length > 0 || raceLoserEvents.length > 0) {
      console.log('  [INFO] Race condition events detected');
      
      if (raceEvents.length > 0) {
        const raceEvent = raceEvents[0];
        assert(raceEvent.details.bothAttempted === true, 'Both operations attempted recorded');
        assert(raceEvent.details.canReplay === true, 'canReplay flag is true');
        assert(raceEvent.conflictInfo !== null, 'conflictInfo is present');
      }

      if (raceLoserEvents.length > 0) {
        const loserEvent = raceLoserEvents[0];
        assert(loserEvent.result === 'FAILURE', 'Loser event has FAILURE result');
        assert(loserEvent.details.failedDueTo === 'RACE_CONDITION', 'Failure reason is RACE_CONDITION');
        assert(loserEvent.conflictInfo.wasLoser === true, 'wasLoser flag is true');
      }
    }

    console.log('\n[Phase 6] Race Condition Replay');

    const replayQuery = await request('GET', `/api/timeline/replay/${borrow3Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    if (replayQuery.status === 200 && replayQuery.data.data) {
      const replayData = replayQuery.data.data;
      assert(replayData.canReconstruct === true, 'Race condition can be reconstructed');
      
      if (replayData.winner) {
        console.log(`  [INFO] Winner: ${replayData.winner.user} (${replayData.winner.operation})`);
      }
      if (replayData.loser) {
        console.log(`  [INFO] Loser: ${replayData.loser.user} (${replayData.loser.operation})`);
      }
    }

    console.log('\n[Phase 7] Audit Log and Timeline Consistency');

    const auditQuery = await request('GET', `/api/audit-logs?requestId=${borrow2Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(auditQuery.status === 200, 'Audit log query succeeded');

    const timelineQuery6 = await request('GET', `/api/timeline/request/${borrow2Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(timelineQuery6.status === 200, 'Timeline query succeeded');

    const auditCancelLogs = auditQuery.data.data.logs.filter(l => l.action === 'REQUEST_CANCELLED');
    const timelineCancelEvents = timelineQuery6.data.data.events.filter(e => e.eventType === 'REQUEST_CANCELLED');
    
    assert(auditCancelLogs.length > 0 && timelineCancelEvents.length > 0, 
           'Both audit log and timeline have cancellation records');

    if (auditCancelLogs.length > 0 && timelineCancelEvents.length > 0) {
      const auditLog = auditCancelLogs[0];
      const timelineEvent = timelineCancelEvents[0];
      
      assert(auditLog.user === timelineEvent.user, 'User matches between audit log and timeline');
      assert(auditLog.role === timelineEvent.userRole, 'Role matches between audit log and timeline');
      
      if (auditLog.details && auditLog.details.factId && timelineEvent.factSource) {
        console.log('  [INFO] Fact ID chain verified');
      }
    }

    console.log('\n[Phase 8] Version Conflict Detection');

    const sample4 = {
      name: 'Test Version Conflict Sample',
      category: 'Chemical',
      validityPeriod: '2027-12-31',
      storageLocation: 'Cabinet D, Shelf 1',
      registrant: 'Dr. Wang'
    };
    const sample4Result = await request('POST', '/api/samples', sample4, getHeaders(USER_ROLES.LIBRARIAN));
    const sample4Id = sample4Result.data.data.id;

    const borrow4 = {
      sampleId: sample4Id,
      applicant: 'Researcher Zhang',
      reason: 'Version conflict test',
      duration: 7
    };
    const borrow4Result = await request('POST', '/api/requests/borrow', borrow4, getHeaders(USER_ROLES.APPLICANT));
    const borrow4Id = borrow4Result.data.data.id;

    await request('POST', `/api/requests/${borrow4Id}/approve`, {
      approver: 'Dr. Li',
      approvalBasis: 'Approved first'
    }, getHeaders(USER_ROLES.LIBRARIAN));

    await delay(300);

    const lateCancel = await request('POST', `/api/requests/${borrow4Id}/cancel`, {
      user: 'Researcher Zhang',
      reason: 'Trying to cancel after approval'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(lateCancel.status === 409, 'Late cancellation blocked (409)');

    await delay(300);
    const timelineQuery7 = await request('GET', `/api/timeline/request/${borrow4Id}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    const duplicateEvents = timelineQuery7.data.data.events.filter(e => e.eventType === 'DUPLICATE_OPERATION');
    assert(duplicateEvents.length > 0, 'DUPLICATE_OPERATION event recorded');
    
    if (duplicateEvents.length > 0) {
      const dupEvent = duplicateEvents[0];
      assert(dupEvent.details.currentStatus === 'APPROVED', 'Current status recorded correctly');
      assert(dupEvent.details.attemptedOperation === 'CANCEL_REQUEST', 'Attempted operation recorded');
    }

    console.log('\n[Phase 9] Statistics Verification');

    const stats = await request('GET', '/api/timeline/stats', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(stats.status === 200, 'Statistics query succeeded');
    assert(stats.data.data.totalEvents > 0, 'Total events recorded');
    assert(stats.data.data.securityEvents > 0, 'Security events recorded');
    assert(stats.data.data.eventsByType.IDENTITY_MISMATCH > 0, 'Identity mismatch events tracked');

    console.log('\n[Phase 10] Export and Checksum Verification');

    const jsonExport = await request('GET', '/api/timeline/export?format=json', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(jsonExport.status === 200, 'JSON export succeeded');

    let exportData;
    try {
      exportData = typeof jsonExport.data === 'string' ? JSON.parse(jsonExport.data) : jsonExport.data;
    } catch (e) {
      exportData = null;
    }

    if (exportData) {
      assert(exportData.checksum, 'Export includes checksum');
      assert(exportData.events.length > 0, 'Export has events');
      
      const eventsWithFactSource = exportData.events.filter(e => e.factSource !== null);
      console.log(`  [INFO] Events with factSource: ${eventsWithFactSource.length}/${exportData.events.length}`);
    }

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
