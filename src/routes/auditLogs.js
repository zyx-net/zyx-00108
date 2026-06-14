const express = require('express');
const auditService = require('../services/auditService');
const { buildResponse, parseQueryInt } = require('../utils/helpers');
const { USER_ROLE } = require('../utils/constants');

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

router.get('/', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const { sampleId, user, action, startDate, endDate, requestId, result, page, limit } = req.query;
    const result_data = await auditService.query({
      sampleId,
      user,
      action,
      startDate,
      endDate,
      requestId,
      result,
      page: parseQueryInt(page, 1),
      limit: parseQueryInt(limit, 20)
    });

    res.json(buildResponse(true, result_data));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/export', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const { format = 'json', startDate, endDate, sampleId, action, user, requestId, result } = req.query;
    const filters = { startDate, endDate, sampleId, action, user, requestId, result };

    if (format === 'csv') {
      const csv = await auditService.exportToCsv(filters);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
      res.send(csv);
    } else {
      const json = await auditService.exportToJson(filters);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.json');
      res.send(json);
    }
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

module.exports = router;
