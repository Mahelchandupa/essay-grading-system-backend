const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Initialize services
const EssayGradingService = require('./services/EssayGradingService');
EssayGradingService.initialize()
  .then(() => console.log('✅ Essay grading service initialized'))
  .catch(err => console.error('❌ Service initialization error:', err));

// Routes
const authRoutes = require('./routes/auth.routes');
const essayRoutes = require('./routes/essay.routes');
const studentRoutes = require('./routes/student.routes');
const analyticsRoutes = require('./routes/analytics.route');
const achievementRoutes = require("./routes/achievementRoutes");
const errorHandler = require('./middleware/errorHandler');

app.use('/api/auth', authRoutes);
app.use('/api/essays', essayRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use("/api/achievements", achievementRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling
// app.use((err, req, res, next) => {
//   console.error('Error:', err);
//   res.status(err.status || 500).json({
//     error: err.message || 'Internal server error',
//     ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
//   });
// });
// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5003;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;


// const express = require('express');
// const app = express();

// // Absolute minimum server
// app.get('/health', (req, res) => {
//   console.log('Health check!');
//   res.json({ status: 'ok', time: new Date().toISOString() });
// });

// app.get('/api/auth/health', (req, res) => {
//   console.log('Auth health check!');
//   res.json({ status: 'ok', service: 'auth' });
// });

// const PORT = 5003;
// app.listen(PORT, () => {
//   console.log(`🚀 Simple server running on ${PORT}`);
// });

