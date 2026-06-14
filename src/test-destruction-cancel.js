const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const DATA_DIR = path.join(__dirname, '..', 'data');

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
      setTimeout(resolve, 1000);
    });
  });
}

async function startServer() {
  return new Promise((resolve, reject) => {
    const proc = exec('node src/server.js', { cwd: path.join(__dirname, '..') });
    setTimeout(resolve, 2000);
  });
}

async function readJsonFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }
  return [];
}

async function runTests() {
  console.log('='.repeat(70));
  console.log('Destruction Request Cancellation - Comprehensive Tests');
  console.log('='.repeat(70));

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

  try {
    console.log('\n[Part 1] Successful Cancellation Tests');

    const sampleData = {
      name: 'Test Destruction Cancel Sample',
      category: 'Chemical',
      validityPeriod: '2020-01-01',
      storageLocation: 'Cabinet X, Shelf 1',
      registrant: 'Dr. Zhang (Library)'
    };
    const sampleCreate = await request('POST', '/api/samples', sampleData, getHeaders(USER_ROLES.LIBRARIAN));
    assert(sampleCreate.status === 201, 'Sample registered', sampleCreate.data);
    const sampleId = sampleCreate.data.data.id;

    const destructionReq = {
      sampleId: sampleId,
      applicant: 'Dr. Zhang (Library)',
      reason: 'Expired sample for cancel test',
      approvalBasis: 'Safety regulation'
    };
    const destructionResult = await request('POST', '/api/requests/destruction', destructionReq, getHeaders(USER_ROLES.LIBRARIAN));
    assert(destructionResult.status === 201, 'Destruction request created', destructionResult.data);
    const reqId = destructionResult.data.data.id;

    const reqCheck = await request('GET', `/api/requests/${reqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(reqCheck.data.data.status === 'PENDING', 'Request status is PENDING',
           { expected: 'PENDING', actual: reqCheck.data.data?.status });
    assert(reqCheck.data.data.creator === 'Dr. Zhang (Library)', 'Creator is librarian',
           { expected: 'Dr. Zhang (Library)', actual: reqCheck.data.data?.creator });
    assert(reqCheck.data.data.creatorRole === 'LIBRARIAN', 'Creator role is LIBRARIAN',
           { expected: 'LIBRARIAN', actual: reqCheck.data.data?.creatorRole });

    const cancelResult = await request('POST', `/api/requests/${reqId}/cancel`, {
      user: 'Dr. Zhang (Library)',
      reason: 'Sample not actually expired'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(cancelResult.status === 200, 'Creator (Librarian) can cancel own request',
           { status: cancelResult.status, success: cancelResult.data?.success });
    assert(cancelResult.data.data.status === 'CANCELLED', 'Status changed to CANCELLED',
           { expected: 'CANCELLED', actual: cancelResult.data.data?.status });
    assert(cancelResult.data.data.cancelledAt !== null, 'Cancelled timestamp recorded',
           { cancelledAt: cancelResult.data.data?.cancelledAt });
    assert(cancelResult.data.data.cancelReason === 'Sample not actually expired', 'Cancel reason recorded',
           { expected: 'Sample not actually expired', actual: cancelResult.data.data?.cancelReason });

    const sampleAfterCancel = await request('GET', `/api/samples/${sampleId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(sampleAfterCancel.data.data.status === 'AVAILABLE', 'Sample status unchanged (still AVAILABLE)',
           { expected: 'AVAILABLE', actual: sampleAfterCancel.data.data?.status });
    assert(sampleAfterCancel.data.data.currentHolder === null, 'Sample holder unchanged (null)',
           { expected: null, actual: sampleAfterCancel.data.data?.currentHolder });

    console.log('\n[Part 2] Authorization Tests');

    const sampleData2 = {
      name: 'Test Non-Creator Cancel Sample',
      category: 'Chemical',
      validityPeriod: '2020-01-01',
      storageLocation: 'Cabinet Y, Shelf 1',
      registrant: 'Dr. Zhang (Library)'
    };
    const sampleCreate2 = await request('POST', '/api/samples', sampleData2, getHeaders(USER_ROLES.LIBRARIAN));
    const sampleId2 = sampleCreate2.data.data.id;

    const destReq2 = {
      sampleId: sampleId2,
      applicant: 'Dr. Zhang (Library)',
      reason: 'Another expired sample',
      approvalBasis: 'Safety regulation'
    };
    const destResult2 = await request('POST', '/api/requests/destruction', destReq2, getHeaders(USER_ROLES.LIBRARIAN));
    const reqId2 = destResult2.data.data.id;

    const supervisorCancel = await request('POST', `/api/requests/${reqId2}/cancel`, {
      user: 'Prof. Chen (Supervisor)',
      reason: 'Supervisor trying to cancel'
    }, getHeaders(USER_ROLES.SUPERVISOR));
    assert(supervisorCancel.status === 403, 'Supervisor cannot cancel (non-creator)',
           { expected: 403, actual: supervisorCancel.status });
    assert(supervisorCancel.data.error.includes('Only the creator'), 'Error message is descriptive',
           { error: supervisorCancel.data?.error });

    const applicantCancel = await request('POST', `/api/requests/${reqId2}/cancel`, {
      user: 'Researcher Wang',
      reason: 'Applicant trying to cancel'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(applicantCancel.status === 403, 'Applicant cannot cancel (non-creator)',
           { expected: 403, actual: applicantCancel.status });

    console.log('\n[Part 3] Conflict Tests (Already Processed)');

    const duplicateCancel = await request('POST', `/api/requests/${reqId}/cancel`, {
      user: 'Dr. Zhang (Library)',
      reason: 'Try to cancel again'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(duplicateCancel.status === 409, 'Cannot cancel already cancelled request',
           { expected: 409, actual: duplicateCancel.status });

    const approvedSampleData = {
      name: 'Test Approved Sample',
      category: 'Chemical',
      validityPeriod: '2020-01-01',
      storageLocation: 'Cabinet Z, Shelf 1',
      registrant: 'Dr. Zhang (Library)'
    };
    const approvedSampleCreate = await request('POST', '/api/samples', approvedSampleData, getHeaders(USER_ROLES.LIBRARIAN));
    const approvedSampleId = approvedSampleCreate.data.data.id;

    const approvedDestReq = {
      sampleId: approvedSampleId,
      applicant: 'Dr. Zhang (Library)',
      reason: 'Expired sample for approval test',
      approvalBasis: 'Safety regulation'
    };
    const approvedDestResult = await request('POST', '/api/requests/destruction', approvedDestReq, getHeaders(USER_ROLES.LIBRARIAN));
    const approvedReqId = approvedDestResult.data.data.id;

    await request('POST', `/api/requests/${approvedReqId}/approve-destruction`, {
      approver: 'Prof. Chen (Supervisor)',
      approvalBasis: 'Approved for destruction'
    }, getHeaders(USER_ROLES.SUPERVISOR));

    const cancelApproved = await request('POST', `/api/requests/${approvedReqId}/cancel`, {
      user: 'Dr. Zhang (Library)',
      reason: 'Try to cancel approved'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(cancelApproved.status === 409, 'Cannot cancel approved request',
           { expected: 409, actual: cancelApproved.status });

    console.log('\n[Part 4] Audit Log Verification');

    const auditLogs = await request('GET', '/api/audit-logs?action=REQUEST_CANCELLED', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(auditLogs.status === 200, 'Audit logs query succeeded', auditLogs.data);

    const cancelAuditLogs = auditLogs.data.data.logs.filter(log => log.requestId === reqId);
    assert(cancelAuditLogs.length > 0, 'Cancellation audit log exists for cancelled request',
           { count: cancelAuditLogs.length });

    const cancelAudit = cancelAuditLogs[0];
    assert(cancelAudit.action === 'REQUEST_CANCELLED', 'Audit action is REQUEST_CANCELLED',
           { expected: 'REQUEST_CANCELLED', actual: cancelAudit.action });
    assert(cancelAudit.user === 'Dr. Zhang (Library)', 'Audit user is creator',
           { expected: 'Dr. Zhang (Library)', actual: cancelAudit.user });
    assert(cancelAudit.role === 'LIBRARIAN', 'Audit role matches actual role',
           { expected: 'LIBRARIAN', actual: cancelAudit.role });
    assert(cancelAudit.result === 'SUCCESS', 'Audit result is SUCCESS',
           { expected: 'SUCCESS', actual: cancelAudit.result });
    assert(cancelAudit.details.cancelReason === 'Sample not actually expired', 'Audit details include cancel reason',
           { expected: 'Sample not actually expired', actual: cancelAudit.details?.cancelReason });
    assert(cancelAudit.details.previousStatus === 'PENDING', 'Audit details include previous status',
           { expected: 'PENDING', actual: cancelAudit.details?.previousStatus });
    assert(cancelAudit.details.creator === 'Dr. Zhang (Library)', 'Audit details include creator',
           { expected: 'Dr. Zhang (Library)', actual: cancelAudit.details?.creator });

    console.log('\n[Part 5] Export Verification');

    const jsonExport = await request('GET', '/api/audit-logs/export?format=json&action=REQUEST_CANCELLED', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(jsonExport.status === 200, 'JSON export succeeded');

    let exportedLogs;
    try {
      exportedLogs = typeof jsonExport.data === 'string' ? JSON.parse(jsonExport.data) : jsonExport.data;
    } catch (e) {
      console.log(`  [FAIL] JSON parse failed: ${e.message}`);
      exportedLogs = [];
    }
    const exportedCancellations = Array.isArray(exportedLogs) ? exportedLogs.filter(log => log.action === 'REQUEST_CANCELLED') : [];
    assert(exportedCancellations.length > 0, 'Exported logs include cancellation records',
           { count: exportedCancellations.length });

    const csvExport = await request('GET', '/api/audit-logs/export?format=csv&action=REQUEST_CANCELLED', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(csvExport.status === 200, 'CSV export succeeded');
    const csvContent = typeof csvExport.data === 'string' ? csvExport.data : JSON.stringify(csvExport.data);
    assert(csvContent.includes('REQUEST_CANCELLED'), 'CSV contains cancellation records',
           { includes: csvContent.includes('REQUEST_CANCELLED') });

    console.log('\n[Part 6] Restart Recovery Test');
    const requestsBeforeRestart = await readJsonFile('requests.json');
    const cancelledRequestsBefore = requestsBeforeRestart.filter(r => r.id === reqId);
    assert(cancelledRequestsBefore.length === 1, 'Cancelled request exists in data file before restart',
           { count: cancelledRequestsBefore.length });
    assert(cancelledRequestsBefore[0].status === 'CANCELLED', 'Cancelled request has CANCELLED status in data file',
           { expected: 'CANCELLED', actual: cancelledRequestsBefore[0]?.status });

    console.log('  Stopping server for restart test...');
    await stopServer();

    console.log('  Starting server...');
    await startServer();

    const requestsAfterRestart = await readJsonFile('requests.json');
    const cancelledRequestsAfter = requestsAfterRestart.filter(r => r.id === reqId);
    assert(cancelledRequestsAfter.length === 1, 'Cancelled request exists after restart',
           { count: cancelledRequestsAfter.length });
    assert(cancelledRequestsAfter[0].status === 'CANCELLED', 'Status preserved after restart (CANCELLED)',
           { expected: 'CANCELLED', actual: cancelledRequestsAfter[0]?.status });
    assert(cancelledRequestsAfter[0].cancelledAt !== null, 'CancelledAt preserved after restart',
           { cancelledAt: cancelledRequestsAfter[0]?.cancelledAt });
    assert(cancelledRequestsAfter[0].cancelReason === 'Sample not actually expired', 'CancelReason preserved after restart',
           { expected: 'Sample not actually expired', actual: cancelledRequestsAfter[0]?.cancelReason });

    const queryAfterRestart = await request('GET', `/api/requests/${reqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(queryAfterRestart.data.data.status === 'CANCELLED', 'Query returns CANCELLED status after restart',
           { expected: 'CANCELLED', actual: queryAfterRestart.data.data?.status });

    const auditAfterRestart = await request('GET', '/api/audit-logs?action=REQUEST_CANCELLED&requestId=' + reqId, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(auditAfterRestart.data.data.total > 0, 'Audit log preserved after restart',
           { total: auditAfterRestart.data.data?.total });

    const exportAfterRestart = await request('GET', '/api/audit-logs/export?format=json&requestId=' + reqId, null, getHeaders(USER_ROLES.LIBRARIAN));
    let exportedAfterRestart;
    try {
      exportedAfterRestart = typeof exportAfterRestart.data === 'string' ? JSON.parse(exportAfterRestart.data) : exportAfterRestart.data;
    } catch (e) {
      console.log(`  [FAIL] Export parse failed: ${e.message}`);
      exportedAfterRestart = [];
    }
    assert(exportedAfterRestart.length > 0, 'Exported data consistent after restart',
           { count: exportedAfterRestart.length });

    const samplesAfterRestart = await readJsonFile('samples.json');
    const sampleAfterRestart = samplesAfterRestart.filter(s => s.id === sampleId);
    assert(sampleAfterRestart[0].status === 'AVAILABLE', 'Sample status preserved after restart (AVAILABLE)',
           { expected: 'AVAILABLE', actual: sampleAfterRestart[0]?.status });

    console.log('\n' + '='.repeat(70));
    console.log(`Test Results: ${passed} passed, ${failed} failed`);
    
    if (failures.length > 0) {
      console.log('\nFailed Tests:');
      failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    }
    console.log('='.repeat(70));

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
