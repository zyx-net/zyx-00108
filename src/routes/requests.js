const express = require('express');
const requestService = require('../services/requestService');
const sampleService = require('../services/sampleService');
const { buildResponse, parseQueryInt, addDays } = require('../utils/helpers');
const { USER_ROLE, REQUEST_TYPE, SAMPLE_STATUS } = require('../utils/constants');

const router = express.Router();

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.headers['x-user-role'] || USER_ROLE.APPLICANT;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json(buildResponse(false, null, 'Insufficient permissions'));
    }
    req.userRole = userRole;
    next();
  };
}

router.post('/borrow', requireRole(USER_ROLE.APPLICANT), async (req, res) => {
  try {
    const { sampleId, applicant, reason, duration } = req.body;
    
    if (!sampleId || !applicant || !reason) {
      return res.status(400).json(buildResponse(false, null, 'Missing required fields'));
    }

    const sample = await sampleService.findById(sampleId);
    if (!sample) {
      return res.status(404).json(buildResponse(false, null, 'Sample not found'));
    }

    if (sample.status !== SAMPLE_STATUS.AVAILABLE) {
      return res.status(400).json(buildResponse(false, null, `Sample is not available, current status: ${sample.status}`));
    }

    const request = await requestService.createRequest({
      sampleId,
      type: REQUEST_TYPE.BORROW,
      applicant,
      applicantRole: USER_ROLE.APPLICANT,
      reason,
      newDueDate: addDays(new Date().toISOString(), duration || 30)
    });

    res.status(201).json(buildResponse(true, request));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.post('/return', requireRole(USER_ROLE.APPLICANT), async (req, res) => {
  try {
    const { sampleId, applicant } = req.body;
    
    if (!sampleId || !applicant) {
      return res.status(400).json(buildResponse(false, null, 'Missing required fields'));
    }

    const sample = await sampleService.findById(sampleId);
    if (!sample) {
      return res.status(404).json(buildResponse(false, null, 'Sample not found'));
    }

    if (sample.status === SAMPLE_STATUS.DESTROYED) {
      return res.status(400).json(buildResponse(false, null, 'Sample has been destroyed and cannot be returned'));
    }

    if (sample.status === SAMPLE_STATUS.AVAILABLE) {
      return res.status(400).json(buildResponse(false, null, 'Sample is not currently borrowed'));
    }

    const request = await requestService.createRequest({
      sampleId,
      type: REQUEST_TYPE.RETURN,
      applicant,
      applicantRole: USER_ROLE.APPLICANT,
      reason: 'Return sample'
    });

    res.status(201).json(buildResponse(true, request));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.post('/renew', requireRole(USER_ROLE.APPLICANT), async (req, res) => {
  try {
    const { sampleId, applicant, reason, newDuration } = req.body;
    
    if (!sampleId || !applicant || !reason) {
      return res.status(400).json(buildResponse(false, null, 'Missing required fields'));
    }

    const sample = await sampleService.findById(sampleId);
    if (!sample) {
      return res.status(404).json(buildResponse(false, null, 'Sample not found'));
    }

    if (sample.status === SAMPLE_STATUS.FROZEN) {
      return res.status(400).json(buildResponse(false, null, 'Sample is frozen and cannot be renewed'));
    }

    if (sample.status === SAMPLE_STATUS.DESTROYED) {
      return res.status(400).json(buildResponse(false, null, 'Sample has been destroyed and cannot be renewed'));
    }

    if (sample.status === SAMPLE_STATUS.AVAILABLE) {
      return res.status(400).json(buildResponse(false, null, 'Sample is not currently borrowed'));
    }

    const request = await requestService.createRequest({
      sampleId,
      type: REQUEST_TYPE.RENEW,
      applicant,
      applicantRole: USER_ROLE.APPLICANT,
      reason,
      newDueDate: addDays(new Date().toISOString(), newDuration || 30)
    });

    res.status(201).json(buildResponse(true, request));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.post('/destruction', requireRole(USER_ROLE.APPLICANT, USER_ROLE.LIBRARIAN), async (req, res) => {
  try {
    const { sampleId, applicant, reason, approvalBasis } = req.body;
    
    if (!sampleId || !applicant || !reason) {
      return res.status(400).json(buildResponse(false, null, 'Missing required fields'));
    }

    const sample = await sampleService.findById(sampleId);
    if (!sample) {
      return res.status(404).json(buildResponse(false, null, 'Sample not found'));
    }

    if (sample.status === SAMPLE_STATUS.DESTROYED) {
      return res.status(400).json(buildResponse(false, null, 'Sample is already destroyed'));
    }

    const request = await requestService.createRequest({
      sampleId,
      type: REQUEST_TYPE.DESTRUCTION,
      applicant,
      applicantRole: req.userRole,
      reason,
      approvalBasis
    });

    res.status(201).json(buildResponse(true, request));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/', async (req, res) => {
  try {
    const { sampleId, type, status, applicant, page, limit } = req.query;
    const result = await requestService.findAll({
      sampleId,
      type,
      status,
      applicant,
      page: parseQueryInt(page, 1),
      limit: parseQueryInt(limit, 20)
    });

    res.json(buildResponse(true, result));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/:id', async (req, res) => {
  try {
    const request = await requestService.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json(buildResponse(false, null, 'Request not found'));
    }

    res.json(buildResponse(true, request));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.post('/:id/approve', requireRole(USER_ROLE.LIBRARIAN), async (req, res) => {
  try {
    const { approver, approvalBasis } = req.body;
    
    if (!approver || !approvalBasis) {
      return res.status(400).json(buildResponse(false, null, 'Approver and approvalBasis are required'));
    }

    const result = await requestService.approve(
      req.params.id,
      approver,
      req.userRole,
      approvalBasis
    );

    res.json(buildResponse(true, result));
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json(buildResponse(false, null, error.message));
    }
    if (error.message.includes('not pending')) {
      return res.status(400).json(buildResponse(false, null, error.message));
    }
    if (error.message.includes('retry')) {
      return res.status(409).json(buildResponse(false, null, error.message));
    }
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.post('/:id/approve-destruction', requireRole(USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const { approver, approvalBasis } = req.body;
    
    if (!approver || !approvalBasis) {
      return res.status(400).json(buildResponse(false, null, 'Approver and approvalBasis are required'));
    }

    const result = await requestService.approve(
      req.params.id,
      approver,
      req.userRole,
      approvalBasis
    );

    res.json(buildResponse(true, result));
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json(buildResponse(false, null, error.message));
    }
    if (error.message.includes('not pending')) {
      return res.status(400).json(buildResponse(false, null, error.message));
    }
    if (error.message.includes('already destroyed')) {
      return res.status(409).json(buildResponse(false, null, error.message));
    }
    if (error.message.includes('retry')) {
      return res.status(409).json(buildResponse(false, null, error.message));
    }
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.post('/:id/reject', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const { approver, reason } = req.body;
    
    if (!approver || !reason) {
      return res.status(400).json(buildResponse(false, null, 'Approver and reason are required'));
    }

    const request = await requestService.reject(
      req.params.id,
      approver,
      req.userRole,
      reason
    );

    res.json(buildResponse(true, request));
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json(buildResponse(false, null, error.message));
    }
    if (error.message.includes('not pending')) {
      return res.status(400).json(buildResponse(false, null, error.message));
    }
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.post('/:id/cancel', requireRole(USER_ROLE.APPLICANT), async (req, res) => {
  try {
    const { user } = req.body;
    
    if (!user) {
      return res.status(400).json(buildResponse(false, null, 'User is required'));
    }

    const request = await requestService.cancel(req.params.id, user);
    res.json(buildResponse(true, request));
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json(buildResponse(false, null, error.message));
    }
    if (error.message.includes('not pending') || error.message.includes('Only the applicant')) {
      return res.status(400).json(buildResponse(false, null, error.message));
    }
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

module.exports = router;
