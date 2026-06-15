const express = require('express');
const samplesRouter = require('./routes/samples');
const requestsRouter = require('./routes/requests');
const auditLogsRouter = require('./routes/auditLogs');
const timelineRouter = require('./routes/timeline');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/samples', samplesRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/timeline', timelineRouter);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Laboratory Sample API server running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET  /health');
    console.log('  POST /api/samples');
    console.log('  GET  /api/samples');
    console.log('  GET  /api/samples/:id');
    console.log('  PUT  /api/samples/:id');
    console.log('  POST /api/samples/:id/freeze');
    console.log('  POST /api/samples/:id/unfreeze');
    console.log('  GET  /api/samples/overdue/mark');
    console.log('  POST /api/requests/borrow');
    console.log('  POST /api/requests/return');
    console.log('  POST /api/requests/renew');
    console.log('  POST /api/requests/destruction');
    console.log('  GET  /api/requests');
    console.log('  GET  /api/requests/:id');
    console.log('  POST /api/requests/:id/approve');
    console.log('  POST /api/requests/:id/approve-destruction');
    console.log('  POST /api/requests/:id/reject');
    console.log('  POST /api/requests/:id/cancel');
    console.log('  GET  /api/audit-logs');
    console.log('  GET  /api/audit-logs/export');
    console.log('  GET  /api/timeline');
    console.log('  GET  /api/timeline/:id');
    console.log('  GET  /api/timeline/export');
    console.log('  GET  /api/timeline/stats');
    console.log('  GET  /api/timeline/config');
    console.log('  PUT  /api/timeline/config');
  });
}

module.exports = app;
