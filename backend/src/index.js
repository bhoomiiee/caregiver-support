require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const voiceRoutes = require('./routes/voice');
const evaluationRoutes = require('./routes/evaluation');
const adminRoutes = require('./routes/admin');
const psychiatristRoutes = require('./routes/psychiatrist');
const { scheduleWeeklyEvaluation } = require('./services/scheduler');

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://caregiver-support-rouge.vercel.app',
    /\.vercel\.app$/,
  ],
  exposedHeaders: ['X-Session-Id', 'X-Transcript'],
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/evaluation', evaluationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/psychiatrist', psychiatristRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

scheduleWeeklyEvaluation();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
