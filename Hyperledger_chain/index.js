require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// In-memory event store for now (will be replaced by Hyperledger Fabric later)
const events = [];

// Health check
app.get('/api/chronos/health', (req, res) => {
  res.json({ status: 'ok', service: 'chronos', eventsCount: events.length });
});

// Record a fraud decision + linked Scribe reports
app.post('/api/chronos/decision', (req, res) => {
  const { incidentId, decision, reasonCode, reports, decidedBy } = req.body || {};

  if (!incidentId || !decision) {
    return res.status(400).json({ error: 'incidentId and decision are required' });
  }

  const event = {
    type: 'decision',
    incidentId,
    decision,
    reasonCode: reasonCode || null,
    decidedBy: decidedBy || 'it_admin',
    reports: Array.isArray(reports) ? reports : [],
    timestamp: new Date().toISOString()
  };

  events.push(event);
  res.status(201).json({ ok: true, event });
});

// Get full on-chain-style history (simulated) for an incident
app.get('/api/chronos/incident/:incidentId', (req, res) => {
  const { incidentId } = req.params;
  const history = events.filter(e => e.incidentId === incidentId);
  res.json({ incidentId, events: history });
});

app.listen(port, () => {
  console.log(`Chronos audit service listening on port ${port}`);
});

