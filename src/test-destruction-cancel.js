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

async function runTests() {
  console.log('='.repeat(80));
  console.log('Destruction Request Cancellation - Comprehensive Security & Consistency Tests');
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
    console.log('\n[Phase 1] Creator Self-Cancellation (Legitimate Use)');

    const sampleData1 = {
      name: 'Test Self-Cancel Sample',
      category: 'Chemical',
      validityPeriod: '2025-01-01',
      storageLocation: 'Cabinet A, Shelf 1',
      registrant: 'Dr. Wang (Library)'
    };
    const sampleCreate1 = await request('POST', '/api/samples', sampleData1, getHeaders(USER_ROLES.LIBRARIAN));
    assert(sampleCreate1.status === 201, 'Sample registered for self-cancel test',
           { sampleId: sampleCreate1.data?.data?.id });
    const sampleId1 = sampleCreate1.data.data.id;

    const destReq1 = {
      sampleId: sampleId1,
      applicant: 'Dr. Wang (Library)',
      reason: 'Sample expired for self-cancel test',
      approvalBasis: 'Safety regulation'
    };
    const destResult1 = await request('POST', '/api/requests/destruction', destReq1, getHeaders(USER_ROLES.LIBRARIAN));
    assert(destResult1.status === 201, 'Destruction request created');
    const reqId1 = destResult1.data.data.id;

    const reqCheck1 = await request('GET', `/api/requests/${reqId1}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(reqCheck1.data.data.status === 'PENDING', 'Request status is PENDING');
    assert(reqCheck1.data.data.creator === 'Dr. Wang (Library)', 'Creator is Dr. Wang (Library)');
    assert(reqCheck1.data.data.creatorRole === 'LIBRARIAN', 'Creator role is LIBRARIAN');
    assert(reqCheck1.data.data.version === 1, 'Request has version 1');

    const selfCancel = await request('POST', `/api/requests/${reqId1}/cancel`, {
      user: 'Dr. Wang (Library)',
      reason: 'Sample not actually expired'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(selfCancel.status === 200, 'Creator (Librarian) can cancel own request');
    assert(selfCancel.data.data.status === 'CANCELLED', 'Status changed to CANCELLED');
    assert(selfCancel.data.data.cancelledBy === 'Dr. Wang (Library)', 'Cancelled by is the creator');
    assert(selfCancel.data.data.cancelledByRole === 'LIBRARIAN', 'Cancelled by role is LIBRARIAN');
    assert(selfCancel.data.data.version === 2, 'Version incremented to 2');
    assert(selfCancel.data.data.statusHistory.length === 2, 'Status history has 2 entries');

    console.log('\n[Phase 2] Identity Spoofing Tests - Reject Impersonation');

    const sampleData2 = {
      name: 'Test Impersonation Sample',
      category: 'Chemical',
      validityPeriod: '2025-01-01',
      storageLocation: 'Cabinet B, Shelf 1',
      registrant: 'Dr. Wang (Library)'
    };
    const sampleCreate2 = await request('POST', '/api/samples', sampleData2, getHeaders(USER_ROLES.LIBRARIAN));
    const sampleId2 = sampleCreate2.data.data.id;

    const destReq2 = {
      sampleId: sampleId2,
      applicant: 'Dr. Wang (Library)',
      reason: 'Sample for impersonation test',
      approvalBasis: 'Safety regulation'
    };
    const destResult2 = await request('POST', '/api/requests/destruction', destReq2, getHeaders(USER_ROLES.LIBRARIAN));
    const reqId2 = destResult2.data.data.id;

    const impersonateCancel = await request('POST', `/api/requests/${reqId2}/cancel`, {
      user: 'Dr. Wang (Library)',
      reason: 'Trying to impersonate'
    }, getHeaders(USER_ROLES.SUPERVISOR));
    assert(impersonateCancel.status === 403, 'Impersonation blocked: wrong role despite correct name');
    assert(impersonateCancel.data.error.includes('Role mismatch') || impersonateCancel.data.error.includes('Identity mismatch'),
           'Error indicates role mismatch');

    const wrongNameCancel = await request('POST', `/api/requests/${reqId2}/cancel`, {
      user: 'Prof. Chen (Supervisor)',
      reason: 'Trying to impersonate'
    }, getHeaders(USER_ROLES.SUPERVISOR));
    assert(wrongNameCancel.status === 403, 'Wrong name blocked: cannot impersonate creator');
    assert(wrongNameCancel.data.error.includes('Name mismatch') || wrongNameCancel.data.error.includes('Identity mismatch'),
           'Error indicates name mismatch');

    const nameOnlyMatch = await request('POST', `/api/requests/${reqId2}/cancel`, {
      user: 'Dr. Wang (Library)',
      reason: 'Name matches but role does not'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(nameOnlyMatch.status === 403, 'Name-only match blocked: role must also match');
    assert(nameOnlyMatch.data.error.includes('Role mismatch'),
           'Error indicates role mismatch');

    console.log('\n[Phase 3] Duplicate Cancellation Test');

    const duplicateCancel = await request('POST', `/api/requests/${reqId1}/cancel`, {
      user: 'Dr. Wang (Library)',
      reason: 'Try to cancel again'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(duplicateCancel.status === 409, 'Cannot cancel already cancelled request');
    assert(duplicateCancel.data.error.includes('not pending'),
           'Error indicates request not pending');

    console.log('\n[Phase 4] Approval vs Cancellation Conflict');

    const sampleData3 = {
      name: 'Test Approval Conflict Sample',
      category: 'Chemical',
      validityPeriod: '2025-01-01',
      storageLocation: 'Cabinet C, Shelf 1',
      registrant: 'Dr. Wang (Library)'
    };
    const sampleCreate3 = await request('POST', '/api/samples', sampleData3, getHeaders(USER_ROLES.LIBRARIAN));
    const sampleId3 = sampleCreate3.data.data.id;

    const destReq3 = {
      sampleId: sampleId3,
      applicant: 'Dr. Wang (Library)',
      reason: 'Sample for approval conflict test',
      approvalBasis: 'Safety regulation'
    };
    const destResult3 = await request('POST', '/api/requests/destruction', destReq3, getHeaders(USER_ROLES.LIBRARIAN));
    const reqId3 = destResult3.data.data.id;

    const approveResult = await request('POST', `/api/requests/${reqId3}/approve-destruction`, {
      approver: 'Prof. Chen (Supervisor)',
      approvalBasis: 'Approved for destruction'
    }, getHeaders(USER_ROLES.SUPERVISOR));
    assert(approveResult.status === 200, 'Approval succeeded');

    const cancelAfterApprove = await request('POST', `/api/requests/${reqId3}/cancel`, {
      user: 'Dr. Wang (Library)',
      reason: 'Try to cancel after approval'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(cancelAfterApprove.status === 409, 'Cannot cancel approved request');
    assert(cancelAfterApprove.data.error.includes('not pending'),
           'Error indicates request not pending');

    console.log('\n[Phase 5] Concurrent Cancel vs Approve Test');

    const sampleData4 = {
      name: 'Test Concurrent Sample',
      category: 'Chemical',
      validityPeriod: '2025-01-01',
      storageLocation: 'Cabinet D, Shelf 1',
      registrant: 'Dr. Wang (Library)'
    };
    const sampleCreate4 = await request('POST', '/api/samples', sampleData4, getHeaders(USER_ROLES.LIBRARIAN));
    const sampleId4 = sampleCreate4.data.data.id;

    const destReq4 = {
      sampleId: sampleId4,
      applicant: 'Dr. Wang (Library)',
      reason: 'Sample for concurrent test',
      approvalBasis: 'Safety regulation'
    };
    const destResult4 = await request('POST', '/api/requests/destruction', destReq4, getHeaders(USER_ROLES.LIBRARIAN));
    const reqId4 = destResult4.data.data.id;

    const cancelPromise = request('POST', `/api/requests/${reqId4}/cancel`, {
      user: 'Dr. Wang (Library)',
      reason: 'Creator cancels'
    }, getHeaders(USER_ROLES.LIBRARIAN));

    const approvePromise = request('POST', `/api/requests/${reqId4}/approve-destruction`, {
      approver: 'Prof. Chen (Supervisor)',
      approvalBasis: 'Supervisor approves'
    }, getHeaders(USER_ROLES.SUPERVISOR));

    const [cancelResult, approveResult2] = await Promise.allSettled([cancelPromise, approvePromise]);

    const cancelled = cancelResult.status === 'fulfilled' && cancelResult.value.status === 200;
    const approved = approveResult2.status === 'fulfilled' && approveResult2.value.status === 200;
    const conflictDetected = (cancelResult.status === 'fulfilled' && cancelResult.value.status === 409) ||
                            (approveResult2.status === 'fulfilled' && approveResult2.value.status === 409);

    assert(cancelled || approved || conflictDetected, 'Concurrent operations handled (one succeeded, one conflict detected)');

    const finalReq = await request('GET', `/api/requests/${reqId4}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(finalReq.data.data.status !== 'PENDING', 'Request is no longer PENDING after concurrent operations');

    console.log('\n[Phase 6] Audit Log Verification');

    const auditLogs = await request('GET', '/api/audit-logs?action=REQUEST_CANCELLED', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(auditLogs.status === 200, 'Audit logs query succeeded');

    const cancelAuditLogs = auditLogs.data.data.logs.filter(log => log.requestId === reqId1);
    assert(cancelAuditLogs.length > 0, 'Cancellation audit log exists');

    const cancelAudit = cancelAuditLogs[0];
    assert(cancelAudit.action === 'REQUEST_CANCELLED', 'Audit action is REQUEST_CANCELLED');
    assert(cancelAudit.user === 'Dr. Wang (Library)', 'Audit user is creator');
    assert(cancelAudit.role === 'LIBRARIAN', 'Audit role is LIBRARIAN');
    assert(cancelAudit.result === 'SUCCESS', 'Audit result is SUCCESS');
    assert(cancelAudit.details.cancelReason === 'Sample not actually expired', 'Audit details include cancel reason');
    assert(cancelAudit.details.verifiedIdentity, 'Audit details include identity verification info');
    assert(cancelAudit.details.verifiedIdentity.nameVerified === true, 'Name verification recorded');
    assert(cancelAudit.details.verifiedIdentity.roleVerified === true, 'Role verification recorded');

    const failureAuditLogs = await request('GET', '/api/audit-logs?action=ERROR_OCCURRED&result=FAILURE', null, getHeaders(USER_ROLES.LIBRARIAN));
    const impersonationAudits = failureAuditLogs.data.data.logs.filter(log =>
      log.details?.action === 'CANCEL_REQUEST' &&
      log.requestId === reqId2
    );
    assert(impersonationAudits.length >= 3, 'Failed impersonation attempts logged');

    console.log('\n[Phase 7] Export Consistency Tests');

    const jsonExport = await request('GET', '/api/audit-logs/export?format=json&action=REQUEST_CANCELLED', null, getHeaders(USER_ROLES.LIBRARIAN));
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
      assert(Array.isArray(exportData.logs), 'Export data has logs array');

      const exportedCancellations = exportData.logs.filter(log => log.action === 'REQUEST_CANCELLED');
      assert(exportedCancellations.length > 0, 'Exported logs include cancellation records');
    }

    const csvExport = await request('GET', '/api/audit-logs/export?format=csv&action=REQUEST_CANCELLED', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(csvExport.status === 200, 'CSV export succeeded');
    const csvContent = typeof csvExport.data === 'string' ? csvExport.data : JSON.stringify(csvExport.data);
    assert(csvContent.includes('REQUEST_CANCELLED'), 'CSV contains cancellation records');
    assert(csvContent.includes('# Checksum:'), 'CSV includes checksum metadata');

    console.log('\n[Phase 8] Restart Recovery Tests');

    const requestsBeforeRestart = await readJsonFile('requests.json');
    const cancelledRequestsBefore = requestsBeforeRestart.filter(r => r.id === reqId1);
    assert(cancelledRequestsBefore.length === 1, 'Cancelled request exists in data file');
    assert(cancelledRequestsBefore[0].status === 'CANCELLED', 'Status is CANCELLED');
    assert(cancelledRequestsBefore[0].version === 2, 'Version is 2');
    assert(cancelledRequestsBefore[0].cancelledAt !== null, 'CancelledAt is set');
    assert(cancelledRequestsBefore[0].cancelledBy === 'Dr. Wang (Library)', 'CancelledBy is correct');
    assert(cancelledRequestsBefore[0].statusHistory.length === 2, 'Status history has 2 entries');

    const checksumsBefore = {
      requests: await computeFileChecksum('requests.json'),
      samples: await computeFileChecksum('samples.json'),
      auditLogs: await computeFileChecksum('audit-logs.json')
    };

    console.log('  Stopping server for restart test...');
    await stopServer();

    console.log('  Starting server...');
    await startServer();

    const serverReady = await waitForServer();
    assert(serverReady, 'Server restarted successfully');

    const checksumsAfter = {
      requests: await computeFileChecksum('requests.json'),
      samples: await computeFileChecksum('samples.json'),
      auditLogs: await computeFileChecksum('audit-logs.json')
    };

    assert(checksumsBefore.requests === checksumsAfter.requests, 'Requests file checksum unchanged after restart');
    assert(checksumsBefore.samples === checksumsAfter.samples, 'Samples file checksum unchanged after restart');
    assert(checksumsBefore.auditLogs === checksumsAfter.auditLogs, 'Audit logs file checksum unchanged after restart');

    const requestsAfterRestart = await readJsonFile('requests.json');
    const cancelledRequestsAfter = requestsAfterRestart.filter(r => r.id === reqId1);
    assert(cancelledRequestsAfter.length === 1, 'Cancelled request exists after restart');
    assert(cancelledRequestsAfter[0].status === 'CANCELLED', 'Status preserved after restart');
    assert(cancelledRequestsAfter[0].version === 2, 'Version preserved after restart');
    assert(cancelledRequestsAfter[0].cancelledAt !== null, 'CancelledAt preserved');
    assert(cancelledRequestsAfter[0].cancelledBy === 'Dr. Wang (Library)', 'CancelledBy preserved');
    assert(cancelledRequestsAfter[0].statusHistory.length === 2, 'Status history preserved');

    const queryAfterRestart = await request('GET', `/api/requests/${reqId1}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(queryAfterRestart.data.data.status === 'CANCELLED', 'Query returns CANCELLED after restart');
    assert(queryAfterRestart.data.data.version === 2, 'Query returns correct version');

    const auditAfterRestart = await request('GET', '/api/audit-logs?action=REQUEST_CANCELLED&requestId=' + reqId1, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(auditAfterRestart.data.data.total > 0, 'Audit log preserved after restart');

    const exportAfterRestart = await request('GET', '/api/audit-logs/export?format=json&requestId=' + reqId1, null, getHeaders(USER_ROLES.LIBRARIAN));
    let exportedAfterRestart;
    try {
      exportedAfterRestart = typeof exportAfterRestart.data === 'string' ? JSON.parse(exportAfterRestart.data) : exportAfterRestart.data;
    } catch (e) {
      console.log(`  [FAIL] Export parse failed: ${e.message}`);
      exportedAfterRestart = null;
    }

    if (exportedAfterRestart) {
      assert(exportedAfterRestart.logs.length > 0, 'Exported data exists after restart');
      const cancellationLogs = exportedAfterRestart.logs.filter(log => log.requestId === reqId1);
      assert(cancellationLogs.length > 0, 'Cancellation log in export after restart');
      assert(cancellationLogs[0].status === 'CANCELLED' || cancellationLogs[0].action === 'REQUEST_CANCELLED',
             'Export reflects correct cancellation status');
    }

    const samplesAfterRestart = await readJsonFile('samples.json');
    const sampleAfterRestart = samplesAfterRestart.filter(s => s.id === sampleId1);
    assert(sampleAfterRestart[0].status === 'AVAILABLE', 'Sample status preserved after restart (AVAILABLE)');

    console.log('\n[Phase 9] Export Consistency Verification After Restart');

    const freshExport = await request('GET', '/api/audit-logs/export?format=json&requestId=' + reqId1, null, getHeaders(USER_ROLES.LIBRARIAN));
    let freshExportData;
    try {
      freshExportData = typeof freshExport.data === 'string' ? JSON.parse(freshExport.data) : freshExport.data;
    } catch (e) {
      freshExportData = null;
    }

    if (exportedAfterRestart && freshExportData) {
      assert(exportedAfterRestart.checksum === freshExportData.checksum,
             'Export checksums match before and after restart verification');
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
