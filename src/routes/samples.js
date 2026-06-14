const express = require('express');
const sampleService = require('../services/sampleService');
const { buildResponse, parseQueryInt } = require('../utils/helpers');
const { USER_ROLE, ROLE_PERMISSIONS } = require('../utils/constants');

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

router.post('/', requireRole(USER_ROLE.LIBRARIAN), async (req, res) => {
  try {
    const { name, category, validityPeriod, storageLocation, registrant } = req.body;
    
    if (!name || !category || !validityPeriod || !storageLocation || !registrant) {
      return res.status(400).json(buildResponse(false, null, 'Missing required fields'));
    }

    const sample = await sampleService.create(
      { name, category, validityPeriod, storageLocation },
      registrant,
      req.userRole
    );

    res.status(201).json(buildResponse(true, sample));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/', async (req, res) => {
  try {
    const { status, category, page, limit } = req.query;
    const result = await sampleService.findAll({
      status,
      category,
      page: parseQueryInt(page, 1),
      limit: parseQueryInt(limit, 20)
    });

    res.json(buildResponse(true, result));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/overdue/mark', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const markedCount = await sampleService.markOverdue();
    res.json(buildResponse(true, { markedCount }));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sample = await sampleService.findById(req.params.id);
    
    if (!sample) {
      return res.status(404).json(buildResponse(false, null, 'Sample not found'));
    }

    res.json(buildResponse(true, sample));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.put('/:id', requireRole(USER_ROLE.LIBRARIAN), async (req, res) => {
  try {
    const { storageLocation, validityPeriod, name, category, updater } = req.body;
    
    if (!updater) {
      return res.status(400).json(buildResponse(false, null, 'Updater name is required'));
    }

    const sample = await sampleService.update(
      req.params.id,
      { storageLocation, validityPeriod, name, category },
      updater,
      req.userRole
    );

    res.json(buildResponse(true, sample));
  } catch (error) {
    if (error.message === 'Sample not found') {
      return res.status(404).json(buildResponse(false, null, error.message));
    }
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.post('/:id/freeze', requireRole(USER_ROLE.LIBRARIAN), async (req, res) => {
  try {
    const { operator, reason } = req.body;
    
    if (!operator || !reason) {
      return res.status(400).json(buildResponse(false, null, 'Operator and reason are required'));
    }

    const sample = await sampleService.freeze(
      req.params.id,
      operator,
      req.userRole,
      reason
    );

    res.json(buildResponse(true, sample));
  } catch (error) {
    if (error.message === 'Sample not found') {
      return res.status(404).json(buildResponse(false, null, error.message));
    }
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.post('/:id/unfreeze', requireRole(USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const { operator, reason } = req.body;
    
    if (!operator || !reason) {
      return res.status(400).json(buildResponse(false, null, 'Operator and reason are required'));
    }

    const sample = await sampleService.unfreeze(
      req.params.id,
      operator,
      req.userRole,
      reason
    );

    res.json(buildResponse(true, sample));
  } catch (error) {
    if (error.message === 'Sample not found') {
      return res.status(404).json(buildResponse(false, null, error.message));
    }
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

module.exports = router;
