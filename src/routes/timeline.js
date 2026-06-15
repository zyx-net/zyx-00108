const express = require('express');
const timelineService = require('../services/timelineService');
const auditConfig = require('../utils/auditConfig');
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
    const { requestId, sampleId, user, userRole, eventType, startDate, endDate, result, page, limit } = req.query;

    const result_data = await timelineService.query({
      requestId,
      sampleId,
      user,
      userRole,
      eventType,
      startDate,
      endDate,
      result,
      page: parseQueryInt(page, 1),
      limit: parseQueryInt(limit, 20)
    });

    res.json(buildResponse(true, result_data));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/request/:requestId', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const { requestId } = req.params;
    const timeline = await timelineService.getTimelineByRequestId(requestId);

    res.json(buildResponse(true, timeline));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/violator/:requestId', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const { requestId } = req.params;
    const violatorInfo = await timelineService.identifyViolator(requestId);

    if (!violatorInfo) {
      return res.status(404).json(buildResponse(false, null, 'No identity mismatch events found for this request'));
    }

    res.json(buildResponse(true, violatorInfo));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/replay/:requestId', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const { requestId } = req.params;
    const raceInfo = await timelineService.replayRaceCondition(requestId);

    if (!raceInfo) {
      return res.status(404).json(buildResponse(false, null, 'No race condition events found for this request'));
    }

    res.json(buildResponse(true, raceInfo));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/export', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const { format = 'json', requestId, sampleId, user, userRole, eventType, startDate, endDate, result } = req.query;
    const filters = { requestId, sampleId, user, userRole, eventType, startDate, endDate, result };

    if (format === 'csv') {
      const csv = await timelineService.exportToCsv(filters);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=timeline-events.csv');
      res.send(csv);
    } else {
      const json = await timelineService.exportToJson(filters);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=timeline-events.json');
      res.send(json);
    }
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/stats', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const stats = await timelineService.getStatistics();
    res.json(buildResponse(true, stats));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.get('/config', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const config = auditConfig.getAll();
    res.json(buildResponse(true, config));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.put('/config', requireRole(USER_ROLE.LIBRARIAN, USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const newConfig = req.body;
    const updatedConfig = auditConfig.update(newConfig);
    res.json(buildResponse(true, updatedConfig));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

router.post('/config/reset', requireRole(USER_ROLE.SUPERVISOR), async (req, res) => {
  try {
    const defaultConfig = auditConfig.reset();
    res.json(buildResponse(true, defaultConfig));
  } catch (error) {
    res.status(500).json(buildResponse(false, null, error.message));
  }
});

module.exports = router;
