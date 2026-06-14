const http = require('http');

const BASE_URL = 'http://localhost:3000';

const USER_ROLES = {
  APPLICANT: 'APPLICANT',
  LIBRARIAN: 'LIBRARIAN',
  SUPERVISOR: 'SUPERVISOR'
};

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('Laboratory Sample API - Integration Tests');
  console.log('='.repeat(60));
  
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
    console.log('\n[1/8] Health Check');
    const health = await request('GET', '/health');
    assert(health.status === 200 && health.data.status === 'ok', 'Server is running');

    console.log('\n[2/8] Sample Registration (Librarian)');
    const sampleData = {
      name: 'COVID-19 Test Sample #001',
      category: 'Biological',
      validityPeriod: '2027-12-31',
      storageLocation: 'Freezer A, Shelf 3',
      registrant: 'Dr. Zhang (Library)'
    };
    const createResult = await request('POST', '/api/samples', sampleData, getHeaders(USER_ROLES.LIBRARIAN));
    assert(createResult.status === 201 && createResult.data.success === true, 'Sample registered successfully', createResult.data);
    const sampleId = createResult.data.data.id;
    assert(sampleId && sampleId.startsWith('SMP-'), 'Sample ID generated correctly', { sampleId });

    console.log('\n[3/8] Borrow Flow');
    const borrowRequest = {
      sampleId: sampleId,
      applicant: 'Researcher Wang',
      reason: 'COVID-19 variant analysis',
      duration: 7
    };
    const borrowResult = await request('POST', '/api/requests/borrow', borrowRequest, getHeaders(USER_ROLES.APPLICANT));
    assert(borrowResult.status === 201 && borrowResult.data.success === true, 'Borrow request created', borrowResult.data);
    const borrowReqId = borrowResult.data.data.id;

    const approveBorrow = await request('POST', `/api/requests/${borrowReqId}/approve`, {
      approver: 'Dr. Li (Librarian)',
      approvalBasis: 'Valid research purpose, storage capacity confirmed'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(approveBorrow.status === 200 && approveBorrow.data.success === true, 'Borrow request approved by librarian', approveBorrow.data);
    assert(approveBorrow.data.data.sample.status === 'BORROWED', 'Sample status updated to BORROWED', 
           { expected: 'BORROWED', actual: approveBorrow.data.data?.sample?.status });

    console.log('\n[4/8] Renew Flow');
    const renewRequest = {
      sampleId: sampleId,
      applicant: 'Researcher Wang',
      reason: 'Analysis incomplete, need more time',
      newDuration: 14
    };
    const renewResult = await request('POST', '/api/requests/renew', renewRequest, getHeaders(USER_ROLES.APPLICANT));
    assert(renewResult.status === 201 && renewResult.data.success === true, 'Renew request created', renewResult.data);
    const renewReqId = renewResult.data.data.id;

    const approveRenew = await request('POST', `/api/requests/${renewReqId}/approve`, {
      approver: 'Dr. Li (Librarian)',
      approvalBasis: 'Research progress verified, extension approved'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(approveRenew.status === 200 && approveRenew.data.success === true, 'Renew request approved', approveRenew.data);
    assert(approveRenew.data.data.sample.dueDate !== null, 'Due date updated',
           { dueDate: approveRenew.data.data?.sample?.dueDate });

    console.log('\n[5/8] Return Flow');
    const returnRequest = {
      sampleId: sampleId,
      applicant: 'Researcher Wang'
    };
    const returnResult = await request('POST', '/api/requests/return', returnRequest, getHeaders(USER_ROLES.APPLICANT));
    assert(returnResult.status === 201 && returnResult.data.success === true, 'Return request created', returnResult.data);
    const returnReqId = returnResult.data.data.id;

    const approveReturn = await request('POST', `/api/requests/${returnReqId}/approve`, {
      approver: 'Dr. Li (Librarian)',
      approvalBasis: 'Sample returned in good condition'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(approveReturn.status === 200 && approveReturn.data.success === true, 'Return request approved', approveReturn.data);
    assert(approveReturn.data.data.sample.status === 'AVAILABLE', 'Sample status updated to AVAILABLE',
           { expected: 'AVAILABLE', actual: approveReturn.data.data?.sample?.status });

    console.log('\n[6/8] Destruction Flow');
    const destSampleData = {
      name: 'Expired Chemical Sample #002',
      category: 'Chemical',
      validityPeriod: '2020-01-01',
      storageLocation: 'Cabinet B, Shelf 1',
      registrant: 'Dr. Zhang (Library)'
    };
    const destCreateResult = await request('POST', '/api/samples', destSampleData, getHeaders(USER_ROLES.LIBRARIAN));
    const destSampleId = destCreateResult.data.data.id;

    const destructionRequest = {
      sampleId: destSampleId,
      applicant: 'Dr. Zhang (Library)',
      reason: 'Sample expired on 2020-01-01',
      approvalBasis: 'Safety regulation: expired chemicals must be disposed'
    };
    const destructionResult = await request('POST', '/api/requests/destruction', destructionRequest, getHeaders(USER_ROLES.LIBRARIAN));
    assert(destructionResult.status === 201 && destructionResult.data.success === true, 'Destruction request created', destructionResult.data);
    const destReqId = destructionResult.data.data.id;

    const approveDestruction = await request('POST', `/api/requests/${destReqId}/approve-destruction`, {
      approver: 'Prof. Chen (Supervisor)',
      approvalBasis: 'Confirmed expired, disposal protocol followed'
    }, getHeaders(USER_ROLES.SUPERVISOR));
    assert(approveDestruction.status === 200 && approveDestruction.data.success === true, 'Destruction approved by supervisor', approveDestruction.data);
    assert(approveDestruction.data.data.sample.status === 'DESTROYED', 'Sample status updated to DESTROYED',
           { expected: 'DESTROYED', actual: approveDestruction.data.data?.sample?.status });

    console.log('\n[7/8] Exception Scenarios');
    
    const frozenSampleData = {
      name: 'Frozen Sample #003',
      category: 'Biological',
      validityPeriod: '2028-06-30',
      storageLocation: 'Freezer B, Shelf 1',
      registrant: 'Dr. Zhang (Library)'
    };
    const frozenCreateResult = await request('POST', '/api/samples', frozenSampleData, getHeaders(USER_ROLES.LIBRARIAN));
    const frozenSampleId = frozenCreateResult.data.data.id;

    const frozenBorrowReq = {
      sampleId: frozenSampleId,
      applicant: 'Researcher Liu',
      reason: 'Testing',
      duration: 7
    };
    const frozenBorrow = await request('POST', '/api/requests/borrow', frozenBorrowReq, getHeaders(USER_ROLES.APPLICANT));
    const frozenBorrowReqId = frozenBorrow.data.data.id;
    await request('POST', `/api/requests/${frozenBorrowReqId}/approve`, {
      approver: 'Dr. Li (Librarian)',
      approvalBasis: 'Approved'
    }, getHeaders(USER_ROLES.LIBRARIAN));

    const freezeResult = await request('POST', `/api/samples/${frozenSampleId}/freeze`, {
      operator: 'Dr. Li (Librarian)',
      reason: 'Quality inspection required'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(freezeResult.data.data.status === 'FROZEN', 'Sample frozen successfully',
           { expected: 'FROZEN', actual: freezeResult.data.data?.status });

    const renewFrozenResult = await request('POST', '/api/requests/renew', {
      sampleId: frozenSampleId,
      applicant: 'Researcher Liu',
      reason: 'Need more time',
      newDuration: 7
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(renewFrozenResult.status === 400, 'Renew request rejected for frozen sample',
           { expected: 400, actual: renewFrozenResult.status });

    const unfreezeResult = await request('POST', `/api/samples/${frozenSampleId}/unfreeze`, {
      operator: 'Prof. Chen (Supervisor)',
      reason: 'Inspection complete, no issues found'
    }, getHeaders(USER_ROLES.SUPERVISOR));
    assert(unfreezeResult.data.data.status === 'BORROWED', 'Sample unfrozen and returned to BORROWED',
           { expected: 'BORROWED', actual: unfreezeResult.data.data?.status, borrowDate: unfreezeResult.data.data?.borrowDate });

    const returnFrozenSample = {
      sampleId: frozenSampleId,
      applicant: 'Researcher Liu'
    };
    const returnFrozenReq = await request('POST', '/api/requests/return', returnFrozenSample, getHeaders(USER_ROLES.APPLICANT));
    const returnFrozenReqId = returnFrozenReq.data.data.id;
    await request('POST', `/api/requests/${returnFrozenReqId}/approve`, {
      approver: 'Dr. Li (Librarian)',
      approvalBasis: 'Sample returned'
    }, getHeaders(USER_ROLES.LIBRARIAN));

    const destroyedReturnResult = await request('POST', '/api/requests/return', {
      sampleId: destSampleId,
      applicant: 'Researcher Wang'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(destroyedReturnResult.status === 400, 'Return rejected for destroyed sample',
           { expected: 400, actual: destroyedReturnResult.status });

    console.log('\n[8/8] Audit Log Export');
    const auditLogs = await request('GET', '/api/audit-logs', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(auditLogs.status === 200 && auditLogs.data.success === true, 'Audit logs retrieved', auditLogs.data);
    assert(auditLogs.data.data.total > 0, 'Audit logs contain records',
           { total: auditLogs.data.data.total });
    
    const auditWithDetails = auditLogs.data.data.logs[0];
    assert(auditWithDetails.validityPeriod !== null, 'Audit log includes validity period',
           { validityPeriod: auditWithDetails?.validityPeriod });
    assert(auditWithDetails.storageLocation !== null, 'Audit log includes storage location',
           { storageLocation: auditWithDetails?.storageLocation });
    assert(auditWithDetails.approvalBasis !== undefined, 'Audit log includes approval basis field',
           { approvalBasis: auditWithDetails?.approvalBasis });

    console.log('\n' + '='.repeat(60));
    console.log(`Test Results: ${passed} passed, ${failed} failed`);
    
    if (failures.length > 0) {
      console.log('\nFailed Tests:');
      failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    }
    console.log('='.repeat(60));

    if (failed > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('Test execution error:', error.message);
    console.error('Make sure the server is running on port 3000');
    process.exit(1);
  }
}

runTests();
