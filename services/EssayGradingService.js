const Student = require("../models/Student");
const Essay = require("../models/Essay");
const FeatureExtractor = require("./FeatureExtractor");
const FeedbackGenerator = require("./FeedbackGenerator");
const axios = require("axios");

class EssayGradingService {
  constructor() {
    this.model = null;
    this.scalerParams = null;
    this.featureExtractor = new FeatureExtractor();
    this.feedbackGenerator = new FeedbackGenerator();
    this.inferenceServiceURL =
      process.env.INFERENCE_SERVICE_URL || "http://localhost:5001";
  }

  async initialize() {
    // Load scaler params
    const modelPath = "../../python_inference_service/models/production_model/";
    this.scalerParams = require(`${modelPath}scaler_params.json`);

    // Wait for feedback generator to initialize (spell checker)
    await this.feedbackGenerator.initializeDictionary();

    // Test connection to Python inference service
    try {
      const response = await axios.get(`${this.inferenceServiceURL}/health`, {
        timeout: 5000,
      });
      console.log("✅ Python inference service connected:", response.data);
    } catch (error) {
      console.error("❌ Warning: Python inference service not available");
      console.error("   Make sure it is running on", this.inferenceServiceURL);
    }
  }

  /**
   * Main grading function
   */
  async gradeEssay(essayData) {
    const { studentId, text, fileType, ocrConfidence } = essayData;

    try {
      // 1. Get student profile
      const student = await Student.findOne({ studentId });
      if (!student) {
        throw new Error("Student not found");
      }

      // 2. Extract features
      const features = this.featureExtractor.extractFeatures(text);
      const normalizedFeatures = this.normalizeFeatures(features);

      // 3. Run model inference
      const inferenceResult = await this.runInference(normalizedFeatures);
      const { score, normalizedScore, confidence, qualityScores } =
        inferenceResult;

      console.log("🔍 Quality Scores from Model:", qualityScores);

      // 3.5 Calculate proper final score and grade
      const finalScore = this.calculateFinalScore(qualityScores, score);
      const grade = this.calculateGrade(finalScore);
      const gradeDescription = this.getGradeDescription(grade);

      console.log(
        `📊 Calculated Score: ${finalScore.toFixed(1)}/100 (${grade})`
      );

      // 4. Generate level-adapted feedback
      const feedback = await this.feedbackGenerator.generate({
        text,
        studentLevel: student.currentLevel,
        studentProfile: student.profile,
        persistentIssues: student.persistentIssues,
        score,
        qualityScores,
        recentPerformance: student.performanceMetrics.recentScores,
      });

      // 5. Detect issues for tracking
      const detectedIssues = this.detectIssues(feedback, qualityScores);

      const essayDocument = {
        studentId: student._id,
        originalText: text,
        processedText: text,
        fileType,
        ocrConfidence,
        grading: {
          rawScore: score,
          normalizedScore: normalizedScore,
          finalScore: finalScore, // Use calculated score
          grade: grade, // Add letter grade
          gradeDescription: gradeDescription, // Add grade description
          confidence,
          qualityScores,
        },
        feedback: feedback,
        detectedIssues: detectedIssues,
        gradedAt: new Date(),
        status: "graded",
      };

      console.log("📝 Saving essay to database...");
      const essay = await Essay.create(essayDocument);
      console.log("✅ Essay saved successfully!");

      // 7. Update student profile intelligently
      await this.updateStudentProfile(student, essay, detectedIssues);

      // 8. Check for level changes
      const levelAssessment = await this.assessAndUpdateLevel(student);

      return {
        essay,
        feedback,
        studentLevel: student.currentLevel,
        levelUpdate: levelAssessment,
        qualityBreakdown: qualityScores,
      };
    } catch (error) {
      console.error("Grading error:", error);
      throw error;
    }
  }

  /**
   * Intelligent student profile update
   */
  async updateStudentProfile(student, essay, detectedIssues) {
    const { grading } = essay;

    // Add to recent scores (keep last 10)
    student.performanceMetrics.recentScores.push({
      score: grading.finalScore,
      normalizedScore: grading.normalizedScore,
      maxScore: grading.maxScore || 12,
      submittedAt: essay.submittedAt,
      essayId: essay._id,
    });

    if (student.performanceMetrics.recentScores.length > 10) {
      student.performanceMetrics.recentScores.shift();
    }

    // Update rolling averages
    const recentScores = student.performanceMetrics.recentScores;
    student.performanceMetrics.avgScore =
      recentScores.reduce((sum, s) => sum + s.normalizedScore, 0) /
      recentScores.length;

    student.performanceMetrics.trendingScore = student.calculateTrendingScore();

    // Update quality indicators
    const qualityScores = grading.qualityScores;
    const updateQuality = (field, value) => {
      const current = student.performanceMetrics[field] || 0;
      const count = student.stats.totalEssays;
      student.performanceMetrics[field] =
        (current * count + value) / (count + 1);
    };

    updateQuality("avgGrammarScore", qualityScores.grammar);
    updateQuality("avgContentScore", qualityScores.content);
    updateQuality("avgOrganizationScore", qualityScores.organization);
    updateQuality("avgStyleScore", qualityScores.style);
    updateQuality("avgMechanicsScore", qualityScores.mechanics);

    // Calculate improvement rate (last 5 vs previous 5)
    if (recentScores.length >= 10) {
      const recent5 = recentScores.slice(-5);
      const previous5 = recentScores.slice(-10, -5);
      const recentAvg =
        recent5.reduce((sum, s) => sum + s.normalizedScore, 0) / 5;
      const previousAvg =
        previous5.reduce((sum, s) => sum + s.normalizedScore, 0) / 5;
      student.performanceMetrics.improvementRate = recentAvg - previousAvg;
    }

    // Update persistent issues
    student.updateIssues(detectedIssues, essay._id);

    // Update stats
    student.stats.totalEssays += 1;
    student.stats.lastSubmission = new Date();

    await student.save();
  }

  /**
   * Assess and update student level with intelligent logic
   */
  async assessAndUpdateLevel(student) {
    const assessment = student.assessLevelStability();

    let response = {
      action: assessment.action,
      reason: assessment.reason,
      message: "",
      previousLevel: student.currentLevel,
      newLevel: student.currentLevel,
    };

    switch (assessment.action) {
      case "demote":
        response = await this.handleDemotion(student, assessment);
        break;

      case "warn":
        response = await this.handleWarning(student, assessment);
        break;

      case "promote":
        response = await this.handlePromotion(student, assessment);
        break;

      default:
        response.message = this.getStableMessage(student);
    }

    return response;
  }

  /**
   * Handle student demotion
   */
  async handleDemotion(student, assessment) {
    const levels = ["beginner", "intermediate", "advanced"];
    const currentIndex = levels.indexOf(student.currentLevel);

    if (currentIndex === 0) {
      return {
        action: "none",
        message:
          "You're working on building strong foundations. Keep practicing!",
        previousLevel: student.currentLevel,
        newLevel: student.currentLevel,
      };
    }

    const newLevel = levels[currentIndex - 1];
    student.currentLevel = newLevel;

    student.levelHistory.push({
      level: newLevel,
      changedAt: new Date(),
      reason: assessment.reason,
      triggeredBy: "demotion",
    });

    student.warnings = [];
    await student.save();

    return {
      action: "demote",
      reason: assessment.reason,
      message: `We've noticed you're facing challenges with ${assessment.issues?.join(
        " and "
      )}. Let's focus on strengthening these areas together!`,
      previousLevel: levels[currentIndex],
      newLevel: newLevel,
      issues: assessment.issues,
    };
  }

  /**
   * Handle warning
   */
  // async handleWarning(student, assessment) {
  //   const recentWarning = student.warnings.find(
  //     (w) =>
  //       w.type === "persistent_errors" &&
  //       Date.now() - w.issuedAt < 7 * 24 * 60 * 60 * 1000
  //   );

  //   if (!recentWarning) {
  //     student.warnings.push({
  //       type: "persistent_errors",
  //       message: `Persistent issues: ${assessment.issues.join(", ")}`,
  //       issuedAt: new Date(),
  //       relatedEssays: student.performanceMetrics.recentScores
  //         .slice(-3)
  //         .map((s) => s.essayId),
  //     });

  //     await student.save();
  //   }

  //   return {
  //     action: "warn",
  //     reason: assessment.reason,
  //     message: `We've noticed recurring challenges with ${assessment.issues?.join(
  //       " and "
  //     )}. Focus on the feedback to improve!`,
  //     previousLevel: student.currentLevel,
  //     newLevel: student.currentLevel,
  //     issues: assessment.issues,
  //   };
  // }

  /**
   * Handle warning
   */
  async handleWarning(student, assessment) {
    const recentWarning = student.warnings.find(
      (w) =>
        w.type === "persistent_errors" &&
        Date.now() - w.issuedAt < 7 * 24 * 60 * 60 * 1000
    );

    if (!recentWarning) {
      student.warnings.push({
        type: "persistent_errors",
        message: `Persistent issues: ${assessment.issues.join(", ")}`,
        issuedAt: new Date(),
        relatedEssays: student.performanceMetrics.recentScores
          .slice(-3)
          .map((s) => s.essayId),
      });

      await student.save();
    }

    return {
      action: "warn",
      reason: assessment.reason,
      message: `We've noticed recurring challenges with ${assessment.issues?.join(
        " and "
      )}. Focus on the feedback to improve!`,
      previousLevel: student.currentLevel,
      newLevel: student.currentLevel,
      issues: assessment.issues,
    };
  }

  /**
   * Handle promotion
   */
  async handlePromotion(student, assessment) {
    const levels = ["beginner", "intermediate", "advanced"];
    const currentIndex = levels.indexOf(student.currentLevel);

    if (currentIndex === levels.length - 1) {
      return {
        action: "none",
        message:
          "Excellent work! You're at advanced level. Keep challenging yourself!",
        previousLevel: student.currentLevel,
        newLevel: student.currentLevel,
      };
    }

    const newLevel = levels[currentIndex + 1];
    student.currentLevel = newLevel;

    student.levelHistory.push({
      level: newLevel,
      changedAt: new Date(),
      reason: assessment.reason,
      triggeredBy: "promotion",
    });

    student.warnings = [];
    await student.save();

    return {
      action: "promote",
      reason: assessment.reason,
      message: `🎉 Congratulations! You've been promoted to ${newLevel} level! Keep up the excellent work!`,
      previousLevel: levels[currentIndex],
      newLevel: newLevel,
    };
  }

  /**
   * Generate motivational messages based on context
   */
  getDemotionMessage(student, assessment) {
    return (
      `We've noticed some consistent challenges in your recent essays. ` +
      `We're adjusting your learning path to focus on strengthening your fundamentals. ` +
      `This is temporary - with focused practice on ${assessment.issues?.join(
        " and "
      )}, ` +
      `you'll be back on track soon!`
    );
  }

  getWarningMessage(student, assessment) {
    return (
      `We've noticed you're facing some persistent challenges with ` +
      `${assessment.issues?.join(" and ")}. Let's work on these together! ` +
      `Focus on the feedback provided, and you'll see improvement in your next essays.`
    );
  }

  getPromotionMessage(student) {
    return (
      `🎉 Congratulations! Your consistent effort and improvement have earned you ` +
      `a promotion to ${student.currentLevel} level! We're increasing the challenge ` +
      `to help you grow even more. Keep up the excellent work!`
    );
  }

  /**
   * Get contextual message
   */
  getStableMessage(student) {
    const trending = student.performanceMetrics.trendingScore || 0;
    const avg = student.performanceMetrics.avgScore || 0;

    if (trending > avg * 1.1) {
      return "Great progress! Your recent work shows improvement. Keep it up!";
    } else if (trending < avg * 0.9 && avg > 0) {
      return "We've noticed a slight dip. Review the feedback and keep practicing!";
    } else {
      return "You're maintaining consistent performance. Keep focusing on improvement!";
    }
  }

  /**
   * Detect issues from feedback for tracking
   */
  detectIssues(feedback, qualityScores) {
    const issues = [];

    // Ensure we have valid qualityScores
    if (!qualityScores || typeof qualityScores !== "object") {
      console.warn("Invalid qualityScores in detectIssues:", qualityScores);
      return issues;
    }

    // FIXED: Use normalized scores (multiply by 100)
    const grammarScore = qualityScores.grammar * 100;
    const contentScore = qualityScores.content * 100;
    const organizationScore = qualityScores.organization * 100;
    const styleScore = qualityScores.style * 100;

    if (grammarScore < 70) {
      issues.push({
        type: "grammar_errors",
        severity: (100 - grammarScore) / 100,
        description: "Multiple grammar errors detected",
      });
    }

    if (
      Array.isArray(feedback?.spellingErrors) &&
      feedback.spellingErrors.length > 5
    ) {
      issues.push({
        type: "spelling_errors",
        severity: Math.min(feedback.spellingErrors.length / 20, 1),
        description: "Frequent spelling mistakes",
      });
    }

    if (organizationScore < 70) {
      issues.push({
        type: "poor_organization",
        severity: (100 - organizationScore) / 100,
        description: "Essay structure needs improvement",
      });
    }

    if (contentScore < 70) {
      issues.push({
        type: "weak_arguments",
        severity: (100 - contentScore) / 100,
        description: "Arguments could be stronger",
      });
    }

    return issues;
  }

  /**
   * Normalize features using saved scaler parameters
   */
  normalizeFeatures(features) {
    const { mean, scale } = this.scalerParams;
    return features.map((f, i) => (f - mean[i]) / scale[i]);
  }

  /**
   * Denormalize score back to original scale
   */
  denormalizeScore(normalizedScore) {
    const { score_min, score_max } = this.scalerParams;
    return Math.round(
      (normalizedScore / 29) * (score_max - score_min) + score_min
    );
  }

  calculateFinalScore(qualityScores, rawScore) {
    const avgQuality =
      qualityScores.grammar * 0.25 +
      qualityScores.content * 0.3 +
      qualityScores.organization * 0.2 +
      qualityScores.style * 0.15 +
      qualityScores.mechanics * 0.1;

    console.log(`🔍 Raw quality scores:`, qualityScores);
    console.log(`📊 Average quality: ${avgQuality}`);

    // More generous scoring for good essays
    let finalScore;

    if (qualityScores.content > 0.72 && qualityScores.grammar > 0.7) {
      // Excellent essays: A range (85-95)
      finalScore = 85 + (avgQuality - 0.72) * 50;
    } else if (qualityScores.content > 0.68) {
      // Good essays: B+ to A- range (80-89)
      finalScore = 80 + (avgQuality - 0.68) * 45;
    } else if (qualityScores.content > 0.65) {
      // Average essays: C+ to B range (70-79)
      finalScore = 70 + (avgQuality - 0.65) * 30;
    } else {
      // Below average
      finalScore = 60 + avgQuality * 15;
    }

    // Ensure reasonable score range
    finalScore = Math.min(Math.max(finalScore, 60), 95);
    finalScore = Math.round(finalScore);

    console.log(`🎯 Final calculated score: ${finalScore}/100`);

    return finalScore;
  }

  calculateGrade(score) {
    // More realistic grading scale
    if (score >= 90) return "A";
    if (score >= 85) return "A-";
    if (score >= 80) return "B+";
    if (score >= 75) return "B";
    if (score >= 70) return "B-";
    if (score >= 65) return "C+";
    if (score >= 60) return "C";
    if (score >= 55) return "D";
    return "F";
  }

  /**
   * Get appropriate grade description
   */
  getGradeDescription(grade) {
    const descriptions = {
      A: "Excellent - Well-structured and insightful work",
      "A-": "Very Good - Strong analysis with minor flaws",
      "B+": "Good - Above average with some areas to improve",
      B: "Good - Solid analysis with minor areas for improvement",
      "B-": "Fairly Good - Competent but needs refinement",
      "C+": "Average - Meets expectations but lacks depth",
      C: "Satisfactory - Meets basic requirements adequately",
      D: "Developing - Shows understanding but needs significant improvement",
      F: "Insufficient - Major issues need addressing",
    };
    return descriptions[grade] || "Grade not available";
  }

  /**
   * Run model inference via Python service
   */
  async runInference(features) {
    try {
      const response = await axios.post(
        `${this.inferenceServiceURL}/predict`,
        { features: features },
        {
          timeout: 10000,
          headers: { "Content-Type": "application/json" },
        }
      );

      const { score, normalized_score, confidence, quality_scores } =
        response.data;

      return {
        score: score,
        normalizedScore: normalized_score,
        confidence: confidence,
        qualityScores: {
          grammar: quality_scores.grammar,
          content: quality_scores.content,
          organization: quality_scores.organization,
          style: quality_scores.style,
          mechanics: quality_scores.mechanics,
        },
      };
    } catch (error) {
      console.error("Python inference service error:", error.message);

      // Fallback for development/testing
      if (process.env.NODE_ENV === "development") {
        console.warn("⚠️  Using mock inference (development mode)");
        return {
          score: 8 + Math.floor(Math.random() * 4), // 8-12
          normalizedScore: 20 + Math.floor(Math.random() * 10), // 20-30
          confidence: 0.75 + Math.random() * 0.2,
          qualityScores: {
            grammar: 0.7 + Math.random() * 0.2, // 0.7-0.9
            content: 0.7 + Math.random() * 0.2,
            organization: 0.7 + Math.random() * 0.2,
            style: 0.7 + Math.random() * 0.2,
            mechanics: 0.7 + Math.random() * 0.2,
          },
        };
      }

      throw new Error(`Model inference failed: ${error.message}`);
    }
  }
}

module.exports = new EssayGradingService();
