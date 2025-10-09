const mongoose = require('mongoose');
const bcrypt = require("bcryptjs");

const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    select: false  // Don't include password in queries by default
  },
  
  // Current proficiency level
  currentLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  
  // Level stability tracking
  levelHistory: [{
    level: String,
    changedAt: Date,
    reason: String,
    triggeredBy: String // 'promotion', 'warning', 'demotion', 'manual'
  }],
  
  // Performance metrics (rolling window)
  performanceMetrics: {
    // Recent essay scores (last 10 essays)
    recentScores: [{
      score: Number,
      normalizedScore: Number,
      maxScore: Number,
      submittedAt: Date,
      essayId: mongoose.Schema.Types.ObjectId
    }],
    
    // Rolling averages
    avgScore: {
      type: Number,
      default: 0
    },
    trendingScore: {  // Weighted recent average
      type: Number,
      default: 0
    },
    
    // Quality indicators
    avgGrammarScore: { type: Number, default: 0 },
    avgContentScore: { type: Number, default: 0 },
    avgOrganizationScore: { type: Number, default: 0 },
    avgStyleScore: { type: Number, default: 0 },
    avgMechanicsScore: { type: Number, default: 0 },
    
    // Improvement tracking
    improvementRate: {
      type: Number,
      default: 0  // Positive = improving, Negative = declining
    }
  },
  
  // Issue tracking for intelligent demotion
  persistentIssues: [{
    issueType: {
      type: String,
      enum: [
        'grammar_errors',
        'spelling_errors', 
        'poor_organization',
        'weak_arguments',
        'lack_of_evidence',
        'coherence_issues',
        'vocabulary_limitations'
      ]
    },
    occurrences: [{
      essayId: mongoose.Schema.Types.ObjectId,
      severity: Number,  // 0-1
      detectedAt: Date
    }],
    consecutiveCount: {  // Count of consecutive essays with this issue
      type: Number,
      default: 0
    },
    lastOccurrence: Date,
    resolved: {
      type: Boolean,
      default: false
    }
  }],
  
  // Warning system (before demotion)
  warnings: [{
    type: {
      type: String,
      enum: ['declining_performance', 'persistent_errors', 'lack_of_improvement']
    },
    message: String,
    issuedAt: Date,
    acknowledged: {
      type: Boolean,
      default: false
    },
    relatedEssays: [mongoose.Schema.Types.ObjectId]
  }],
  
  // Strengths and weaknesses
  profile: {
    strengths: [String],  // e.g., ['vocabulary', 'organization']
    weaknesses: [String], // e.g., ['grammar', 'coherence']
    lastUpdated: Date
  },
  
  // Statistics
  stats: {
    totalEssays: { type: Number, default: 0 },
    totalWords: { type: Number, default: 0 },
    avgEssayLength: { type: Number, default: 0 },
    favoriteTopics: [String],
    joinedAt: { type: Date, default: Date.now },
    lastSubmission: Date
  }
}, {
  timestamps: true
});

// ===== METHODS =====

// Calculate trending score (weighted recent average)
studentSchema.methods.calculateTrendingScore = function() {
  const recentScores = this.performanceMetrics.recentScores.slice(-5);
  if (recentScores.length === 0) return 0;
  
  const weights = [0.1, 0.15, 0.2, 0.25, 0.3]; // More weight to recent
  let weightedSum = 0;
  let totalWeight = 0;
  
  recentScores.forEach((score, idx) => {
    const weight = weights[idx] || 0.1;
    weightedSum += score.normalizedScore * weight;
    totalWeight += weight;
  });
  
  return weightedSum / totalWeight;
};

// Check if student should be warned or demoted
studentSchema.methods.assessLevelStability = function() {
  const recentScores = this.performanceMetrics.recentScores.slice(-4);
  
  if (recentScores.length < 3) {
    return { action: 'none', reason: 'insufficient_data' };
  }
  
  const avgRecent = recentScores.reduce((sum, s) => sum + s.normalizedScore, 0) / recentScores.length;
  const overallAvg = this.performanceMetrics.avgScore;
  
  // Check for persistent issues
  const criticalIssues = this.persistentIssues.filter(
    issue => issue.consecutiveCount >= 3 && !issue.resolved
  );
  
  // Demotion criteria
  if (criticalIssues.length >= 2) {
    return {
      action: 'demote',
      reason: 'persistent_issues',
      issues: criticalIssues.map(i => i.issueType)
    };
  }
  
  // Significant performance drop across multiple essays
  if (recentScores.length >= 4) {
    const allBelowAverage = recentScores.every(s => s.normalizedScore < overallAvg * 0.7);
    if (allBelowAverage && this.currentLevel !== 'beginner') {
      return {
        action: 'demote',
        reason: 'sustained_poor_performance',
        avgRecent,
        overallAvg
      };
    }
  }
  
  // Warning criteria
  if (criticalIssues.length >= 1) {
    return {
      action: 'warn',
      reason: 'developing_issues',
      issues: criticalIssues.map(i => i.issueType)
    };
  }
  
  // Promotion criteria
  const consistentlyGood = recentScores.length >= 4 && 
    recentScores.every(s => s.normalizedScore >= overallAvg * 1.2);
  
  if (consistentlyGood && this.currentLevel !== 'advanced') {
    return {
      action: 'promote',
      reason: 'consistent_improvement'
    };
  }
  
  return { action: 'none', reason: 'stable' };
};

// Update persistent issues after essay grading
studentSchema.methods.updateIssues = function(detectedIssues, essayId) {
  detectedIssues.forEach(newIssue => {
    const existing = this.persistentIssues.find(i => i.issueType === newIssue.type);
    
    if (existing) {
      existing.occurrences.push({
        essayId,
        severity: newIssue.severity,
        detectedAt: new Date()
      });
      existing.consecutiveCount += 1;
      existing.lastOccurrence = new Date();
      existing.resolved = false;
    } else {
      this.persistentIssues.push({
        issueType: newIssue.type,
        occurrences: [{
          essayId,
          severity: newIssue.severity,
          detectedAt: new Date()
        }],
        consecutiveCount: 1,
        lastOccurrence: new Date(),
        resolved: false
      });
    }
  });
  
  // Reset consecutive count for issues not detected
  const detectedTypes = detectedIssues.map(i => i.type);
  this.persistentIssues.forEach(issue => {
    if (!detectedTypes.includes(issue.issueType)) {
      issue.consecutiveCount = 0;
      if (issue.occurrences.length >= 3 && issue.consecutiveCount === 0) {
        issue.resolved = true;
      }
    }
  });
};

// Hash password before saving
studentSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
studentSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
studentSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('Student', studentSchema);