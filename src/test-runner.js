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
    console.log('\n[1/9] Health Check');
    const health = await request('GET', '/health');
    assert(health.status === 200 && health.data.status === 'ok', 'Server is running');

    console.log('\n[2/9] Sample Registration (Librarian)');
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

    console.log('\n[3/9] Borrow Flow with Request Status Verification');
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
    
    const borrowReqCheck = await request('GET', `/api/requests/${borrowReqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(borrowReqCheck.data.data.status === 'APPROVED', 'Request status is APPROVED after approval', 
           { expected: 'APPROVED', actual: borrowReqCheck.data.data?.status });
    assert(borrowReqCheck.data.data.approver === 'Dr. Li (Librarian)', 'Approver is recorded correctly',
           { expected: 'Dr. Li (Librarian)', actual: borrowReqCheck.data.data?.approver });

    console.log('\n[4/9] Renew Flow with Request Status Verification');
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
    
    const renewReqCheck = await request('GET', `/api/requests/${renewReqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(renewReqCheck.data.data.status === 'APPROVED', 'Renew request status is APPROVED after approval',
           { expected: 'APPROVED', actual: renewReqCheck.data.data?.status });

    console.log('\n[5/9] Return Flow with Request Status Verification');
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
    
    const returnReqCheck = await request('GET', `/api/requests/${returnReqId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(returnReqCheck.data.data.status === 'APPROVED', 'Return request status is APPROVED after approval',
           { expected: 'APPROVED', actual: returnReqCheck.data.data?.status });

    console.log('\n[6/9] Destruction Flow with Role Restriction');
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

    const librarianApproveDestruction = await request('POST', `/api/requests/${destReqId}/approve`, {
      approver: 'Dr. Li (Librarian)',
      approvalBasis: 'Trying to bypass supervisor approval'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(librarianApproveDestruction.status === 403, 'Librarian cannot approve destruction via regular approve endpoint',
           { expected: 403, actual: librarianApproveDestruction.status, error: librarianApproveDestruction.data?.error });

    const approveDestruction = await request('POST', `/api/requests/${destReqId}/approve-destruction`, {
      approver: 'Prof. Chen (Supervisor)',
      approvalBasis: 'Confirmed expired, disposal protocol followed'
    }, getHeaders(USER_ROLES.SUPERVISOR));
    assert(approveDestruction.status === 200 && approveDestruction.data.success === true, 'Destruction approved by supervisor', approveDestruction.data);
    assert(approveDestruction.data.data.sample.status === 'DESTROYED', 'Sample status updated to DESTROYED',
           { expected: 'DESTROYED', actual: approveDestruction.data.data?.sample?.status });
    
    const destReqCheck = await request('GET', `/api/requests/${destReqId}`, null, getHeaders(USER_ROLES.SUPERVISOR));
    assert(destReqCheck.data.data.status === 'APPROVED', 'Destruction request status is APPROVED after approval',
           { expected: 'APPROVED', actual: destReqCheck.data.data?.status });

    console.log('\n[7/10] Duplicate and Concurrent Approval Prevention');

    const concurrentDestSampleData = {
      name: 'Concurrent Destruction Sample',
      category: 'Chemical',
      validityPeriod: '2020-01-01',
      storageLocation: 'Cabinet C, Shelf 1',
      registrant: 'Dr. Zhang (Library)'
    };
    const concurrentDestCreateResult = await request('POST', '/api/samples', concurrentDestSampleData, getHeaders(USER_ROLES.LIBRARIAN));
    const concurrentDestSampleId = concurrentDestCreateResult.data.data.id;

    const concurrentDestRequest = {
      sampleId: concurrentDestSampleId,
      applicant: 'Dr. Zhang (Library)',
      reason: 'Expired sample',
      approvalBasis: 'Safety regulation'
    };
    const concurrentDestResult = await request('POST', '/api/requests/destruction', concurrentDestRequest, getHeaders(USER_ROLES.LIBRARIAN));
    const concurrentDestReqId = concurrentDestResult.data.data.id;

    let approvalResults;
    const firstApprovalPromise = request('POST', `/api/requests/${concurrentDestReqId}/approve-destruction`, {
      approver: 'Prof. Chen (Supervisor)',
      approvalBasis: 'First approval'
    }, getHeaders(USER_ROLES.SUPERVISOR));

    const secondApprovalPromise = request('POST', `/api/requests/${concurrentDestReqId}/approve-destruction`, {
      approver: 'Prof. Liu (Supervisor)',
      approvalBasis: 'Second approval attempt'
    }, getHeaders(USER_ROLES.SUPERVISOR));

    approvalResults = await Promise.all([firstApprovalPromise, secondApprovalPromise]);

    const successResults = approvalResults.filter(r => r.status === 200);
    const conflictResults = approvalResults.filter(r => r.status === 409);
    
    assert(successResults.length === 1, 'Exactly one approval should succeed in concurrent scenario',
           { successCount: successResults.length });
    assert(conflictResults.length === 1, 'Exactly one approval should fail with 409 Conflict',
           { conflictCount: conflictResults.length });
    assert(conflictResults[0].data.error.includes('not pending'), 'Error message indicates request is not pending',
           { error: conflictResults[0].data?.error });

    console.log('\n[8/10] Exception Scenarios');
    
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

    console.log('\n[9/12] Cancel Request - Successful Cancellation');
    const cancelSampleData = {
      name: 'Cancel Test Sample #004',
      category: 'Biological',
      validityPeriod: '2028-12-31',
      storageLocation: 'Freezer C, Shelf 1',
      registrant: 'Dr. Zhang (Library)'
    };
    const cancelSampleCreate = await request('POST', '/api/samples', cancelSampleData, getHeaders(USER_ROLES.LIBRARIAN));
    const cancelSampleId = cancelSampleCreate.data.data.id;
    
    const cancelBorrowReq = {
      sampleId: cancelSampleId,
      applicant: 'Researcher Zhao',
      reason: 'Testing cancellation',
      duration: 7
    };
    const cancelBorrowResult = await request('POST', '/api/requests/borrow', cancelBorrowReq, getHeaders(USER_ROLES.APPLICANT));
    const cancelReqId = cancelBorrowResult.data.data.id;
    
    const sampleBeforeCancel = await request('GET', `/api/samples/${cancelSampleId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(sampleBeforeCancel.data.data.status === 'AVAILABLE', 'Sample is AVAILABLE before cancellation',
           { expected: 'AVAILABLE', actual: sampleBeforeCancel.data.data?.status });
    
    const cancelSuccess = await request('POST', `/api/requests/${cancelReqId}/cancel`, {
      user: 'Researcher Zhao',
      reason: 'Changed research direction'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(cancelSuccess.status === 200 && cancelSuccess.data.success === true, 'Cancel request succeeded', cancelSuccess.data);
    assert(cancelSuccess.data.data.status === 'CANCELLED', 'Request status is CANCELLED after cancellation',
           { expected: 'CANCELLED', actual: cancelSuccess.data.data?.status });
    assert(cancelSuccess.data.data.cancelledAt !== null, 'Cancelled timestamp is recorded',
           { cancelledAt: cancelSuccess.data.data?.cancelledAt });
    assert(cancelSuccess.data.data.cancelReason === 'Changed research direction', 'Cancel reason is recorded',
           { expected: 'Changed research direction', actual: cancelSuccess.data.data?.cancelReason });
    
    const sampleAfterCancel = await request('GET', `/api/samples/${cancelSampleId}`, null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(sampleAfterCancel.data.data.status === 'AVAILABLE', 'Sample status unchanged after cancellation (still AVAILABLE)',
           { expected: 'AVAILABLE', actual: sampleAfterCancel.data.data?.status });
    assert(sampleAfterCancel.data.data.currentHolder === null, 'Sample holder unchanged after cancellation',
           { expected: null, actual: sampleAfterCancel.data.data?.currentHolder });

    console.log('\n[10/12] Cancel Request - Unauthorized Cancellation');
    
    const unauthorizedCancelByLibrarian = await request('POST', `/api/requests/${cancelReqId}/cancel`, {
      user: 'Researcher Zhao',
      reason: 'Librarian trying to cancel'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(unauthorizedCancelByLibrarian.status === 403, 'Librarian cannot cancel request (returns 403)',
           { expected: 403, actual: unauthorizedCancelByLibrarian.status, error: unauthorizedCancelByLibrarian.data?.error });
    
    const unauthorizedCancelBySupervisor = await request('POST', `/api/requests/${cancelReqId}/cancel`, {
      user: 'Researcher Zhao',
      reason: 'Supervisor trying to cancel'
    }, getHeaders(USER_ROLES.SUPERVISOR));
    assert(unauthorizedCancelBySupervisor.status === 403, 'Supervisor cannot cancel request (returns 403)',
           { expected: 403, actual: unauthorizedCancelBySupervisor.status, error: unauthorizedCancelBySupervisor.data?.error });
    
    const unauthorizedCancelByOtherApplicant = await request('POST', `/api/requests/${cancelReqId}/cancel`, {
      user: 'Researcher Wang',
      reason: 'Other applicant trying to cancel'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(unauthorizedCancelByOtherApplicant.status === 403, 'Other applicant cannot cancel (returns 403)',
           { expected: 403, actual: unauthorizedCancelByOtherApplicant.status, error: unauthorizedCancelByOtherApplicant.data?.error });

    console.log('\n[11/12] Cancel Request - Conflict Scenarios');
    
    const cancelAlreadyCancelled = await request('POST', `/api/requests/${cancelReqId}/cancel`, {
      user: 'Researcher Zhao',
      reason: 'Try to cancel again'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(cancelAlreadyCancelled.status === 409, 'Cannot cancel already cancelled request (returns 409)',
           { expected: 409, actual: cancelAlreadyCancelled.status, error: cancelAlreadyCancelled.data?.error });
    
    const cancelApprovedRequest = await request('POST', `/api/requests/${borrowReqId}/cancel`, {
      user: 'Researcher Wang',
      reason: 'Try to cancel approved'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(cancelApprovedRequest.status === 409, 'Cannot cancel approved request (returns 409)',
           { expected: 409, actual: cancelApprovedRequest.status, error: cancelApprovedRequest.data?.error });
    assert(cancelApprovedRequest.data.error.includes('not pending'), 'Error indicates request is not pending',
           { error: cancelApprovedRequest.data?.error });
    
    const anotherCancelSampleData = {
      name: 'Reject Cancel Sample #005',
      category: 'Chemical',
      validityPeriod: '2028-12-31',
      storageLocation: 'Cabinet D, Shelf 1',
      registrant: 'Dr. Zhang (Library)'
    };
    const anotherCancelSampleCreate = await request('POST', '/api/samples', anotherCancelSampleData, getHeaders(USER_ROLES.LIBRARIAN));
    const anotherCancelSampleId = anotherCancelSampleCreate.data.data.id;
    
    const rejectBorrowReq = {
      sampleId: anotherCancelSampleId,
      applicant: 'Researcher Wang',
      reason: 'Test rejection then cancel',
      duration: 7
    };
    const rejectBorrowResult = await request('POST', '/api/requests/borrow', rejectBorrowReq, getHeaders(USER_ROLES.APPLICANT));
    const rejectReqId = rejectBorrowResult.data.data.id;
    
    await request('POST', `/api/requests/${rejectReqId}/reject`, {
      approver: 'Dr. Li (Librarian)',
      reason: 'Insufficient justification'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    
    const cancelRejectedRequest = await request('POST', `/api/requests/${rejectReqId}/cancel`, {
      user: 'Researcher Wang',
      reason: 'Try to cancel rejected'
    }, getHeaders(USER_ROLES.APPLICANT));
    assert(cancelRejectedRequest.status === 409, 'Cannot cancel rejected request (returns 409)',
           { expected: 409, actual: cancelRejectedRequest.status, error: cancelRejectedRequest.data?.error });

    console.log('\n[12/12] Cancel Request - Audit Log Verification');
    const cancelAuditLogs = await request('GET', '/api/audit-logs?action=REQUEST_CANCELLED', null, getHeaders(USER_ROLES.LIBRARIAN));
    assert(cancelAuditLogs.status === 200 && cancelAuditLogs.data.success === true, 'Cancel audit logs retrieved', cancelAuditLogs.data);
    assert(cancelAuditLogs.data.data.total > 0, 'Cancel audit logs contain records',
           { total: cancelAuditLogs.data.data.total });
    
    const cancelAudit = cancelAuditLogs.data.data.logs[0];
    assert(cancelAudit.action === 'REQUEST_CANCELLED', 'Audit action is REQUEST_CANCELLED',
           { expected: 'REQUEST_CANCELLED', actual: cancelAudit.action });
    assert(cancelAudit.user === 'Researcher Zhao', 'Audit user is the applicant',
           { expected: 'Researcher Zhao', actual: cancelAudit.user });
    assert(cancelAudit.role === 'APPLICANT', 'Audit role is APPLICANT',
           { expected: 'APPLICANT', actual: cancelAudit.role });
    assert(cancelAudit.result === 'SUCCESS', 'Audit result is SUCCESS',
           { expected: 'SUCCESS', actual: cancelAudit.result });
    assert(cancelAudit.details.reason === 'Changed research direction', 'Audit details include cancel reason',
           { expected: 'Changed research direction', actual: cancelAudit.details?.reason });
    assert(cancelAudit.details.previousStatus === 'PENDING', 'Audit details include previous status',
           { expected: 'PENDING', actual: cancelAudit.details?.previousStatus });

    console.log('\n[13/14] Duplicate and Concurrent Approval Prevention');
    const duplicateApprove = await request('POST', `/api/requests/${borrowReqId}/approve`, {
      approver: 'Dr. Li (Librarian)',
      approvalBasis: 'Trying to approve again'
    }, getHeaders(USER_ROLES.LIBRARIAN));
    assert(duplicateApprove.status === 409, 'Cannot approve already approved request (returns 409 Conflict)',
           { expected: 409, actual: duplicateApprove.status, error: duplicateApprove.data?.error });

    console.log('\n[14/14] Audit Log Export and Verification');
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

    const approvedLogs = auditLogs.data.data.logs.filter(l => l.action === 'REQUEST_APPROVED');
    if (approvedLogs.length > 0) {
      const approvedLog = approvedLogs[0];
      assert(approvedLog.approvalBasis !== null && approvedLog.approvalBasis !== undefined, 
             'Approved request audit log has approvalBasis',
             { approvalBasis: approvedLog.approvalBasis });
    }

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
