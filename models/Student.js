const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const studentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },

    // Current proficiency level
    currentLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },

    // Level stability tracking
    levelHistory: [
      {
        level: String,
        changedAt: Date,
        reason: String,
        triggeredBy: String, // 'promotion', 'warning', 'demotion', 'manual'
      },
    ],

    // Performance metrics (rolling window)
    performanceMetrics: {
      // Recent essay scores (last 10 essays)
      recentScores: [
        {
          score: Number,
          normalizedScore: Number,
          maxScore: Number,
          submittedAt: Date,
          essayId: mongoose.Schema.Types.ObjectId,
        },
      ],

      // Rolling averages
      avgScore: {
        type: Number,
        default: 0,
      },
      trendingScore: {
        // Weighted recent average
        type: Number,
        default: 0,
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
        default: 0, // Positive = improving, Negative = declining
      },
    },

    // Issue tracking for intelligent demotion
    persistentIssues: [
      {
        issueType: {
          type: String,
          enum: [
            "grammar_errors",
            "spelling_errors",
            "poor_organization",
            "weak_arguments",
            "lack_of_evidence",
            "coherence_issues",
            "vocabulary_limitations",
          ],
        },
        occurrences: [
          {
            essayId: mongoose.Schema.Types.ObjectId,
            severity: Number, // 0-1
            detectedAt: Date,
          },
        ],
        consecutiveCount: {
          // Count of consecutive essays with this issue
          type: Number,
          default: 0,
        },
        lastOccurrence: Date,
        resolved: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Warning system (before demotion)
    warnings: [
      {
        type: {
          type: String,
          enum: [
            "declining_performance",
            "persistent_errors",
            "lack_of_improvement",
          ],
        },
        message: String,
        issuedAt: Date,
        acknowledged: {
          type: Boolean,
          default: false,
        },
        relatedEssays: [mongoose.Schema.Types.ObjectId],
      },
    ],

    // Strengths and weaknesses
    profile: {
      strengths: [String], // e.g., ['vocabulary', 'organization']
      weaknesses: [String], // e.g., ['grammar', 'coherence']
      lastUpdated: Date,
    },

    // Statistics
    stats: {
      totalEssays: { type: Number, default: 0 },
      totalWords: { type: Number, default: 0 },
      avgEssayLength: { type: Number, default: 0 },
      favoriteTopics: [String],
      joinedAt: { type: Date, default: Date.now },
      lastSubmission: Date,
    },

    // Achievement tracking
    // Add this to your Student schema in the achievements.unlockedBadges section:

    achievements: {
      unlockedBadges: [
        {
          badgeId: {
            type: String,
            required: true,
          },
          unlockedAt: {
            type: Date,
            default: Date.now,
          },
          notificationSeen: {
            type: Boolean,
            default: false,
          },
          triggeredByEssay: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Essay",
          },
          // ADD THIS MISSING FIELD:
          pointsAwarded: {
            type: Number,
            default: 0,
          },
        },
      ],
      totalPoints: {
        type: Number,
        default: 0,
      },
      progressTracking: {
        consecutiveDaysActive: {
          type: Number,
          default: 0,
        },
        lastActiveDate: Date,
        consecutiveImprovements: {
          type: Number,
          default: 0,
        },
        feedbackTabsViewed: {
          type: [String],
          default: [],
        },
        learningResourcesAccessed: {
          type: Number,
          default: 0,
        },
        revisionsSubmitted: {
          type: Number,
          default: 0,
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

// ===== METHODS =====

// methods for achievements
studentSchema.methods.hasAchievement = function (badgeId) {
  return this.achievements.unlockedBadges.some(
    (badge) => badge.badgeId === badgeId
  );
};

studentSchema.methods.addAchievement = function (badgeId, points = 0) {
  if (!this.hasAchievement(badgeId)) {
    this.achievements.unlockedBadges.push({
      badgeId: badgeId,
      unlockedAt: new Date(),
      notificationSeen: false,
    });
    this.achievements.totalPoints += points;
    return true;
  }
  return false;
};

studentSchema.methods.getUnseenAchievements = function () {
  return this.achievements.unlockedBadges.filter(
    (badge) => !badge.notificationSeen
  );
};

studentSchema.methods.markAchievementsSeen = function (badgeIds) {
  badgeIds.forEach((badgeId) => {
    const badge = this.achievements.unlockedBadges.find(
      (b) => b.badgeId === badgeId
    );
    if (badge) {
      badge.notificationSeen = true;
    }
  });
};

// Calculate trending score (weighted recent average)
studentSchema.methods.calculateTrendingScore = function () {
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

/**
 * ✅ ENHANCED: Better level progression with "Beginner+" detection
 */
studentSchema.methods.checkLevelProgression = function () {
  const recentScores = this.performanceMetrics.recentScores.slice(-5);

  if (recentScores.length < 3) {
    return {
      shouldProgress: false,
      reason: "insufficient_data",
      message:
        "Keep writing! We need at least 3 essays to track your progress.",
    };
  }

  const scores = recentScores.map((s) => s.score);
  const avgRecent = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const last3Scores = scores.slice(-3);
  const allAbove = last3Scores.every(
    (s) => s >= this.getProgressionThreshold()
  );
  const highConfidence = recentScores.every((s) => s.confidence > 0.85);

  // ✅ LEVEL UP: Consistent high performance
  if (allAbove && highConfidence && last3Scores.length >= 3) {
    return {
      shouldProgress: true,
      reason: "consistent_excellence",
      newLevel: this.getNextLevel(),
      message: `🎉 Congratulations! Your consistent scores of ${last3Scores.join(
        ", "
      )} show you're ready for ${this.getNextLevel()} level!`,
      action: "promote",
    };
  }

  // ✅ NEW: Detect "Beginner+" category
  if (this.currentLevel === "beginner") {
    if (avgRecent >= 60 && avgRecent < 70) {
      return {
        shouldProgress: false,
        reason: "approaching_intermediate",
        category: "beginner+",
        message:
          "You're doing great! You're at Beginner+ level. Keep this up to reach Intermediate! 🚀",
        progress: Math.round(((avgRecent - 60) / 10) * 100),
      };
    }
  }

  // ✅ STABLE: Maintaining performance
  if (Math.abs(scores[0] - scores[scores.length - 1]) < 5) {
    return {
      shouldProgress: false,
      reason: "stable",
      message:
        "You're maintaining consistent performance. Keep focusing on improvement!",
      action: "none",
    };
  }

  // ✅ IMPROVING: Upward trend
  const improvementRate = scores[0] - scores[scores.length - 1];
  if (improvementRate > 5) {
    return {
      shouldProgress: false,
      reason: "improving",
      message: `Great progress! Your scores are improving by ${Math.round(
        improvementRate
      )} points! Keep it up! 📈`,
      action: "none",
    };
  }

  // ⚠️ DECLINING: Needs attention
  if (improvementRate < -10) {
    return {
      shouldProgress: false,
      reason: "declining",
      message:
        "Your recent scores have dropped. Review the feedback carefully and focus on the areas that need improvement.",
      action: "warn",
    };
  }

  return {
    shouldProgress: false,
    reason: "building",
    message: "You're building your skills. Every essay helps you improve!",
    action: "none",
  };
};

/**
 * Get progression threshold based on current level
 */
studentSchema.methods.getProgressionThreshold = function () {
  const thresholds = {
    beginner: 70,
    intermediate: 80,
    advanced: 90,
  };
  return thresholds[this.currentLevel] || 70;
};

/**
 * Get next level
 */
studentSchema.methods.getNextLevel = function () {
  const progression = {
    beginner: "intermediate",
    intermediate: "advanced",
    advanced: "expert",
  };
  return progression[this.currentLevel] || this.currentLevel;
};

/**
 * promotion/demotion logic
 */
studentSchema.methods.assessLevelStability = function () {
  const recentScores = this.performanceMetrics.recentScores.slice(-4);

  if (recentScores.length < 3) {
    return { action: "none", reason: "insufficient_data" };
  }

  const avgRecent =
    recentScores.reduce((sum, s) => sum + s.score, 0) / recentScores.length;
  const overallAvg = this.performanceMetrics.avgScore;

  // ✅ NEW: Check for promotion potential
  const lastThreeScores = recentScores.slice(-3).map((s) => s.score);
  const allAbove70 = lastThreeScores.every((s) => s >= 70);
  const allAbove75 = lastThreeScores.every((s) => s >= 75);
  const avgAbove80 = avgRecent >= 80;

  // Check for persistent issues
  const criticalIssues = this.persistentIssues.filter(
    (issue) => issue.consecutiveCount >= 3 && !issue.resolved
  );

  // ✅ IMPROVED: Promotion criteria (more generous)
  if (this.currentLevel === "beginner") {
    // Promote from beginner if consistently scoring 70+
    if (recentScores.length >= 3 && allAbove70) {
      return {
        action: "promote",
        reason: "consistent_good_performance",
        message: `🎉 Congratulations! Your consistent scores of ${lastThreeScores.join(
          ", "
        )} show you're ready for intermediate level!`,
        avgRecent,
      };
    }
  } else if (this.currentLevel === "intermediate") {
    // Promote to advanced if consistently scoring 80+
    if (allAbove75 && avgAbove80) {
      return {
        action: "promote",
        reason: "excellent_performance",
        message: `🎉 Outstanding! You're ready for advanced level with an average of ${Math.round(
          avgRecent
        )}!`,
        avgRecent,
      };
    }
  }

  // Demotion criteria (more lenient)
  if (criticalIssues.length >= 3) {
    return {
      action: "demote",
      reason: "persistent_issues",
      message: `We've adjusted your level to focus on strengthening ${criticalIssues
        .map((i) => i.issueType.replace(/_/g, " "))
        .join(" and ")}. This is temporary!`,
      issues: criticalIssues.map((i) => i.issueType),
    };
  }

  // Significant performance drop
  if (recentScores.length >= 4) {
    const allBelowAverage = recentScores.every(
      (s) => s.score < overallAvg * 0.6
    );
    if (allBelowAverage && this.currentLevel !== "beginner") {
      return {
        action: "demote",
        reason: "sustained_poor_performance",
        message: `We've adjusted your level to help you rebuild strong foundations. You can do this!`,
        avgRecent,
        overallAvg,
      };
    }
  }

  // Warning criteria
  if (criticalIssues.length >= 2) {
    return {
      action: "warn",
      reason: "developing_issues",
      message: `Focus on improving ${criticalIssues
        .map((i) => i.issueType.replace(/_/g, " "))
        .join(" and ")}. Review the feedback carefully!`,
      issues: criticalIssues.map((i) => i.issueType),
    };
  }

  return { action: "none", reason: "stable" };
};

// Update persistent issues after essay grading
studentSchema.methods.updateIssues = function (detectedIssues, essayId) {
  detectedIssues.forEach((newIssue) => {
    const existing = this.persistentIssues.find(
      (i) => i.issueType === newIssue.type
    );

    if (existing) {
      existing.occurrences.push({
        essayId,
        severity: newIssue.severity,
        detectedAt: new Date(),
      });
      existing.consecutiveCount += 1;
      existing.lastOccurrence = new Date();
      existing.resolved = false;
    } else {
      this.persistentIssues.push({
        issueType: newIssue.type,
        occurrences: [
          {
            essayId,
            severity: newIssue.severity,
            detectedAt: new Date(),
          },
        ],
        consecutiveCount: 1,
        lastOccurrence: new Date(),
        resolved: false,
      });
    }
  });

  // Reset consecutive count for issues not detected
  const detectedTypes = detectedIssues.map((i) => i.type);
  this.persistentIssues.forEach((issue) => {
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
studentSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
studentSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model("Student", studentSchema);
