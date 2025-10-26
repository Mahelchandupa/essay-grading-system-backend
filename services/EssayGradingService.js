const axios = require("axios");

const Student = require("../models/Student");
const Essay = require("../models/Essay");

const ImprovedScoringCalibration = require("./ImprovedScoringCalibration");
const OpenAIService = require("./OpenAIService");
const AchievementService = require("./AchievementService");
const FeatureExtractor = require("./FeatureExtractor");
const FeedbackGenerator = require("./FeedbackGenerator");
const SpellingCheckerService = require("./SpellingCheckerService");
const { createError } = require("../utils/errorResponse");
const PlagiarismDetector = require("./PlagiarismDetector");

class EssayGradingService {
  constructor() {
    this.featureExtractor = new FeatureExtractor();
    this.feedbackGenerator = new FeedbackGenerator();
    this.openAIService = OpenAIService;

    this.spellingChecker = new SpellingCheckerService(this.openAIService);
    this.scoringCalibration = new ImprovedScoringCalibration();

    this.inferenceServiceURL =
      process.env.INFERENCE_SERVICE_URL || "http://localhost:5001";
    this.scalerParams = null;
  }

  async initialize() {
    try {
      const modelPath =
        "../../essay-grading-system-service/models/production_model/";
      this.scalerParams = require(`${modelPath}scaler_params.json`);
    } catch (error) {
      console.warn("⚠️ Could not load scaler params, using defaults");
      this.scalerParams = { mean: [0], scale: [1] };
    }

    await this.feedbackGenerator.initializeDictionary();

    try {
      const response = await axios.get(`${this.inferenceServiceURL}/health`, {
        timeout: 5000,
      });
      console.log("✅ Python inference service connected:", response.data);
    } catch (error) {
      console.error("⚠️ Warning: Python inference service not available");
    }
  }

  /**
   * MAIN GRADING METHOD
   */
  // async gradeEssay(essayData) {
  //   const {
  //     studentId,
  //     text,
  //     title,
  //     fileType,
  //     ocrConfidence,
  //     ocrCorrections,
  //     structure,
  //   } = essayData;

  //   if (!studentId) {
  //     throw createError("BAD_REQUEST", "Student ID is required");
  //   }

  //   if (!text || text.trim().length < 10) {
  //     throw createError("BAD_REQUEST", "Essay text is too short", {
  //       minLength: 10,
  //     });
  //   }

  //   try {
  //     console.log("🔄 Starting essay grading...");

  //     const student = await Student.findById(studentId);
  //     if (!student) {
  //       throw createError("NOT_FOUND", "Student not found");
  //     }

  //     console.log(`   Student level: ${student.currentLevel}`);

  //     let essayStructure = structure || {
  //       title: null,
  //       sections: [],
  //       paragraphs: [],
  //     };

  //     // Log structure info for debugging
  //     console.log("📐 Essay Structure:");
  //     console.log(`   Title: ${essayStructure.title || "None"}`);
  //     console.log(`   Sections: ${essayStructure.sections?.length || 0}`);
  //     console.log(`   Paragraphs: ${essayStructure.paragraphs?.length || 0}`);

  //     const analysisResult = await this.processEssayWithAI(
  //       text,
  //       student.currentLevel,
  //       essayStructure
  //     );

  //     const plagiarismResults = await PlagiarismDetector.detectPlagiarism(
  //       text,
  //       studentId
  //     );

  //     // Extract features and run inference
  //     const features = this.featureExtractor.extractFeatures(
  //       analysisResult.processedWithSpelling,
  //       essayStructure // Pass structure to feature extraction
  //     );

  //     const normalizedFeatures = this.normalizeFeatures(features);
  //     const inferenceResult = await this.runInference(normalizedFeatures);

  //     // Generate fully corrected essay
  //     const fullyCorrectedText = this.generateFullyCorrectedEssay(
  //       text,
  //       analysisResult.spellingErrors,
  //       analysisResult.grammarErrors,
  //       analysisResult.styleSuggestions,
  //       essayStructure,
  //       student.currentLevel
  //     );

  //     // Generate feedback with structure
  //     const feedback = await this.feedbackGenerator.generate({
  //       text: analysisResult.processedWithSpelling,
  //       studentLevel: student.currentLevel,
  //       studentProfile: student.profile,
  //       persistentIssues: student.persistentIssues,
  //       score: inferenceResult.score,
  //       qualityScores: inferenceResult.qualityScores,
  //       recentPerformance: student.performanceMetrics.recentScores,
  //       ocrCorrections: ocrCorrections,
  //       grammarErrors: analysisResult.grammarErrors,
  //       spellingErrors: analysisResult.spellingErrors,
  //       essayStructure: essayStructure,
  //     });

  //     // Calculate scores
  //     const wordCount =
  //       analysisResult.processedWithSpelling.split(/\s+/).length;
  //     const scoreResult = this.scoringCalibration.calculateFinalScore(
  //       inferenceResult.qualityScores,
  //       inferenceResult.score,
  //       ocrConfidence,
  //       feedback,
  //       wordCount,
  //       essayStructure
  //     );

  //     const grade = this.scoringCalibration.calculateGrade(scoreResult.score);
  //     const gradeDescription = this.getGradeDescription(grade);

  //     // Generate personalized feedback
  //     const studentHistory = await this.getStudentHistory(student._id);
  //     console.log("STUDENT HISTORY", studentHistory);
  //     const personalizedFeedback = this.generatePersonalizedFeedback(
  //       student,
  //       studentHistory,
  //       scoreResult.score,
  //       inferenceResult.qualityScores,
  //       feedback
  //     );

  //     feedback.personalizedInsights = personalizedFeedback;

  //     // Create essay document
  //     const essayDocument = {
  //       studentId: student._id,
  //       title: essayStructure.title || title || "Untitled Essay",
  //       originalText: essayData.originalText || text,
  //       processedText: text,
  //       fullyCorrectedText: fullyCorrectedText,
  //       essayStructure: essayStructure,
  //       fileType,
  //       ocrConfidence,
  //       ocrCorrections,
  //       plagiarism: {
  //         overallSimilarity: plagiarismResults.overallSimilarity,
  //         isPlagiarized: plagiarismResults.isPlagiarized,
  //         confidence: plagiarismResults.confidence,
  //         checkedChunks: plagiarismResults.checkedChunks,
  //         citations: plagiarismResults.citations,
  //         method: plagiarismResults.method,
  //         details: {
  //           previousSubmissions: plagiarismResults.details.previousSubmissions,
  //           suspiciousPatterns: plagiarismResults.details.suspiciousPatterns,
  //           statistics: plagiarismResults.details.statistics,
  //           properCitations: plagiarismResults.details.properCitations,
  //         },
  //         detectedAt: new Date(),
  //       },
  //       grading: {
  //         rawScore: inferenceResult.score,
  //         normalizedScore: inferenceResult.normalizedScore,
  //         finalScore: scoreResult.score,
  //         grade: grade,
  //         gradeDescription: gradeDescription,
  //         confidence: inferenceResult.confidence,
  //         uncertaintyRange: scoreResult.uncertaintyRange,
  //         qualityScores: inferenceResult.qualityScores,
  //         calibrationVersion: "improved-v2",
  //         validatedErrors: {
  //           grammar: analysisResult.grammarErrors.length,
  //           spelling: analysisResult.spellingErrors.length,
  //         },
  //       },
  //       feedback: feedback,
  //       detectedIssues: [],
  //       gradedAt: new Date(),
  //       status: "graded",
  //     };

  //     const essay = await Essay.create(essayDocument);

  //     // Update student profile
  //     await this.updateStudentProfile(student, essay, []);
  //     const levelAssessment = await this.assessAndUpdateLevel(student);

  //     // Check achievements
  //    const essayHistory = await Essay.find({ studentId: student._id })
  //      .sort({ submittedAt: -1 })
  //       .limit(10)
  //       .lean();

  //     const achievementResult =
  //       await AchievementService.checkAndUnlockAchievements(
  //         student,
  //         essay,
  //         essayHistory,
  //       );

  //           console.log(`🎯 Achievement result:`, {
  //      unlocked: achievementResult.unlocked,
  //      totalPoints: achievementResult.totalPoints,
  //      hasError: !!achievementResult.error
  //    });

  //     // Refresh the student data to get updated achievements
  //     await student.save();

  //     //save unlocked achivements for current essay
  //     const reUpdateEssay = {
  //       ...essayDocument
  //     }

  //     return {
  //       essay: await Essay.findById(essay._id), // Return fresh essay data
  //       studentLevel: student.currentLevel,
  //       levelUpdate: levelAssessment,
  //       qualityBreakdown: inferenceResult.qualityScores,
  //      achievements: achievementResult,
  //     };
  //   } catch (error) {
  //     console.error("Grading error:", error);

  //     // Re-throw operational errors, wrap others
  //     if (error.isOperational) {
  //       throw error;
  //     }

  //     throw createError("INTERNAL_ERROR", "Failed to grade essay", {
  //       originalError: error.message,
  //     });
  //   }
  // }

  /**
   * MAIN GRADING METHOD - WITH ACHIEVEMENT TRACKING
   */
  async gradeEssay(essayData) {
    const {
      studentId,
      text,
      title,
      fileType,
      ocrConfidence,
      ocrCorrections,
      structure,
    } = essayData;

    if (!studentId) {
      throw createError("BAD_REQUEST", "Student ID is required");
    }

    if (!text || text.trim().length < 10) {
      throw createError("BAD_REQUEST", "Essay text is too short", {
        minLength: 10,
      });
    }

    try {
      console.log("🔄 Starting essay grading...");

      const student = await Student.findById(studentId);
      if (!student) {
        throw createError("NOT_FOUND", "Student not found");
      }

      console.log(`   Student level: ${student.currentLevel}`);

      let essayStructure = structure || {
        title: null,
        sections: [],
        paragraphs: [],
      };

      // Log structure info for debugging
      console.log("📐 Essay Structure:");
      console.log(`   Title: ${essayStructure.title || "None"}`);
      console.log(`   Sections: ${essayStructure.sections?.length || 0}`);
      console.log(`   Paragraphs: ${essayStructure.paragraphs?.length || 0}`);

      const analysisResult = await this.processEssayWithAI(
        text,
        student.currentLevel,
        essayStructure
      );

      const plagiarismResults = await PlagiarismDetector.detectPlagiarism(
        text,
        studentId
      );

      // Extract features and run inference
      const features = this.featureExtractor.extractFeatures(
        analysisResult.processedWithSpelling,
        essayStructure
      );

      const normalizedFeatures = this.normalizeFeatures(features);
      const inferenceResult = await this.runInference(normalizedFeatures);

      // Generate fully corrected essay
      const fullyCorrectedText = this.generateFullyCorrectedEssay(
        text,
        analysisResult.spellingErrors,
        analysisResult.grammarErrors,
        analysisResult.styleSuggestions,
        essayStructure,
        student.currentLevel
      );

      // Generate feedback with structure
      const feedback = await this.feedbackGenerator.generate({
        text: analysisResult.processedWithSpelling,
        studentLevel: student.currentLevel,
        studentProfile: student.profile,
        persistentIssues: student.persistentIssues,
        score: inferenceResult.score,
        qualityScores: inferenceResult.qualityScores,
        recentPerformance: student.performanceMetrics.recentScores,
        ocrCorrections: ocrCorrections,
        grammarErrors: analysisResult.grammarErrors,
        spellingErrors: analysisResult.spellingErrors,
        essayStructure: essayStructure,
      });

      // Calculate scores
      const wordCount =
        analysisResult.processedWithSpelling.split(/\s+/).length;
      const scoreResult = this.scoringCalibration.calculateFinalScore(
        inferenceResult.qualityScores,
        inferenceResult.score,
        ocrConfidence,
        feedback,
        wordCount,
        essayStructure
      );

      const grade = this.scoringCalibration.calculateGrade(scoreResult.score);
      const gradeDescription = this.getGradeDescription(grade);

      // Generate personalized feedback
      const studentHistory = await this.getStudentHistory(student._id);
      console.log("STUDENT HISTORY", studentHistory);
      const personalizedFeedback = this.generatePersonalizedFeedback(
        student,
        studentHistory,
        scoreResult.score,
        inferenceResult.qualityScores,
        feedback
      );

      feedback.personalizedInsights = personalizedFeedback;

      // Create essay document
      const essayDocument = {
        studentId: student._id,
        title: essayStructure.title || title || "Untitled Essay",
        originalText: essayData.originalText || text,
        processedText: text,
        fullyCorrectedText: fullyCorrectedText,
        essayStructure: essayStructure,
        fileType,
        ocrConfidence,
        ocrCorrections,
        plagiarism: {
          overallSimilarity: plagiarismResults.overallSimilarity,
          isPlagiarized: plagiarismResults.isPlagiarized,
          confidence: plagiarismResults.confidence,
          checkedChunks: plagiarismResults.checkedChunks,
          citations: plagiarismResults.citations,
          method: plagiarismResults.method,
          details: {
            previousSubmissions: plagiarismResults.details.previousSubmissions,
            suspiciousPatterns: plagiarismResults.details.suspiciousPatterns,
            statistics: plagiarismResults.details.statistics,
            properCitations: plagiarismResults.details.properCitations,
          },
          detectedAt: new Date(),
        },
        grading: {
          rawScore: inferenceResult.score,
          normalizedScore: inferenceResult.normalizedScore,
          finalScore: scoreResult.score,
          grade: grade,
          gradeDescription: gradeDescription,
          confidence: inferenceResult.confidence,
          uncertaintyRange: scoreResult.uncertaintyRange,
          qualityScores: inferenceResult.qualityScores,
          calibrationVersion: "improved-v2",
          validatedErrors: {
            grammar: analysisResult.grammarErrors.length,
            spelling: analysisResult.spellingErrors.length,
          },
        },
        feedback: feedback,
        detectedIssues: [],
        gradedAt: new Date(),
        status: "graded",
        achievementsUnlocked: [], // ✅ Initialize empty array
      };

      const essay = await Essay.create(essayDocument);

      // Update student profile
      await this.updateStudentProfile(student, essay, []);
      const levelAssessment = await this.assessAndUpdateLevel(student);

      // ✅ Get essay history BEFORE checking achievements
      const essayHistory = await Essay.find({ studentId: student._id })
        .sort({ submittedAt: -1 })
        .limit(10)
        .lean();

      console.log(
        `📊 Checking achievements (history: ${essayHistory.length} essays)`
      );

      // ✅ Check and unlock achievements
      const achievementResult =
        await AchievementService.checkAndUnlockAchievements(
          student,
          essay,
          essayHistory
        );

      console.log(`🎯 Achievement result:`, {
        unlocked: achievementResult.unlocked,
        count: achievementResult.unlocked?.length || 0,
        totalPoints: achievementResult.totalPoints,
        hasError: !!achievementResult.error,
      });

      // ✅ UPDATE ESSAY WITH UNLOCKED ACHIEVEMENTS
      if (achievementResult.unlocked && achievementResult.unlocked.length > 0) {
        console.log(
          `📝 Updating essay with ${achievementResult.unlocked.length} new achievements...`
        );

        // Map unlocked achievements to essay format
        const achievementsForEssay = achievementResult.unlocked.map(
          (badgeId) => {
            const badgeInfo = achievementResult.newAchievements?.find(
              (a) => a.badgeId === badgeId
            );

            return {
              badgeId: badgeId,
              unlockedAt: new Date(),
              points: badgeInfo?.points || 0,
              // ✅ Optional: Store full badge details for easy display
              title: badgeInfo?.title || badgeId,
              icon: badgeInfo?.icon || "🏅",
              category: badgeInfo?.category || "Unknown",
              description: badgeInfo?.description || "",
            };
          }
        );

        // ✅ Update essay with achievements
        essay.achievementsUnlocked = achievementsForEssay;
        await essay.save();

        console.log(
          `   ✅ Saved ${achievementsForEssay.length} achievements to essay`
        );
        achievementsForEssay.forEach((ach) => {
          console.log(
            `      ${ach.icon} ${ach.badgeId}: ${ach.title} (+${ach.points} pts)`
          );
        });
      } else {
        console.log(`   ℹ️ No new achievements unlocked for this essay`);
      }

      // ✅ Save student updates
      await student.save();

      // ✅ Return fresh essay data with achievements
      const finalEssay = await Essay.findById(essay._id).lean();

      console.log(`✅ Essay grading complete`);
      console.log(`   Essay ID: ${finalEssay._id}`);
      console.log(
        `   Achievements unlocked: ${
          finalEssay.achievementsUnlocked?.length || 0
        }`
      );

      return {
        essay: finalEssay, // Now includes achievementsUnlocked array
        studentLevel: student.currentLevel,
        levelUpdate: levelAssessment,
        qualityBreakdown: inferenceResult.qualityScores,
        achievements: achievementResult,
      };
    } catch (error) {
      console.error("Grading error:", error);

      // Re-throw operational errors, wrap others
      if (error.isOperational) {
        throw error;
      }

      throw createError("INTERNAL_ERROR", "Failed to grade essay", {
        originalError: error.message,
      });
    }
  }

  async processEssayWithAI(processedText, studentLevel, essayStructure) {
    try {
      console.log("🤖 Processing essay with AI...");

      const aiHealth = await this.openAIService.healthCheck();
      if (!aiHealth.healthy) {
        console.warn("⚠️ AI service not available, using fallback");
        return this.fallbackProcessing(processedText);
      }

      // Single AI call for comprehensive analysis
      const aiResult = await this.openAIService.analyzeEssayGrammar(
        processedText
      );

      if (!aiResult || !aiResult.grammar_analysis) {
        console.warn("⚠️ No analysis returned from AI");
        return this.fallbackProcessing(processedText);
      }

      console.log(
        `📝 AI found ${
          aiResult.grammar_analysis.corrections?.length || 0
        } potential errors`
      );

      // ✅ Use context-aware spelling check with OpenAI
      let spellingErrors = [];
      try {
        spellingErrors = await this.spellingChecker.checkSpellingWithContext(
          processedText
        );
        console.log(
          `🔤 Found ${spellingErrors.length} spelling errors (context-aware)`
        );
      } catch (error) {
        console.warn(
          "⚠️ Context-aware spelling failed, using basic check:",
          error.message
        );
        spellingErrors = this.spellingChecker.checkSpelling(processedText);
        console.log(
          `🔤 Found ${spellingErrors.length} spelling errors (basic)`
        );
      }

      // Don't fix spelling in the text - keep original for grading
      const processedWithSpelling = processedText;

      // Process grammar errors with AI explanations
      const grammarErrors = await this.processGrammarErrors(
        aiResult.grammar_analysis.corrections,
        processedText,
        studentLevel
      );

      // Detect style issues
      const styleSuggestions = this.detectGenericStyleIssues(processedText);

      // Check essay structure
      const structureAnalysis = this.analyzeEssayStructure(
        essayStructure,
        processedText
      );

      return {
        spellingErrors,
        grammarErrors,
        styleSuggestions,
        processedWithSpelling,
        structureAnalysis,
      };
    } catch (error) {
      console.error("❌ AI processing failed:", error.message);
      return this.fallbackProcessing(processedText);
    }
  }

  /**
   * Process grammar errors with batch explanations
   */
  async processGrammarErrors(openAICorrections, text, studentLevel) {
    if (!openAICorrections || !Array.isArray(openAICorrections)) {
      return [];
    }

    // Filter and validate corrections first
    const validCorrections = openAICorrections.filter(
      (correction) =>
        correction.original &&
        correction.correction &&
        correction.original !== correction.correction
    );

    if (validCorrections.length === 0) {
      return [];
    }

    // Convert to standard format with AI explanations
    const standardErrors = await this.openAIService.convertToStandardErrors(
      validCorrections,
      text,
      studentLevel
    );

    // Post-process to remove poor quality corrections
    const filteredErrors = this.postProcessGrammarCorrections(
      standardErrors,
      text,
      text
    );

    console.log(
      `✅ Final grammar errors after filtering: ${filteredErrors.length}`
    );
    return filteredErrors;
  }

  /**
   * Generate fully corrected essay with conclusion handling
   */
  generateFullyCorrectedEssay(
    originalText,
    spellingErrors,
    grammarErrors,
    styleSuggestions,
    structure,
    studentLevel
  ) {
    console.log(
      "🔄 Generating fully corrected essay with structure preservation..."
    );

    // ✅ Check if we have a proper structure
    const hasStructure =
      structure && structure.paragraphs && structure.paragraphs.length > 0;

    if (hasStructure) {
      console.log("✅ Using structure-based correction");
      return this.generateStructuredCorrectedEssay(
        structure,
        spellingErrors,
        grammarErrors,
        styleSuggestions,
        studentLevel
      );
    }

    // ✅ Fallback: Plain text correction (no structure)
    console.log("⚠️ No structure available - using plain text correction");
    return this.generatePlainCorrectedEssay(
      originalText,
      spellingErrors,
      grammarErrors,
      styleSuggestions,
      studentLevel
    );
  }

  /**
   * Generate corrected essay without structure (fallback)
   */
  generatePlainCorrectedEssay(
    originalText,
    spellingErrors,
    grammarErrors,
    styleSuggestions,
    studentLevel
  ) {
    let correctedEssay = originalText;

    // Apply corrections
    correctedEssay = this.applyCorrectionsToText(
      correctedEssay,
      spellingErrors,
      grammarErrors,
      styleSuggestions
    );

    // Check for conclusion
    const hasConclusion = this.checkForConclusion(correctedEssay, null);
    if (!hasConclusion) {
      correctedEssay += this.generateConclusionMessage(studentLevel);
    }

    // Final cleanup
    correctedEssay = this.cleanupFinalEssay(correctedEssay);

    return correctedEssay;
  }

  /**
   * Generate corrected essay using structure
   */
  generateStructuredCorrectedEssay(
    structure,
    spellingErrors,
    grammarErrors,
    styleSuggestions,
    studentLevel
  ) {
    let correctedEssay = "";

    console.log("🔄 Generating structure-based corrected essay...");
    console.log(`   Title: ${structure.title || "None"}`);
    console.log(`   Sections: ${structure.sections.length}`);
    console.log(`   Paragraphs: ${structure.paragraphs.length}`);

    // ✅ 1. Add Title if present
    if (structure.title) {
      const correctedTitle = this.applyCorrectionsToText(
        structure.title,
        spellingErrors,
        grammarErrors,
        []
      );
      correctedEssay += `${correctedTitle}\n\n`;
      console.log(`   ✅ Title corrected`);
    }

    // ✅ 2. Track which sections we've added
    const addedSections = new Set();

    // ✅ 3. Process each paragraph with its section header
    structure.paragraphs.forEach((paragraph, index) => {
      const section = paragraph.section || "";
      const text = paragraph.text || "";

      // Add section header if it's new and valid
      if (section && !addedSections.has(section)) {
        // Don't add generic section names like "Body", "Introduction" unless they're actual headers
        const isActualSection = structure.sections.includes(section);

        if (isActualSection) {
          addedSections.add(section);

          // Clean up and correct section header
          const cleanedSection = this.applyCorrectionsToText(
            section,
            spellingErrors,
            grammarErrors,
            []
          );
          correctedEssay += `${cleanedSection}\n\n`;
          console.log(
            `   ✅ Section ${addedSections.size}: "${cleanedSection}"`
          );
        }
      }

      // Apply corrections to paragraph text
      if (text && text.length > 10) {
        const correctedParagraph = this.applyCorrectionsToText(
          text,
          spellingErrors,
          grammarErrors,
          styleSuggestions
        );

        correctedEssay += `${correctedParagraph}\n\n`;
      }
    });

    // ✅ 4. Check for conclusion
    const hasConclusion = this.detectConclusionFromStructure(structure);
    if (!hasConclusion) {
      correctedEssay += this.generateConclusionMessage(studentLevel);
    }

    // ✅ 5. Final cleanup
    correctedEssay = this.cleanupFinalEssay(correctedEssay);

    console.log("✅ Structure-based corrected essay generated");
    console.log(`   Final length: ${correctedEssay.length} characters`);

    return correctedEssay;
  }

  /**
   * Apply corrections with deduplication and proper matching
   */
  applyCorrectionsToText(
    text,
    spellingErrors,
    grammarErrors,
    styleSuggestions
  ) {
    let corrected = text;

    console.log(`   Applying corrections to: "${text.substring(0, 50)}..."`);
    console.log(`   Text length: ${text.length} chars`);
    console.log(`   Spelling errors: ${spellingErrors?.length || 0}`);
    console.log(`   Grammar errors: ${grammarErrors?.length || 0}`);

    // 1. Apply spelling corrections first (if any)
    if (spellingErrors && spellingErrors.length > 0) {
      spellingErrors.forEach((error) => {
        if (error.word && error.correction) {
          const regex = new RegExp(
            `\\b${this.escapeRegex(error.word)}\\b`,
            "gi"
          );
          corrected = corrected.replace(regex, error.correction);
          console.log(`      ✅ Spelling: ${error.word} → ${error.correction}`);
        }
      });
    }

    // 2. Apply grammar corrections
    if (grammarErrors && grammarErrors.length > 0) {
      // Deduplicate by creating a map
      const correctionMap = new Map();

      grammarErrors.forEach((error) => {
        if (
          error.original &&
          error.correction &&
          error.original !== error.correction
        ) {
          // Normalize text
          const normalizedOriginal = error.original.trim().replace(/\s+/g, " ");
          correctionMap.set(
            normalizedOriginal,
            error.correction.trim().replace(/\s+/g, " ")
          );
        }
      });

      // Sort by length (longest first) to avoid partial replacements
      const sortedCorrections = Array.from(correctionMap.entries()).sort(
        (a, b) => b[0].length - a[0].length
      );

      let appliedCount = 0;

      sortedCorrections.forEach(([original, correction]) => {
        // Try exact match (case-insensitive, flexible whitespace)
        const pattern = original
          .split(/\s+/)
          .map((word) => this.escapeRegex(word))
          .join("\\s+");

        const regex = new RegExp(pattern, "gi");

        if (regex.test(corrected)) {
          const beforeReplace = corrected;
          corrected = corrected.replace(regex, correction);

          if (beforeReplace !== corrected) {
            console.log(
              `      ✅ Grammar: "${original.substring(
                0,
                40
              )}..." → "${correction.substring(0, 40)}..."`
            );
            appliedCount++;
          }
        }
      });

      console.log(
        `   ✅ Applied ${appliedCount}/${grammarErrors.length} grammar corrections`
      );
    }

    // 3. Apply style suggestions
    if (styleSuggestions && styleSuggestions.length > 0) {
      corrected = this.applyStyleSuggestionsIntelligently(
        corrected,
        styleSuggestions
      );
    }

    console.log(`   Final corrected length: ${corrected.length} chars`);

    return corrected;
  }

  /**
   * Find fuzzy match for grammar corrections
   * Handles cases where punctuation or spacing differs slightly
   */
  findFuzzyMatch(text, targetText) {
    // Normalize both texts for comparison
    const normalizeForMatch = (str) => {
      return str
        .toLowerCase()
        .replace(/\s+/g, " ") // Normalize spaces
        .replace(/[.!?,;:]+/g, "") // Remove punctuation
        .trim();
    };

    const normalizedTarget = normalizeForMatch(targetText);
    const words = targetText.split(/\s+/);

    // Try to find the sequence of words in the text
    const wordPattern = words.map((w) => this.escapeRegex(w)).join("\\s+");
    const regex = new RegExp(wordPattern, "gi");
    const match = text.match(regex);

    return match ? match[0] : null;
  }

  /**
   * Detect conclusion from structure
   */
  detectConclusionFromStructure(structure) {
    if (!structure.sections || structure.sections.length === 0) {
      return false;
    }

    // Check last few sections for conclusion keywords
    const lastSections = structure.sections
      .slice(-2)
      .map((s) => s.toLowerCase());
    const conclusionKeywords = ["conclusion", "summary", "closing", "final"];

    return lastSections.some((section) =>
      conclusionKeywords.some((keyword) => section.includes(keyword))
    );
  }

  checkForConclusion(text, structure) {
    if (structure && structure.sections) {
      const hasConclusionSection = structure.sections.some((section) =>
        section.toLowerCase().includes("conclusion")
      );
      if (hasConclusionSection) return true;
    }

    const conclusionIndicators = [
      /in conclusion/i,
      /to conclude/i,
      /in summary/i,
      /to summarize/i,
      /overall,/i,
      /therefore,/i,
      /thus,/i,
      /finally,/i,
    ];

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
    const lastFewSentences = sentences.slice(-3);

    return conclusionIndicators.some((pattern) =>
      lastFewSentences.some((sentence) => pattern.test(sentence))
    );
  }

  generateConclusionMessage(studentLevel) {
    const messages = {
      beginner: `\n\n[Note: Your essay is missing a conclusion. Try adding a final paragraph that summarizes your main points and gives a final thought about your topic.]`,
      intermediate: `\n\n[Note: Consider adding a conclusion paragraph to summarize your key arguments and provide closure to your essay.]`,
      advanced: `\n\n[Note: The essay would benefit from a concluding section to reinforce your main arguments.]`,
    };

    return messages[studentLevel] || messages.intermediate;
  }

  // ==================== HELPER METHODS ====================

  preprocessText(text, spellingErrors) {
    let processedText = text;

    if (spellingErrors && spellingErrors.length > 0) {
      spellingErrors.forEach((error) => {
        if (error.word && error.correction) {
          const regex = new RegExp(
            `\\b${this.escapeRegex(error.word)}\\b`,
            "gi"
          );
          processedText = processedText.replace(regex, error.correction);
        }
      });
    }

    return processedText;
  }

  postProcessGrammarCorrections(grammarErrors, originalText, processedText) {
    if (!grammarErrors || !grammarErrors.length) return grammarErrors;

    const improvedCorrections = [];
    const poorQualityPatterns = [
      /Go and school/,
      /We must control how we used/,
      /teens who spent/,
    ];

    for (const error of grammarErrors) {
      const isPoorQuality = poorQualityPatterns.some((pattern) =>
        pattern.test(error.correction)
      );
      const isActuallyCorrected = error.original !== error.correction;

      if (!isPoorQuality && isActuallyCorrected) {
        improvedCorrections.push(error);
      }
    }

    return improvedCorrections;
  }

  /**
   * Cleanup preserving structure
   */
  cleanupFinalEssay(text) {
    return (
      text
        // Fix double periods
        .replace(/\.\./g, ".")
        .replace(/\.\s*\./g, ".")

        // Fix spacing around punctuation
        .replace(/\s+\./g, ".")
        .replace(/\s+,/g, ",")
        .replace(/\s+;/g, ";")

        // Ensure proper sentence capitalization
        .replace(/([.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase())

        // Fix multiple spaces but preserve paragraph breaks
        .replace(/[^\S\n]+/g, " ") // Replace multiple spaces (not newlines) with single space
        .replace(/\n{3,}/g, "\n\n") // Max 2 consecutive newlines

        .trim()
    );
  }

  applyStyleSuggestionsIntelligently(text, styleSuggestions) {
    if (!styleSuggestions || !styleSuggestions.length) return text;

    let improvedText = text;
    const appliedChanges = new Set();

    styleSuggestions.forEach((suggestion) => {
      if (appliedChanges.has(suggestion.text)) return;

      const { text: target, type } = suggestion;

      if (
        type === "informal_expression" &&
        target.toLowerCase().includes("a lot")
      ) {
        improvedText = this.replaceALotContextually(improvedText);
      } else if (
        type === "vague_language" &&
        target.toLowerCase().includes("thing")
      ) {
        improvedText = improvedText.replace(/\bthing\b/gi, "aspect");
      }

      appliedChanges.add(target);
    });

    return improvedText;
  }

  replaceALotContextually(text) {
    return text.replace(/a lot(?:\s+of)?/gi, (match, offset, original) => {
      const afterText = original.substring(offset + match.length);
      const nextWords = afterText
        .split(/\s+/)
        .slice(0, 3)
        .join(" ")
        .toLowerCase();

      const countablePatterns = [
        /\b(people|students|friends|books|things|items)\b/,
      ];
      const uncountablePatterns = [
        /\b(time|money|information|work|research)\b/,
      ];

      for (const pattern of countablePatterns) {
        if (pattern.test(nextWords))
          return match.includes("of") ? "many" : "many";
      }

      for (const pattern of uncountablePatterns) {
        if (pattern.test(nextWords))
          return match.includes("of") ? "much" : "much";
      }

      return match.includes("of") ? "a significant amount of" : "significantly";
    });
  }

  analyzeEssayStructure(structure, text) {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

    // Use provided structure if available
    const hasProperStructure =
      structure && structure.paragraphs && structure.paragraphs.length > 0;

    if (hasProperStructure) {
      console.log("Using OCR-detected structure for analysis");

      return {
        hasIntroduction: this.detectIntroductionFromStructure(structure),
        hasBody: structure.paragraphs.length >= 2,
        hasConclusion: this.detectConclusionFromStructure(structure),
        sentenceCount: sentences.length,
        paragraphCount: structure.paragraphs.length,
        avgSentenceLength: text.length / Math.max(sentences.length, 1),
        sections: structure.sections || [],
      };
    }

    // Fallback to basic analysis
    return {
      hasIntroduction: paragraphs.length > 0 && paragraphs[0].length > 50,
      hasBody: paragraphs.length >= 3,
      hasConclusion: this.checkForConclusion(text, structure),
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      avgSentenceLength: text.length / Math.max(sentences.length, 1),
      sections: [],
    };
  }

  /**
   * Detect introduction from structure
   */
  detectIntroductionFromStructure(structure) {
    if (!structure.sections || structure.sections.length === 0) {
      return false;
    }

    const firstSection = structure.sections[0].toLowerCase();
    const introKeywords = ["introduction", "intro", "intoduction"];

    return introKeywords.some((keyword) => firstSection.includes(keyword));
  }

  /**
   * Detect conclusion from structure
   */
  detectConclusionFromStructure(structure) {
    if (!structure.sections || structure.sections.length === 0) {
      return false;
    }

    const lastSection =
      structure.sections[structure.sections.length - 1].toLowerCase();
    const conclusionKeywords = ["conclusion", "summary", "closing"];

    return conclusionKeywords.some((keyword) => lastSection.includes(keyword));
  }

  fallbackProcessing(processedText) {
    const spellingErrors = this.spellingChecker.checkSpelling(processedText);
    const processedWithSpelling = this.preprocessText(
      processedText,
      spellingErrors
    );
    const styleSuggestions = this.detectGenericStyleIssues(processedText);

    return {
      spellingErrors,
      grammarErrors: [],
      styleSuggestions,
      processedWithSpelling,
      structureAnalysis: this.analyzeEssayStructure({}, processedText),
    };
  }

  detectGenericStyleIssues(text) {
    const issues = [];
    const seenPositions = new Set();

    const stylePatterns = [
      {
        pattern: /\b(a lot|lots of)\b/gi,
        type: "informal_expression",
        suggestion: "many/much",
      },
      {
        pattern: /\b(thing|stuff)\b/gi,
        type: "vague_language",
        suggestion: "specific aspects/elements",
      },
    ];

    stylePatterns.forEach(({ pattern, type, suggestion }) => {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const posKey = `${match.index}-${match[0]}`;
        if (seenPositions.has(posKey)) continue;
        seenPositions.add(posKey);

        issues.push({
          type: type,
          text: match[0],
          suggestion: suggestion,
          context: this.getContext(text, match[0]),
          position: { start: match.index, end: match.index + match[0].length },
        });
      }
    });

    return issues;
  }

  getContext(text, word) {
    const index = text.indexOf(word);
    if (index === -1) return "";
    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + word.length + 40);
    return "..." + text.substring(start, end).trim() + "...";
  }

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ==================== STUDENT MANAGEMENT ====================

  async getStudentHistory(studentMongoId) {
    try {
      const essays = await Essay.find({ studentId: studentMongoId })
        .sort({ submittedAt: -1 })
        .limit(10)
        .select("grading.finalScore grading.qualityScores submittedAt");

      return {
        totalEssays: essays.length,
        essays: essays,
        hasHistory: essays.length > 0,
      };
    } catch (error) {
      return { totalEssays: 0, essays: [], hasHistory: false };
    }
  }

  generatePersonalizedFeedback(
    student,
    history,
    currentScore,
    qualityScores,
    feedback
  ) {
    const insights = {
      progressComparison: null,
      improvementAreas: [],
      persistentChallenges: [],
      motivationalContext: {},
      milestones: [],
    };

    if (!history.hasHistory) {
      insights.motivationalContext = {
        overallComment: "🌟 Welcome! This is your first essay with us!",
        motivationalMessage:
          "Every expert was once a beginner. Let's start your writing journey together!",
      };
      return insights;
    }

    const historicalScores = history.essays.map((e) => e.grading.finalScore);
    const avgHistoricalScore =
      historicalScores.reduce((a, b) => a + b, 0) / historicalScores.length;

    insights.progressComparison = {
      currentScore: currentScore,
      averageScore: Math.round(avgHistoricalScore),
      improvement: Math.round(currentScore - avgHistoricalScore),
    };

    if (qualityScores.grammar < 0.7) {
      insights.improvementAreas.push("Focus on grammar accuracy");
    }
    if (qualityScores.organization < 0.6) {
      insights.improvementAreas.push("Improve essay structure");
    }

    return insights;
  }

  async updateStudentProfile(student, essay, detectedIssues) {
    const { grading } = essay;

    student.performanceMetrics.recentScores.push({
      score: grading.finalScore,
      normalizedScore: grading.normalizedScore,
      submittedAt: essay.submittedAt,
      essayId: essay._id,
    });

    if (student.performanceMetrics.recentScores.length > 10) {
      student.performanceMetrics.recentScores.shift();
    }

    const recentScores = student.performanceMetrics.recentScores;
    student.performanceMetrics.avgScore =
      recentScores.reduce((sum, s) => sum + s.normalizedScore, 0) /
      recentScores.length;

    student.stats.totalEssays += 1;
    student.stats.lastSubmission = new Date();

    await student.save();
  }

  async assessAndUpdateLevel(student) {
    const assessment = student.assessLevelStability();

    return {
      action: assessment.action,
      reason: assessment.reason,
      message: this.getStableMessage(student),
      previousLevel: student.currentLevel,
      newLevel: student.currentLevel,
    };
  }

  getStableMessage(student) {
    return "You're maintaining consistent performance. Keep focusing on improvement!";
  }

  // ==================== SCORING METHODS ====================

  normalizeFeatures(features) {
    const { mean, scale } = this.scalerParams;
    return features.map((f, i) => (f - mean[i]) / scale[i]);
  }

  async runInference(features) {
    try {
      const response = await axios.post(
        `${this.inferenceServiceURL}/predict`,
        { features: features },
        { timeout: 10000 }
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
      return this.calculateIntelligentFallbackScores(features);
    }
  }

  /**
   * Calculate intelligent fallback scores when inference service is down
   */
  calculateIntelligentFallbackScores(features) {
    console.log("🔄 Calculating intelligent fallback scores...");

    // Extract key features to estimate scores
    const wordCount = features[0] || 300; // First feature is usually word count
    const sentenceCount = features[1] || 15;
    const vocabularyDiversity = features[5] || 0.5; // TTR
    const longWordsRatio = features[6] || 0.2;

    // Estimate scores based on features
    const baseGrammar = Math.min(0.8, 0.6 + vocabularyDiversity * 0.4);
    const baseContent = Math.min(0.85, 0.5 + wordCount / 1000);
    const baseOrganization = 0.7; // Default
    const baseStyle = Math.min(0.8, 0.5 + longWordsRatio * 0.6);
    const baseMechanics = 0.7; // Default

    // Adjust based on essay length and complexity
    const lengthBonus = Math.min(0.1, wordCount / 3000);
    const complexityBonus = vocabularyDiversity * 0.2;

    const estimatedScores = {
      grammar: baseGrammar + complexityBonus,
      content: baseContent + lengthBonus,
      organization: baseOrganization,
      style: baseStyle + complexityBonus,
      mechanics: baseMechanics,
    };

    // Normalize scores
    Object.keys(estimatedScores).forEach((key) => {
      estimatedScores[key] = Math.max(0.5, Math.min(0.9, estimatedScores[key]));
    });

    console.log("📊 Estimated fallback scores:", estimatedScores);

    return {
      score: 75, // Default score
      normalizedScore: 75,
      confidence: 0.6, // Lower confidence for fallback
      qualityScores: estimatedScores,
    };
  }

  getGradeDescription(grade) {
    const descriptions = {
      // A: "Excellent - Very strong work",
      // B: "Good - Solid understanding",
      // C: "Average - Meets basic expectations",
      // D: "Below Average - Needs improvement",
      // F: "Failing - Major revision needed",

      "A+": "Excellent – Exceptional mastery and coherence",
      A: "Very Good – Clear structure and strong content",
      "A–": "Good – Minor issues but strong writing overall",
      "B+": "Above Average – Some improvement needed in detail",
      B: "Average – Solid foundation, moderate errors",
      "B–": "Fair – Needs improvement in clarity and grammar",
      "C+": "Satisfactory – Meets minimum expectations",
      C: "Marginal Pass – Limited analysis and organization",
      "C–": "Borderline – Major issues in structure/grammar",
      "D+": "Weak – Minimal understanding, poor writing quality",
      F: "Fail – Does not meet basic academic standards",
    };
    return descriptions[grade] || "Needs improvement";
  }
}

module.exports = new EssayGradingService();
