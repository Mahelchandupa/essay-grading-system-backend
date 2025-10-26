const Achievement = require("../models/Achievement");
const Student = require("../models/Student");
const Essay = require("../models/Essay");

/**
 * Achievement Service - Manages badge unlocking and progress tracking
 * FIXED VERSION with proper initialization
 */
class AchievementService {
  constructor() {
    this.badgeDefinitions = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  /**
   * Initialize badge definitions in database
   * MUST be called before using the service
   */
  async initialize() {
    // Prevent multiple initializations
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        console.log("🔄 Initializing Achievement Service...");

        const count = await Achievement.countDocuments();
        console.log(`   Found ${count} existing achievements`);

        if (count === 0) {
          console.log("📛 No achievements found, seeding badges...");
          await this.seedBadges();
        }

        this.badgeDefinitions = await Achievement.find({}).lean();
        this.initialized = true;

        console.log(
          `✅ Achievement Service initialized with ${this.badgeDefinitions.length} badges`
        );
      } catch (error) {
        console.error("❌ Failed to initialize Achievement Service:", error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Ensure service is initialized before any operation
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Seed badge definitions from JSON
   */
  async seedBadges() {
    const badges = [
      // Learning & Progression
      {
        badgeId: "ACHV_001",
        category: "Learning & Progression",
        title: "First Steps",
        criteria: "Submit your first essay.",
        description:
          "Recognizes your first submission and marks the start of your writing journey.",
        difficulty: "Beginner",
        icon: "🎓",
        points: 10,
      },
      {
        badgeId: "ACHV_002",
        category: "Learning & Progression",
        title: "Improvement Starter",
        criteria:
          "Improve your essay score by at least 5% compared to your previous submission.",
        description:
          "Shows that you're learning and progressing in your writing skills.",
        difficulty: "Beginner",
        icon: "📈",
        points: 15,
      },
      {
        badgeId: "ACHV_003",
        category: "Learning & Progression",
        title: "Consistent Improver",
        criteria: "Maintain score improvement for 3 consecutive essays.",
        description:
          "Rewards persistence and continuous effort in writing improvement.",
        difficulty: "Intermediate",
        icon: "🔥",
        points: 25,
      },
      {
        badgeId: "ACHV_004",
        category: "Learning & Progression",
        title: "Advanced Writer",
        criteria: "Achieve an essay score of 85% or higher.",
        description: "You've reached an advanced writing proficiency level.",
        difficulty: "Advanced",
        icon: "🏆",
        points: 30,
      },
      {
        badgeId: "ACHV_005",
        category: "Learning & Progression",
        title: "Expert Writer",
        criteria: "Achieve an average score of 90% or higher across 5 essays.",
        description: "Marks mastery of advanced essay writing techniques.",
        difficulty: "Expert",
        icon: "⭐",
        points: 50,
      },

      // Grammar & Language Mastery
      {
        badgeId: "ACHV_006",
        category: "Grammar & Language Mastery",
        title: "Grammar Guardian",
        criteria: "Submit an essay with fewer than 3 grammar errors.",
        description: "Recognizes strong grammar control and sentence accuracy.",
        difficulty: "Intermediate",
        icon: "🧠",
        points: 20,
      },
      {
        badgeId: "ACHV_007",
        category: "Grammar & Language Mastery",
        title: "Syntax Master",
        criteria: "Use diverse sentence structures effectively in your essay.",
        description: "Rewards mastery of sentence complexity and rhythm.",
        difficulty: "Advanced",
        icon: "📚",
        points: 25,
      },
      {
        badgeId: "ACHV_008",
        category: "Grammar & Language Mastery",
        title: "Mechanics Maestro",
        criteria:
          "Submit an essay with zero punctuation or capitalization errors.",
        description: "Shows mastery over the mechanics of writing.",
        difficulty: "Intermediate",
        icon: "✍️",
        points: 20,
      },

      // Creativity & Originality
      {
        badgeId: "ACHV_009",
        category: "Creativity & Originality",
        title: "Original Thinker",
        criteria: "Achieve an originality score of 90% or higher.",
        description: "Demonstrates creative thinking and authentic writing.",
        difficulty: "Intermediate",
        icon: "💡",
        points: 25,
      },
      {
        badgeId: "ACHV_010",
        category: "Creativity & Originality",
        title: "Idea Innovator",
        criteria: "Write an essay with a unique or unconventional topic.",
        description: "Rewards creative exploration and unique expression.",
        difficulty: "Advanced",
        icon: "✨",
        points: 30,
      },
      {
        badgeId: "ACHV_011",
        category: "Creativity & Originality",
        title: "Authentic Voice",
        criteria:
          "Improve originality by at least 10% compared to your last essay.",
        description: "Recognizes your developing personal writing style.",
        difficulty: "Intermediate",
        icon: "🗣️",
        points: 20,
      },

      // Consistency & Effort
      {
        badgeId: "ACHV_012",
        category: "Consistency & Effort",
        title: "On Fire!",
        criteria: "Submit essays for 5 consecutive days.",
        description: "Rewards dedication and consistent writing practice.",
        difficulty: "Intermediate",
        icon: "🔥",
        points: 25,
      },
      {
        badgeId: "ACHV_013",
        category: "Consistency & Effort",
        title: "Reliable Performer",
        criteria: "Maintain an average score of 70% or higher across 4 essays.",
        description: "Shows consistent and dependable writing performance.",
        difficulty: "Intermediate",
        icon: "📊",
        points: 20,
      },
      {
        badgeId: "ACHV_014",
        category: "Consistency & Effort",
        title: "Perfection Seeker",
        criteria:
          "Revise and resubmit an essay based on feedback within 24 hours.",
        description:
          "Encourages using feedback effectively for continuous improvement.",
        difficulty: "Beginner",
        icon: "🔁",
        points: 15,
      },

      // Feedback & Engagement
      {
        badgeId: "ACHV_015",
        category: "Feedback & Engagement",
        title: "Feedback Explorer",
        criteria:
          "View all feedback tabs (Grammar, Spelling, Style, Examples, etc.) in one session.",
        description:
          "Encourages full engagement with the system's feedback tools.",
        difficulty: "Beginner",
        icon: "🧭",
        points: 10,
      },
      {
        badgeId: "ACHV_016",
        category: "Feedback & Engagement",
        title: "Learning Enthusiast",
        criteria:
          "Access 10 or more writing tips or external learning resources.",
        description:
          "Shows enthusiasm for self-directed learning and improvement.",
        difficulty: "Intermediate",
        icon: "📖",
        points: 15,
      },
      {
        badgeId: "ACHV_017",
        category: "Feedback & Engagement",
        title: "Revision Hero",
        criteria:
          "Demonstrate measurable improvement after applying system feedback.",
        description:
          "Recognizes effective application of feedback to real writing progress.",
        difficulty: "Intermediate",
        icon: "💪",
        points: 20,
      },

      // Special & Cumulative
      {
        badgeId: "ACHV_018",
        category: "Special & Cumulative",
        title: "Milestone 10",
        criteria: "Submit 10 essays through the system.",
        description: "Recognizes long-term commitment to writing practice.",
        difficulty: "Intermediate",
        icon: "🎯",
        points: 30,
      },
      {
        badgeId: "ACHV_019",
        category: "Special & Cumulative",
        title: "Dedication Award",
        criteria: "Engage with the system for 30 consecutive days.",
        description: "Honors consistent dedication and long-term effort.",
        difficulty: "Advanced",
        icon: "🕒",
        points: 40,
      },
      {
        badgeId: "ACHV_020",
        category: "Special & Cumulative",
        title: "Master Communicator",
        criteria:
          "Score 85%+ across all five dimensions (Grammar, Content, Organization, Style, Mechanics).",
        description: "Represents overall excellence in written communication.",
        difficulty: "Expert",
        icon: "🏅",
        points: 50,
      },
    ];

    try {
      await Achievement.insertMany(badges);
      console.log(`✅ Seeded ${badges.length} achievement badges`);
    } catch (error) {
      console.error("❌ Error seeding badges:", error);
      throw error;
    }
  }

  /**
   * Check and unlock achievements after essay submission
   * FIXED VERSION with better error handling
   */
  async checkAndUnlockAchievements(student, essay, essayHistory) {
    await this.ensureInitialized();

    const unlocked = [];
    const triggeredByEssay = essay._id;

    try {
      console.log(`🔍 Checking achievements for student ${student.studentId}`);
      console.log(`   Essay history length: ${essayHistory.length}`);
      console.log(`   Current score: ${essay.grading.finalScore}`);

      // Update activity tracking
      await this.updateActivityTracking(student);

      // First Essay Achievement
      if (essayHistory.length === 1 && !student.hasAchievement("ACHV_001")) {
        console.log("🎉 First essay detected, checking ACHV_001...");
        const success = await this.unlockAchievement(
          student,
          "ACHV_001",
          10,
          triggeredByEssay
        );
        if (success) {
          unlocked.push("ACHV_001");
          console.log("   ✅ Unlocked First Steps achievement");
        } else {
          console.log("   ❌ Failed to unlock ACHV_001");
        }
      }

      // Advanced Writer Achievement (85%+)
      if (
        essay.grading.finalScore >= 85 &&
        !student.hasAchievement("ACHV_004")
      ) {
        console.log("🎉 High score detected, checking ACHV_004...");
        const success = await this.unlockAchievement(
          student,
          "ACHV_004",
          30,
          triggeredByEssay
        );
        if (success) {
          unlocked.push("ACHV_004");
          console.log("   ✅ Unlocked Advanced Writer achievement");
        }
      }

      // Grammar Guardian (<3 grammar errors)
      const grammarErrors = essay.grading.validatedErrors?.grammar || 0;
      if (grammarErrors < 3 && !student.hasAchievement("ACHV_006")) {
        console.log("🎉 Few grammar errors detected, checking ACHV_006...");
        const success = await this.unlockAchievement(
          student,
          "ACHV_006",
          20,
          triggeredByEssay
        );
        if (success) {
          unlocked.push("ACHV_006");
          console.log("   ✅ Unlocked Grammar Guardian achievement");
        }
      }

      // Consistent Writer Achievement (70%+ across 4 essays)
      if (essayHistory.length >= 4) {
        const recentFour = essayHistory.slice(0, 4);
        const avgScore =
          recentFour.reduce((sum, e) => sum + e.grading.finalScore, 0) / 4;

        if (avgScore >= 70 && !student.hasAchievement("ACHV_013")) {
          console.log(
            "🎉 Consistent performance detected, checking ACHV_013..."
          );
          const success = await this.unlockAchievement(
            student,
            "ACHV_013",
            20,
            triggeredByEssay
          );
          if (success) {
            unlocked.push("ACHV_013");
            console.log("   ✅ Unlocked Reliable Performer achievement");
          }
        }
      }

      // Structure Master (essays with good structure)
      if (essay.essayStructure && essay.essayStructure.sections.length >= 2) {
        if (!student.hasAchievement("ACHV_007")) {
          console.log("🎉 Good structure detected, checking ACHV_007...");
          const success = await this.unlockAchievement(
            student,
            "ACHV_007",
            25,
            triggeredByEssay
          );
          if (success) {
            unlocked.push("ACHV_007");
            console.log("   ✅ Unlocked Syntax Master achievement");
          }
        }
      }

      // Milestone 10
      if (essayHistory.length >= 10 && !student.hasAchievement("ACHV_018")) {
        console.log("🎉 10 essays milestone reached, checking ACHV_018...");
        const success = await this.unlockAchievement(
          student,
          "ACHV_018",
          30,
          triggeredByEssay
        );
        if (success) {
          unlocked.push("ACHV_018");
          console.log("   ✅ Unlocked Milestone 10 achievement");
        }
      }

      console.log(
        `✅ Achievement check complete: ${unlocked.length} new achievements`
      );

      return {
        unlocked: unlocked,
        newAchievements: unlocked.map((id) => this.getBadgeInfo(id)),
        totalPoints: student.achievements.totalPoints,
        triggeredByEssay: triggeredByEssay,
      };
    } catch (error) {
      console.error("❌ Error checking achievements:", error);
      return {
        unlocked: [],
        newAchievements: [],
        totalPoints: student.achievements.totalPoints,
        triggeredByEssay: triggeredByEssay,
        error: error.message,
      };
    }
  }

  /**
   * Unlock achievement with essay reference
   * FIXED VERSION with better error handling and logging
   */
  async unlockAchievement(student, badgeId, points, triggeredByEssay) {
    try {
      console.log(`   🔓 Attempting to unlock ${badgeId}...`);

      // Check if already has achievement
      if (student.hasAchievement(badgeId)) {
        console.log(`   ℹ️ Student already has ${badgeId}`);
        return false;
      }

      // Find the achievement definition
      const achievement = await Achievement.findOne({ badgeId });

      if (!achievement) {
        console.error(`   ❌ Achievement ${badgeId} not found in database!`);
        console.error(
          `   💡 Available achievements:`,
          this.badgeDefinitions?.map((b) => b.badgeId)
        );
        return false;
      }

      console.log(`   ✓ Found achievement: ${achievement.title}`);

      // Add to student's unlocked badges
      student.achievements.unlockedBadges.push({
        badgeId: badgeId,
        unlockedAt: new Date(),
        notificationSeen: false,
        triggeredByEssay: triggeredByEssay,
        pointsAwarded: points,
      });

      // Update total points
      student.achievements.totalPoints += points;

      // Save the student
      await student.save();

      console.log(`   🎉 Achievement unlocked: ${badgeId} (+${points} points)`);
      console.log(`   📊 Total points: ${student.achievements.totalPoints}`);

      return true;
    } catch (error) {
      console.error(`   ❌ Error unlocking achievement ${badgeId}:`, error);
      return false;
    }
  }

  /**
   * Update activity tracking for consecutive days
   */
  async updateActivityTracking(student) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastActive = student.achievements.progressTracking.lastActiveDate;

    if (!lastActive) {
      student.achievements.progressTracking.consecutiveDaysActive = 1;
      student.achievements.progressTracking.lastActiveDate = today;
    } else {
      const lastActiveDate = new Date(lastActive);
      lastActiveDate.setHours(0, 0, 0, 0);

      const daysDiff = Math.floor(
        (today - lastActiveDate) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff === 1) {
        student.achievements.progressTracking.consecutiveDaysActive += 1;
        student.achievements.progressTracking.lastActiveDate = today;
      } else if (daysDiff === 0) {
        // Same day, no change
      } else {
        student.achievements.progressTracking.consecutiveDaysActive = 1;
        student.achievements.progressTracking.lastActiveDate = today;
      }
    }
  }

  /**
   * Get badge information by ID
   */
  getBadgeInfo(badgeId) {
    const badge = this.badgeDefinitions?.find((b) => b.badgeId === badgeId);
    return badge || null;
  }

  /**
   * Get all achievements for a student
   */
  async getStudentAchievements(studentId) {
    await this.ensureInitialized();

    try {
      const student = await Student.findById(studentId);
      console.log("stundent found", student);
      if (!student) return null;

      const unlockedBadges = await Promise.all(
        student.achievements.unlockedBadges.map(async (badge) => {
          const badgeInfo = await Achievement.findOne({
            badgeId: badge.badgeId,
          }).lean();
          return {
            ...badgeInfo,
            unlockedAt: badge.unlockedAt,
            notificationSeen: badge.notificationSeen,
            pointsAwarded: badge.pointsAwarded,
            triggeredByEssay: badge.triggeredByEssay,
          };
        })
      );

      const allBadges = await Achievement.find({}).lean();
      const lockedBadges = allBadges.filter(
        (badge) => !student.hasAchievement(badge.badgeId)
      );

      return {
        totalPoints: student.achievements.totalPoints,
        totalUnlocked: unlockedBadges.length,
        totalBadges: allBadges.length,
        unlockedBadges,
        lockedBadges,
        progressTracking: student.achievements.progressTracking,
      };
    } catch (error) {
      console.error("Error fetching achievements:", error);
      return null;
    }
  }

  /**
   * Track feedback tab views (for ACHV_015)
   */
  async trackFeedbackTabView(studentId, tabName) {
    try {
      const student = await Student.findOne({ studentId });
      if (!student) return;

      if (
        !student.achievements.progressTracking.feedbackTabsViewed.includes(
          tabName
        )
      ) {
        student.achievements.progressTracking.feedbackTabsViewed.push(tabName);

        const requiredTabs = [
          "grammar",
          "spelling",
          "style",
          "examples",
          "organization",
        ];
        const viewedAll = requiredTabs.every((tab) =>
          student.achievements.progressTracking.feedbackTabsViewed.includes(tab)
        );

        if (viewedAll && !student.hasAchievement("ACHV_015")) {
          await this.unlockAchievement(student, "ACHV_015", 10, null);
        }

        await student.save();
      }
    } catch (error) {
      console.error("Error tracking feedback tab:", error);
    }
  }

  /**
   * Get achievements specifically unlocked for a particular essay
   */
  async getEssayAchievements(essayId, studentId) {
    await this.ensureInitialized();

    try {
      const student = await Student.findById(studentId);
      if (!student) return [];

      // Find achievements triggered by this specific essay
      const essayAchievements = student.achievements.unlockedBadges
        .filter(
          (badge) =>
            badge.triggeredByEssay &&
            badge.triggeredByEssay.toString() === essayId.toString()
        )
        .map((badge) => {
          const badgeInfo = this.getBadgeInfo(badge.badgeId);
          return badgeInfo
            ? {
                ...badgeInfo,
                unlockedAt: badge.unlockedAt,
                notificationSeen: badge.notificationSeen,
                pointsAwarded: badge.pointsAwarded,
                triggeredByEssay: badge.triggeredByEssay,
              }
            : null;
        })
        .filter(Boolean);

      return essayAchievements;
    } catch (error) {
      console.error("Error fetching essay achievements:", error);
      return [];
    }
  }

  /**
   * Track learning resource access (for ACHV_016)
   */
  async trackResourceAccess(studentId) {
    try {
      const student = await Student.findOne({ studentId });
      if (!student) return;

      student.achievements.progressTracking.learningResourcesAccessed += 1;

      if (
        student.achievements.progressTracking.learningResourcesAccessed >= 10 &&
        !student.hasAchievement("ACHV_016")
      ) {
        await this.unlockAchievement(student, "ACHV_016", 15, null);
      }

      await student.save();
    } catch (error) {
      console.error("Error tracking resource access:", error);
    }
  }
}

// Export singleton instance
module.exports = new AchievementService();
