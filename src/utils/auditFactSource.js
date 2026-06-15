const { generateId, now } = require('../utils/helpers');

class AuditFactSource {
  buildCancelFact(request, sample, operatorUser, operatorRole, reason) {
    const isCreator = request.creator === operatorUser;
    const isCreatorRole = request.creatorRole === operatorRole;
    const identityVerified = isCreator && isCreatorRole;
    
    const fact = {
      factId: generateId('FACT'),
      generatedAt: now(),
      operation: 'CANCEL_REQUEST',
      
      operator: {
        user: operatorUser,
        role: operatorRole,
        isCreator,
        isCreatorRole
      },
      
      target: {
        requestId: request.id,
        requestType: request.type,
        requestStatus: request.status,
        requestVersion: request.version,
        sampleId: request.sampleId,
        applicant: request.applicant,
        creator: request.creator,
        creatorRole: request.creatorRole
      },
      
      sample: sample ? {
        id: sample.id,
        name: sample.name,
        status: sample.status,
        currentHolder: sample.currentHolder,
        storageLocation: sample.storageLocation
      } : null,
      
      identity: {
        verified: identityVerified,
        nameMatch: isCreator,
        roleMatch: isCreatorRole,
        violationType: this._determineViolationType(isCreator, isCreatorRole)
      },
      
      context: {
        reason: reason || null,
        previousStatus: request.status,
        timestamp: now()
      },
      
      auditTrail: {
        factSource: 'CANCEL_OPERATION',
        canReconstruct: true,
        reconstructKeys: ['request.id', 'operator.user', 'operator.role']
      }
    };
    
    return fact;
  }

  buildApproveFact(request, sample, approverUser, approverRole, approvalBasis) {
    const fact = {
      factId: generateId('FACT'),
      generatedAt: now(),
      operation: 'APPROVE_REQUEST',
      
      operator: {
        user: approverUser,
        role: approverRole
      },
      
      target: {
        requestId: request.id,
        requestType: request.type,
        requestStatus: request.status,
        requestVersion: request.version,
        sampleId: request.sampleId,
        applicant: request.applicant
      },
      
      sample: sample ? {
        id: sample.id,
        name: sample.name,
        status: sample.status,
        currentHolder: sample.currentHolder,
        storageLocation: sample.storageLocation
      } : null,
      
      context: {
        approvalBasis: approvalBasis || null,
        previousStatus: request.status,
        timestamp: now()
      },
      
      auditTrail: {
        factSource: 'APPROVE_OPERATION',
        canReconstruct: true,
        reconstructKeys: ['request.id', 'operator.user', 'operator.role']
      }
    };
    
    return fact;
  }

  buildRaceConditionFact(request, sample, winnerUser, winnerRole, winnerOperation, loserUser, loserRole, loserOperation) {
    const fact = {
      factId: generateId('FACT'),
      generatedAt: now(),
      operation: 'RACE_CONDITION',
      
      winner: {
        user: winnerUser,
        role: winnerRole,
        operation: winnerOperation,
        succeeded: true
      },
      
      loser: {
        user: loserUser,
        role: loserRole,
        operation: loserOperation,
        succeeded: false,
        failureReason: 'RACE_CONDITION_LOST'
      },
      
      target: {
        requestId: request.id,
        requestType: request.type,
        requestStatus: request.status,
        requestVersion: request.version,
        sampleId: request.sampleId
      },
      
      sample: sample ? {
        id: sample.id,
        name: sample.name,
        status: sample.status
      } : null,
      
      race: {
        detectedAt: now(),
        conflictType: 'APPROVAL_CANCEL_RACE',
        finalStatus: winnerOperation === 'CANCEL' ? 'CANCELLED' : 'APPROVED',
        bothAttempted: true
      },
      
      auditTrail: {
        factSource: 'RACE_CONDITION',
        canReconstruct: true,
        reconstructKeys: ['request.id', 'winner.user', 'loser.user']
      }
    };
    
    return fact;
  }

  buildIdentityMismatchFact(request, sample, attemptedUser, attemptedRole, violationType) {
    const fact = {
      factId: generateId('FACT'),
      generatedAt: now(),
      operation: 'IDENTITY_MISMATCH',
      
      actor: {
        user: attemptedUser,
        role: attemptedRole,
        action: 'CANCEL_ATTEMPT'
      },
      
      expected: {
        user: request.creator,
        role: request.creatorRole
      },
      
      violation: {
        type: violationType,
        nameMismatch: request.creator !== attemptedUser,
        roleMismatch: request.creatorRole !== attemptedRole,
        severity: 'HIGH'
      },
      
      target: {
        requestId: request.id,
        requestType: request.type,
        requestStatus: request.status,
        sampleId: request.sampleId
      },
      
      sample: sample ? {
        id: sample.id,
        name: sample.name,
        status: sample.status
      } : null,
      
      auditTrail: {
        factSource: 'IDENTITY_MISMATCH',
        canReconstruct: true,
        reconstructKeys: ['request.id', 'actor.user', 'expected.user']
      }
    };
    
    return fact;
  }

  buildVersionConflictFact(request, sample, attemptedUser, attemptedRole, operation, expectedVersion, actualVersion) {
    const fact = {
      factId: generateId('FACT'),
      generatedAt: now(),
      operation: 'VERSION_CONFLICT',
      
      actor: {
        user: attemptedUser,
        role: attemptedRole,
        attemptedOperation: operation
      },
      
      version: {
        expected: expectedVersion,
        actual: actualVersion,
        conflict: actualVersion !== expectedVersion
      },
      
      target: {
        requestId: request.id,
        requestType: request.type,
        requestStatus: request.status,
        sampleId: request.sampleId
      },
      
      sample: sample ? {
        id: sample.id,
        name: sample.name,
        status: sample.status
      } : null,
      
      auditTrail: {
        factSource: 'VERSION_CONFLICT',
        canReconstruct: true,
        reconstructKeys: ['request.id', 'actor.user', 'version.expected', 'version.actual']
      }
    };
    
    return fact;
  }

  _determineViolationType(isCreator, isCreatorRole) {
    if (isCreator && isCreatorRole) {
      return null;
    }
    if (!isCreator && !isCreatorRole) {
      return 'FULL_IDENTITY_MISMATCH';
    }
    if (!isCreator) {
      return 'NAME_MISMATCH';
    }
    return 'ROLE_MISMATCH';
  }

  extractAuditFields(fact) {
    return {
      factId: fact.factId,
      generatedAt: fact.generatedAt,
      operation: fact.operation,
      
      operatorUser: fact.operator?.user || fact.actor?.user || fact.winner?.user,
      operatorRole: fact.operator?.role || fact.actor?.role || fact.winner?.role,
      
      targetRequestId: fact.target?.requestId,
      targetSampleId: fact.target?.sampleId || fact.sample?.id,
      
      identity: fact.identity || fact.violation || null,
      race: fact.race || null,
      version: fact.version || null,
      
      context: fact.context || null,
      
      auditTrail: fact.auditTrail
    };
  }

  validateFact(fact) {
    const errors = [];
    
    if (!fact.factId) {
      errors.push('Missing factId');
    }
    if (!fact.generatedAt) {
      errors.push('Missing generatedAt');
    }
    if (!fact.operation) {
      errors.push('Missing operation');
    }
    if (!fact.target?.requestId) {
      errors.push('Missing target.requestId');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = new AuditFactSource();
