const natural = require("natural");
const compromise = require("compromise");
const SpellChecker = require("simple-spellchecker");
const axios = require("axios");
const EnhancedOpenAIService = require('./EnhancedOpenAIService');

/**
 * COMPREHENSIVE FeedbackGenerator Class
 * Handles ALL feedback generation logic in one place
 */
class FeedbackGenerator {
  constructor() {
    this.dictionary = null;
    this.dictionaryReady = false;
    this.initializeDictionary();
    this.definitionCache = new Map();
    this.maxCacheSize = 1000;

    // Technical vocabulary whitelist
    this.technicalVocabulary = new Set([
      "ai",
      "chatbot",
      "chatbots",
      "algorithm",
      "algorithms",
      "covid",
      "cryptocurrency",
      "blockchain",
      "wifi",
      "smartphone",
      "smartphones",
      "chatgpt",
      "google",
      "facebook",
      "instagram",
      "youtube",
      "netflix",
      "tesla",
      "uber",
      "amazon",
      "microsoft",
      "iphone",
      "android",
      "app",
      "apps",
      "email",
      "emails",
      "online",
      "offline",
      "webpage",
      "website",
      "internet",
      "cyber",
      "cybersecurity",
      "software",
      "hardware",
      "database",
      "api",
      "server",
      "servers",
      "cloud",
      "analytics",
      "automated",
      "automation",
    ]);

    // Common student vocabulary
    this.commonModernWords = new Set([
      "okay",
      "ok",
      "yeah",
      "gonna",
      "wanna",
      "gotta",
      "lot",
      "lots",
      "kinda",
      "sorta",
      "cause",
      "cuz",
    ]);
  }

  async initializeDictionary() {
    return new Promise((resolve, reject) => {
      SpellChecker.getDictionary("en-US", (err, dictionary) => {
        if (err) {
          console.error("Failed to load dictionary:", err);
          reject(err);
        } else {
          this.dictionary = dictionary;
          this.dictionaryReady = true;
          console.log("✅ Spell checker dictionary loaded");
          resolve();
        }
      });
    });
  }

  // ----------- NEW ---------

  /**
   * Generate feedback with OpenAI explanations
   */
  async generateEnhancedFeedback(params) {
    const {
      text,
      studentLevel,
      score,
      qualityScores,
      grammarErrors,
      spellingErrors,
      essayStructure,
      levelSpecific = false
      // ... other params
    } = params;

    console.log("🤖 Generating enhanced feedback with OpenAI...");

    // Generate base feedback (your existing method)
    const baseFeedback = await this.generate(params);

    // OpenAI-enhanced explanations
    const enhancedFeedback = await this.addAIExplanations(
      baseFeedback,
      text,
      score,
      qualityScores,
      grammarErrors,
      essayStructure,
      studentLevel
    );

    return enhancedFeedback;
  }

  /**
   * AI-powered explanations to feedback
   */
  async addAIExplanations(
    baseFeedback,
    essayText,
    score,
    qualityScores,
    grammarErrors,
    essayStructure,
    studentLevel
  ) {
    try {
      // 1. Get detailed score explanation
      const scoreExplanation =
        await EnhancedOpenAIService.generateScoreExplanation(
          score,
          qualityScores,
          essayText,
          studentLevel
        );

      // 2. Get argument structure analysis
      const argumentAnalysis =
        await EnhancedOpenAIService.analyzeArgumentStructure(
          essayText,
          essayStructure
        );

      // 3. Get contextual examples
      const contextualExamples =
        await EnhancedOpenAIService.generateContextualExamples(
          grammarErrors,
          essayText,
          studentLevel
        );

      // 4. Get writing pattern analysis
      const patternAnalysis =
        await EnhancedOpenAIService.analyzeWritingPatterns(essayText);

      // Merge AI-enhanced content into feedback
      return {
        ...baseFeedback,

        // Enhanced content feedback
        contentFeedback: this.enhanceContentFeedback(
          baseFeedback.contentFeedback,
          scoreExplanation,
          argumentAnalysis
        ),

        // Enhanced before/after examples
        beforeAfterExamples: [
          ...(baseFeedback.beforeAfterExamples || []),
          ...contextualExamples,
        ].slice(0, 5),

        // Add pattern analysis
        writingPatterns: patternAnalysis.patternAnalysis,

        // Enhanced assessment summary
        assessmentSummary: this.enhanceAssessmentSummary(
          baseFeedback.assessmentSummary,
          scoreExplanation,
          argumentAnalysis
        ),

        // Add detailed explanations
        detailedExplanations: {
          scoreBreakdown: scoreExplanation.scoreExplanation,
          argumentStructure: argumentAnalysis.argumentAnalysis,
          specificRecommendations: this.generateSpecificRecommendations(
            scoreExplanation,
            argumentAnalysis,
            patternAnalysis
          ),
        },
      };
    } catch (error) {
      console.error("AI explanation enhancement failed:", error);
      return baseFeedback; // Fallback to original feedback
    }
  }

  /**
   *  Enhance content feedback with specific examples
   */
  enhanceContentFeedback(
    baseContentFeedback,
    scoreExplanation,
    argumentAnalysis
  ) {
    const enhanced = { ...baseContentFeedback };

    // Add specific examples from AI analysis
    if (scoreExplanation?.scoreExplanation?.specificExamples) {
      enhanced.examples = [
        ...(enhanced.examples || []),
        ...scoreExplanation.scoreExplanation.specificExamples,
      ];
    }

    // Add argument-specific feedback
    if (argumentAnalysis?.argumentAnalysis) {
      const argAnalysis = argumentAnalysis.argumentAnalysis;

      if (
        argAnalysis.thesisClarity === "unclear" ||
        argAnalysis.thesisClarity === "missing"
      ) {
        enhanced.improvements.push(
          "Your thesis statement needs to be clearer and more specific"
        );
      }

      if (argAnalysis.specificIssues && argAnalysis.specificIssues.length > 0) {
        enhanced.improvements.push(
          ...argAnalysis.specificIssues.map(
            (issue) => `${issue.type.replace("_", " ")}: ${issue.suggestion}`
          )
        );
      }

      // Add strengths from argument analysis
      if (argAnalysis.strengths && argAnalysis.strengths.length > 0) {
        enhanced.strengths = [...enhanced.strengths, ...argAnalysis.strengths];
      }
    }

    return enhanced;
  }

  /**
   * Enhance assessment summary with specific insights
   */
  enhanceAssessmentSummary(baseSummary, scoreExplanation, argumentAnalysis) {
    const enhanced = { ...baseSummary };

    if (scoreExplanation?.scoreExplanation) {
      const explanation = scoreExplanation.scoreExplanation;

      enhanced.overallComment =
        explanation.overallReason || enhanced.overallComment;

      // Add specific improvement areas
      if (
        explanation.improvementAreas &&
        explanation.improvementAreas.length > 0
      ) {
        enhanced.weaknesses = [
          ...enhanced.weaknesses,
          ...explanation.improvementAreas,
        ].slice(0, 5);
      }

      // Add specific strengths
      if (explanation.strengths && explanation.strengths.length > 0) {
        enhanced.strengths = [
          ...enhanced.strengths,
          ...explanation.strengths,
        ].slice(0, 5);
      }

      enhanced.improvementFocus =
        explanation.nextSteps?.[0] || enhanced.improvementFocus;
    }

    return enhanced;
  }

  /**
   * Generate specific recommendations from AI analysis
   */
  generateSpecificRecommendations(
    scoreExplanation,
    argumentAnalysis,
    patternAnalysis
  ) {
    const recommendations = [];

    // From score explanation
    if (scoreExplanation?.scoreExplanation?.nextSteps) {
      recommendations.push(...scoreExplanation.scoreExplanation.nextSteps);
    }

    // From argument analysis
    if (argumentAnalysis?.argumentAnalysis?.specificIssues) {
      argumentAnalysis.argumentAnalysis.specificIssues.forEach((issue) => {
        recommendations.push(`In ${issue.location}: ${issue.suggestion}`);
      });
    }

    // From pattern analysis
    if (patternAnalysis?.patternAnalysis) {
      const patterns = patternAnalysis.patternAnalysis;

      if (patterns.sentenceVariety?.suggestion) {
        recommendations.push(patterns.sentenceVariety.suggestion);
      }

      if (patterns.wordChoice?.suggestions) {
        recommendations.push(
          `Try using: ${patterns.wordChoice.suggestions.slice(0, 2).join(", ")}`
        );
      }
    }

    return recommendations.slice(0, 5);
  }

  // -----------------------

  /**
   * MAIN FEEDBACK GENERATION METHOD
   * Generates complete feedback object matching JSON structure
   */
  async generate(params) {
    const {
      text,
      studentLevel,
      studentProfile,
      persistentIssues,
      score,
      qualityScores,
      recentPerformance,
      ocrCorrections,
      grammarErrors = [],
      spellingErrors = [],
      essayStructure = null,
    } = params;

    if (!this.dictionaryReady) {
      await this.initializeDictionary();
    }

    console.log("📝 Generating comprehensive feedback...");

    const analysis = this.analyzeEssay(text, essayStructure);

    // ✅ Style suggestions
    const styleSuggestions = this.detectStyleSuggestions(text, studentLevel);

    // ✅ Generate feedback messages for each category
    const grammarFeedbackMessage = this.generateGrammarFeedbackMessage(
      grammarErrors,
      studentLevel
    );
    const spellingFeedbackMessage = this.generateSpellingFeedbackMessage(
      spellingErrors,
      studentLevel
    );
    const styleFeedbackMessage =
      styleSuggestions.length > 0
        ? this.generateStyleFeedback(styleSuggestions, studentLevel)
        : null;

    // ✅ Generate before/after examples with explanations
    const beforeAfterExamples = await this.generateBeforeAfterExamples(
      text,
      grammarErrors,
      spellingErrors,
      styleSuggestions,
      studentLevel
    );

    // ✅ Generate positive feedback
    const positiveFeedback = this.generatePositiveFeedback(
      text,
      studentLevel,
      analysis
    );

    // ✅ Generate vocabulary enhancements
    const vocabularyEnhancements = await this.suggestVocabularyEnhancements(
      text,
      studentLevel,
      analysis
    );

    // ✅ Analyze sentence structure
    const sentenceStructure = this.analyzeSentenceStructure(
      analysis,
      studentLevel
    );

    // ✅ Generate content feedback
    const contentFeedback = this.generateContentFeedback(
      analysis,
      qualityScores.content,
      studentLevel
    );

    // ✅ Generate organization feedback
    const organizationFeedback = this.generateOrganizationFeedback(
      analysis,
      qualityScores.organization,
      studentLevel,
      essayStructure
    );

    // ✅ Generate personalized summary
    const summary = this.generatePersonalizedSummary({
      score,
      studentLevel,
      persistentIssues,
      recentPerformance,
      qualityScores,
      analysis,
      grammarErrors,
      spellingErrors,
      styleSuggestions,
    });

    // ✅ Generate assessment summary
    const assessmentSummary = this.generateAssessmentSummary(
      grammarErrors,
      spellingErrors,
      styleSuggestions,
      qualityScores,
      studentLevel
    );

    // ✅ Generate next step recommendations
    const nextStepRecommendations = this.generateNextStepRecommendations(
      grammarErrors,
      spellingErrors,
      qualityScores,
      studentLevel,
      analysis
    );

    // ✅ Generate motivational message
    const motivationalMessage = this.generateMotivationalMessage(
      score,
      studentLevel,
      recentPerformance
    );

    const structureInfo = this.generateStructureInfo(essayStructure, analysis);

    // ✅ Compile complete feedback object
    const feedback = {
      // Core feedback data
      studentLevel,

      // Grammar feedback
      grammarErrors,
      grammarFeedbackMessage,

      // Spelling feedback
      spellingErrors,
      spellingFeedbackMessage,

      // Style feedback
      styleSuggestions,
      styleFeedbackMessage,

      // Enhanced feedback
      vocabularyEnhancements,
      sentenceStructure,
      positiveFeedback,
      beforeAfterExamples,

      // Content & Organization
      contentFeedback,
      organizationFeedback,

      // Structure analysis
      structureInfo,

      // Assessment summary
      assessmentSummary,

      // Summary and guidance
      summary,
      nextStepRecommendations,
      motivationalMessage,

      // Metadata
      analysisMetadata: {
        wordsAnalyzed: analysis.wordCount,
        sentencesAnalyzed: analysis.sentenceCount,
        paragraphsAnalyzed: analysis.paragraphCount,
        vocabularyDiversity: Math.round(analysis.vocabularyDiversity * 100),
        avgSentenceLength: Math.round(analysis.avgSentenceLength),
      },
    };

    console.log("✅ Feedback generation complete");
    return feedback;
  }

  /**
   * Generate structure information for feedback
   */
  generateStructureInfo(essayStructure, analysis) {
    if (
      !essayStructure ||
      !essayStructure.paragraphs ||
      essayStructure.paragraphs.length === 0
    ) {
      return {
        hasStructure: false,
        message: "No clear structure detected",
      };
    }

    return {
      hasStructure: true,
      title: essayStructure.title || null,
      sectionCount: essayStructure.sections.length,
      sections: essayStructure.sections,
      paragraphCount: essayStructure.paragraphs.length,
      message: `Essay has clear structure with ${essayStructure.sections.length} sections and ${essayStructure.paragraphs.length} paragraphs`,
      sectionsDetected: essayStructure.sections.map((section, index) => ({
        order: index + 1,
        title: section,
        paragraphsInSection: essayStructure.paragraphs.filter(
          (p) => p.section === section
        ).length,
      })),
    };
  }

  // ==================== FEEDBACK MESSAGE GENERATORS ====================

  /**
   * Generate grammar feedback message based on student level
   */
  generateGrammarFeedbackMessage(grammarErrors, studentLevel) {
    const errorCount = grammarErrors.length;

    if (errorCount === 0) {
      return this.generateNoErrorFeedback("grammar", studentLevel);
    }

    const messages = {
      beginner: {
        few: "Great effort! You have a few grammar mistakes to fix. Let's work on them together!",
        some: "You're making good progress! Let's focus on these grammar areas to improve your writing.",
        many: "Don't worry! Grammar takes practice. Let's look at these common mistakes and learn how to fix them.",
      },
      intermediate: {
        few: "Good work! You have some minor grammar issues to polish.",
        some: "Solid writing! Focus on these grammar improvements to make your essay even stronger.",
        many: "Pay attention to these grammar patterns. Improving them will significantly enhance your writing quality.",
      },
      advanced: {
        few: "Strong grammatical control with minor refinements needed.",
        some: "Good grammatical accuracy with some areas for improvement.",
        many: "Several grammatical issues detected. Review the highlighted corrections for academic precision.",
      },
    };

    const levelMessages = messages[studentLevel] || messages.intermediate;

    if (errorCount <= 3) return levelMessages.few;
    if (errorCount <= 8) return levelMessages.some;
    return levelMessages.many;
  }

  /**
   * Generate spelling feedback message based on student level
   */
  generateSpellingFeedbackMessage(spellingErrors, studentLevel) {
    const errorCount = spellingErrors.length;

    if (errorCount === 0) {
      return this.generateNoErrorFeedback("spelling", studentLevel);
    }

    const messages = {
      beginner: {
        few: "Nice job! Just a few spelling mistakes to correct.",
        some: "Good spelling overall! Let's fix these common spelling errors.",
        many: "Spelling practice will help! Pay attention to these words and their correct spellings.",
      },
      intermediate: {
        few: "Good spelling accuracy with minor corrections needed.",
        some: "Watch out for these spelling patterns. Using spell check can help catch these.",
        many: "Several spelling errors detected. Consider using a spell checker while writing.",
      },
      advanced: {
        few: "Minor spelling refinements needed for professional accuracy.",
        some: "Some spelling inconsistencies detected. Review for academic precision.",
        many: "Multiple spelling errors affecting writing quality. Focus on proofreading.",
      },
    };

    const levelMessages = messages[studentLevel] || messages.intermediate;

    if (errorCount <= 2) return levelMessages.few;
    if (errorCount <= 5) return levelMessages.some;
    return levelMessages.many;
  }

  /**
   * Generate style feedback message
   */
  generateStyleFeedback(styleSuggestions, studentLevel) {
    if (styleSuggestions.length === 0) return null;

    const messages = {
      beginner:
        "Great ideas! A few small changes can make your writing even clearer.",
      intermediate:
        "Good writing! Some style adjustments could make your essay more effective.",
      advanced:
        "Strong writing! Minor stylistic refinements could enhance academic tone.",
    };

    return messages[studentLevel] || messages.intermediate;
  }

  /**
   * Generate no error feedback (when student has no errors)
   */
  generateNoErrorFeedback(category, studentLevel) {
    const messages = {
      grammar: {
        beginner:
          "🎉 Excellent! No grammar errors detected. You're building strong writing skills!",
        intermediate:
          "✅ Great grammar! Your sentences are well-constructed and accurate.",
        advanced:
          "Outstanding grammatical accuracy! Professional-level writing demonstrated.",
      },
      spelling: {
        beginner:
          "🎉 Perfect spelling! All words are spelled correctly. Great attention to detail!",
        intermediate:
          "✅ Excellent spelling accuracy! No errors detected in your writing.",
        advanced:
          "Flawless spelling throughout your essay. Impressive attention to detail.",
      },
    };

    return (
      messages[category]?.[studentLevel] ||
      messages[category]?.intermediate ||
      "No errors detected!"
    );
  }

  // ==================== ASSESSMENT SUMMARY ====================

  /**
   * Generate comprehensive assessment summary
   */
  generateAssessmentSummary(
    grammarErrors,
    spellingErrors,
    styleSuggestions,
    qualityScores,
    studentLevel
  ) {
    const overallComment = this.generateOverallComment(
      qualityScores,
      studentLevel
    );
    const strengths = this.identifyStrengths(
      qualityScores,
      grammarErrors,
      spellingErrors
    );
    const weaknesses = this.identifyWeaknesses(
      qualityScores,
      grammarErrors,
      spellingErrors,
      styleSuggestions
    );
    const improvementFocus = this.generateImprovementFocus(
      weaknesses,
      studentLevel
    );

    return {
      overallComment,
      strengths,
      weaknesses,
      improvementFocus,
    };
  }

  generateOverallComment(qualityScores, studentLevel) {
    const avgQuality =
      (qualityScores.grammar +
        qualityScores.content +
        qualityScores.organization +
        qualityScores.style +
        qualityScores.mechanics) /
      5;

    const comments = {
      beginner: {
        excellent:
          "🎉 Amazing work! You're learning quickly and showing great progress!",
        good: "👍 Good job! You're making great progress with your writing!",
        needsWork:
          "💪 Great effort! Writing takes practice - you'll get better!",
      },
      intermediate: {
        excellent: "🌟 Excellent essay! Strong writing skills demonstrated.",
        good: "📚 Solid work! Continue practicing to improve further.",
        needsWork: "📝 Good attempt! Focus on the feedback to improve.",
      },
      advanced: {
        excellent: "💫 Outstanding work! Professional-level writing quality.",
        good: "✅ Good essay with clear potential for refinement.",
        needsWork:
          "🔍 The essay shows potential but needs refinement in key areas.",
      },
    };

    const level = comments[studentLevel] || comments.intermediate;

    if (avgQuality >= 0.8) return level.excellent;
    if (avgQuality >= 0.65) return level.good;
    return level.needsWork;
  }

  identifyStrengths(qualityScores, grammarErrors, spellingErrors) {
    const strengths = [];

    if (qualityScores.content >= 0.75) {
      strengths.push("Strong content with well-developed ideas and arguments");
    }

    if (qualityScores.organization >= 0.75) {
      strengths.push("Good essay structure with clear organization");
    }

    if (grammarErrors.length === 0) {
      strengths.push("Excellent grammar accuracy throughout the essay");
    } else if (grammarErrors.length <= 3) {
      strengths.push("Good grammatical control with minimal errors");
    }

    if (spellingErrors.length === 0) {
      strengths.push("Perfect spelling with no errors detected");
    }

    if (qualityScores.style >= 0.7) {
      strengths.push("Appropriate writing style and tone for the essay type");
    }

    // Ensure at least one strength
    if (strengths.length === 0) {
      strengths.push("Shows effort and engagement with the writing task");
    }

    return strengths;
  }

  identifyWeaknesses(
    qualityScores,
    grammarErrors,
    spellingErrors,
    styleSuggestions
  ) {
    const weaknesses = [];

    if (qualityScores.grammar < 0.65) {
      weaknesses.push(
        `Grammar accuracy needs improvement (${grammarErrors.length} errors detected)`
      );
    }

    if (qualityScores.content < 0.6) {
      weaknesses.push(
        "Content development could be stronger with more detailed examples"
      );
    }

    if (qualityScores.organization < 0.6) {
      weaknesses.push(
        "Essay organization needs improvement for better clarity"
      );
    }

    if (spellingErrors.length > 5) {
      weaknesses.push(
        `Multiple spelling errors (${spellingErrors.length} found) affect readability`
      );
    }

    if (styleSuggestions.length > 5) {
      weaknesses.push(
        "Informal language and vague expressions reduce academic tone"
      );
    }

    return weaknesses;
  }

  generateImprovementFocus(weaknesses, studentLevel) {
    if (weaknesses.length === 0) {
      return "Continue practicing to maintain your strong writing skills!";
    }

    const priorities = {
      beginner:
        "Focus on grammar basics and spelling accuracy in your next essay.",
      intermediate:
        "Work on refining grammar and strengthening your arguments with specific examples.",
      advanced:
        "Polish your grammar for academic precision and enhance vocabulary variety.",
    };

    return priorities[studentLevel] || priorities.intermediate;
  }

  // ==================== BEFORE/AFTER EXAMPLES ====================

  /**
   * Generate before/after examples with level-appropriate explanations
   */
  async generateBeforeAfterExamples(
    text,
    grammarErrors,
    spellingErrors,
    styleSuggestions,
    studentLevel
  ) {
    const examples = [];
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
    const usedExamples = new Set();

    console.log("🎯 Generating leveled before/after examples...");

    // 1. Grammar Examples (Top 2)
    if (grammarErrors.length > 0) {
      const grammarExamples = grammarErrors
        .filter(
          (error) => error.confidence > 0.7 && !usedExamples.has(error.original)
        )
        .slice(0, 2);

      for (const error of grammarExamples) {
        usedExamples.add(error.original);

        examples.push({
          type: "grammar",
          issue: this.getGrammarIssueDescription(error, studentLevel),
          before: error.original,
          after: error.correction,
          explanation:
            error.explanation ||
            this.getFallbackExplanation(error, studentLevel),
          severity: error.severity || "moderate",
          word_changed: {
            from: error.issueWord || this.extractMainWord(error.original),
            to: this.extractMainWord(error.correction),
          },
        });
      }
    }

    // 2. Spelling Examples (Top 2)
    if (spellingErrors.length > 0 && examples.length < 4) {
      const spellingExamples = spellingErrors
        .filter(
          (error) => error.severity !== "minor" && !usedExamples.has(error.word)
        )
        .slice(0, 2);

      for (const error of spellingExamples) {
        usedExamples.add(error.word);

        const sentenceWithError = this.findSentenceContaining(
          sentences,
          error.word
        );
        if (sentenceWithError) {
          const correctedSentence = sentenceWithError.replace(
            new RegExp(`\\b${this.escapeRegex(error.word)}\\b`, "gi"),
            error.correction
          );

          examples.push({
            type: "spelling",
            issue: `Spelling: "${error.word}" → "${error.correction}"`,
            before: sentenceWithError,
            after: correctedSentence,
            explanation: this.getSpellingExplanation(error, studentLevel),
            severity: error.severity,
            word_changed: {
              from: error.word,
              to: error.correction,
            },
          });
        }
      }
    }

    // 3. Style Examples (Top 1)
    if (styleSuggestions.length > 0 && examples.length < 5) {
      const styleExample = styleSuggestions[0];
      const sentenceWithIssue = this.findSentenceContaining(
        sentences,
        styleExample.text
      );

      if (sentenceWithIssue && !usedExamples.has(sentenceWithIssue)) {
        const improved = this.improveStyleSentence(
          sentenceWithIssue,
          styleExample
        );

        if (improved !== sentenceWithIssue) {
          examples.push({
            type: "style",
            issue: `Style: ${styleExample.type.replace(/_/g, " ")}`,
            before: sentenceWithIssue,
            after: improved,
            explanation: styleExample.explanation,
            severity: "suggestion",
            isSuggestion: true,
          });
        }
      }
    }

    console.log(
      `Generated ${examples.length} leveled before/after examples`
    );
    return examples.slice(0, 5);
  }

  getGrammarIssueDescription(error, studentLevel) {
    const descriptions = {
      subject_verb_agreement: {
        beginner: "Subject-verb agreement",
        intermediate: "Subject-verb agreement error",
        advanced: "Subject-verb agreement inconsistency",
      },
      verb_tense: {
        beginner: "Verb tense",
        intermediate: "Verb tense error",
        advanced: "Verb tense inconsistency",
      },
      pronoun_confusion: {
        beginner: "Word confusion",
        intermediate: "Pronoun usage error",
        advanced: "Pronoun reference issue",
      },
      article_usage: {
        beginner: "Missing word",
        intermediate: "Article usage error",
        advanced: "Article usage inconsistency",
      },
    };

    const typeDesc = descriptions[error.type] || {
      beginner: "Grammar improvement",
      intermediate: "Grammar error",
      advanced: "Grammatical issue",
    };

    return typeDesc[studentLevel] || typeDesc.intermediate;
  }

  getSpellingExplanation(error, studentLevel) {
    const commonWords = {
      peoples: {
        beginner:
          "Use 'people' for more than one person. Use 'people's' to show something belongs to people.",
        intermediate:
          "'Peoples' is incorrect. Use 'people' for plural or 'people's' for possessive.",
        advanced:
          "The correct form is 'people' (plural) or 'people's' (possessive).",
      },
      alot: {
        beginner: "Write 'a lot' as two separate words.",
        intermediate: "'A lot' should be written as two words: 'a lot'.",
        advanced: "The correct spelling is 'a lot' (two words).",
      },
      their: {
        beginner:
          "Use 'their' for something that belongs to people. Use 'there' for a place.",
        intermediate:
          "Remember: 'their' shows ownership, 'there' indicates location.",
        advanced:
          "Distinguish between possessive 'their' and locative 'there'.",
      },
    };

    const wordExplanation = commonWords[error.word.toLowerCase()];
    if (wordExplanation) {
      return wordExplanation[studentLevel] || wordExplanation.intermediate;
    }

    const generalExplanations = {
      beginner: `"${error.word}" is spelled "${error.correction}". This is a common spelling word.`,
      intermediate: `The correct spelling is "${error.correction}", not "${error.word}".`,
      advanced: `Spelling correction: "${error.word}" → "${error.correction}"`,
    };

    return (
      generalExplanations[studentLevel] || generalExplanations.intermediate
    );
  }

  getFallbackExplanation(error, studentLevel) {
    const explanations = {
      beginner: `**What's Wrong:** ${error.reason || "This needs correction"}

**The Rule:** This is a common grammar rule that helps make your writing clearer.

**In Your Essay:**
❌ "${error.original}"
✅ "${error.correction}"

**Memory Tip:** Practice this correction in your next essay!`,

      intermediate: `**Issue:** ${error.reason || "Grammar improvement needed"}

**Correction:**
❌ "${error.original}"
✅ "${error.correction}"

**Rule:** ${error.type ? error.type.replace(/_/g, " ") : "Grammar rule"}`,

      advanced: `**Issue:** ${error.reason || "Grammatical correction needed"}

❌ "${error.original}" → ✅ "${error.correction}"`,
    };

    return explanations[studentLevel] || explanations.intermediate;
  }

  // ==================== POSITIVE FEEDBACK ====================

  /**
   * Generate positive feedback highlighting good aspects
   */
  generatePositiveFeedback(text, studentLevel, analysis) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const positiveFeedback = [];
    const usedSentences = new Set();

    sentences.forEach((sentence, idx) => {
      if (usedSentences.has(sentence) || positiveFeedback.length >= 3) return;

      const words = sentence.trim().split(/\s+/);
      const hasGoodStructure = words.length >= 8 && words.length <= 25;
      const hasTransition =
        /^(however|furthermore|therefore|moreover|consequently|thus|additionally)/i.test(
          sentence.trim()
        );
      const hasGoodVocabulary =
        /\b(significant|demonstrate|illustrate|furthermore|consequently|essential|crucial)\b/i.test(
          sentence.toLowerCase()
        );

      if (hasGoodStructure || hasTransition || hasGoodVocabulary) {
        let praise = "";

        if (hasGoodStructure) {
          praise =
            studentLevel === "beginner"
              ? "Great sentence length!"
              : "Excellent sentence structure!";
        }
        if (hasTransition) {
          praise = "Good use of transition words!";
        }
        if (hasGoodVocabulary) {
          praise = "Strong vocabulary choice!";
        }

        positiveFeedback.push({
          sentence:
            sentence.trim().substring(0, 100) +
            (sentence.length > 100 ? "..." : ""),
          praise,
          position: idx + 1,
        });

        usedSentences.add(sentence);
      }
    });

    // Add general positive feedback if none found
    if (positiveFeedback.length === 0 && analysis.wordCount >= 100) {
      positiveFeedback.push({
        sentence: "Overall essay",
        praise: "Good effort in completing a full essay!",
        position: 0,
      });
    }

    return positiveFeedback;
  }

  // ==================== VOCABULARY ENHANCEMENTS ====================

  /**
   * Suggest vocabulary enhancements
   */
  async suggestVocabularyEnhancements(text, studentLevel, analysis) {
    if (studentLevel === "beginner") return [];

    const overusedWords = this.findOverusedWords(text);
    const suggestions = [];

    for (const word of overusedWords.slice(0, 3)) {
      try {
        const alternatives = await this.getWordAlternatives(word);
        if (alternatives.length > 0) {
          suggestions.push({
            original: word,
            alternatives: alternatives.slice(0, 3),
            reason: this.getVocabularySuggestionReason(word, studentLevel),
            frequency: this.countWordFrequency(text, word),
          });
        }
      } catch (error) {
        continue;
      }
    }

    return suggestions;
  }

  findOverusedWords(text) {
    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const frequency = {};
    const ignore = new Set([
      "the",
      "and",
      "that",
      "this",
      "with",
      "for",
      "have",
      "are",
      "were",
      "from",
      "been",
    ]);

    words.forEach((word) => {
      if (!ignore.has(word)) {
        frequency[word] = (frequency[word] || 0) + 1;
      }
    });

    return Object.entries(frequency)
      .filter(([word, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);
  }

  async getWordAlternatives(word) {
    if (this.definitionCache.has(word)) {
      return this.definitionCache.get(word);
    }

    const simpleSynonyms = {
      very: ["extremely", "highly", "remarkably", "exceptionally"],
      good: ["excellent", "great", "wonderful", "superb"],
      bad: ["poor", "negative", "unfavorable", "detrimental"],
      important: ["significant", "crucial", "essential", "vital"],
      big: ["large", "substantial", "considerable", "significant"],
      small: ["minor", "modest", "limited", "moderate"],
      many: ["numerous", "multiple", "various", "several"],
      thing: ["aspect", "element", "factor", "component"],
      get: ["obtain", "acquire", "receive", "gain"],
      make: ["create", "produce", "generate", "develop"],
      use: ["utilize", "employ", "apply", "implement"],
    };

    const result = simpleSynonyms[word.toLowerCase()] || [];
    this.definitionCache.set(word, result);
    return result;
  }

  getVocabularySuggestionReason(word, studentLevel) {
    const reasons = {
      beginner: `Try using different words instead of "${word}" to make your writing more interesting.`,
      intermediate: `"${word}" appears frequently. Consider varying your vocabulary for better style.`,
      advanced: `The repeated use of "${word}" could be diversified to enhance lexical variety.`,
    };

    return reasons[studentLevel] || reasons.intermediate;
  }

  countWordFrequency(text, word) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  // ==================== SENTENCE STRUCTURE ANALYSIS ====================

  /**
   * Analyze sentence structure and provide suggestions
   */
  analyzeSentenceStructure(analysis, studentLevel) {
    const issues = [];
    const suggestions = [];

    const { avgSentenceLength, sentenceCount } = analysis;

    if (avgSentenceLength < 8) {
      suggestions.push({
        issue: "Short sentences",
        suggestion: "Try combining some short sentences to create more variety",
        priority: "medium",
      });
    } else if (avgSentenceLength > 25) {
      suggestions.push({
        issue: "Long sentences",
        suggestion:
          "Consider breaking down some long sentences for better clarity",
        priority: "high",
      });
    }

    if (analysis.paragraphCount > 0) {
      const avgParagraphLength = analysis.wordCount / analysis.paragraphCount;
      if (avgParagraphLength > 200) {
        suggestions.push({
          issue: "Long paragraphs",
          suggestion:
            "Consider breaking long paragraphs into smaller ones for better readability",
          priority: "medium",
        });
      }
    }

    // Check sentence variety
    if (sentenceCount >= 5) {
      const varietyScore = this.calculateSentenceVariety(analysis);
      if (varietyScore < 0.5) {
        suggestions.push({
          issue: "Limited sentence variety",
          suggestion: "Use a mix of simple, compound, and complex sentences",
          priority: "medium",
        });
      }
    }

    return {
      issues,
      suggestions: suggestions.slice(0, 3),
      metrics: {
        avgSentenceLength: avgSentenceLength.toFixed(1),
        sentenceVariety: sentenceCount > 10 ? "Good" : "Could use more variety",
        avgParagraphLength:
          analysis.paragraphCount > 0
            ? Math.round(analysis.wordCount / analysis.paragraphCount)
            : 0,
        sentenceCount: sentenceCount,
      },
    };
  }

  calculateSentenceVariety(analysis) {
    // Simple variety score based on sentence length diversity
    return Math.min(1, analysis.vocabularyDiversity * 2);
  }

  // ==================== CONTENT FEEDBACK ====================

  /**
   * Generate content-specific feedback
   */
  generateContentFeedback(analysis, contentScore, studentLevel) {
    const strengths = [];
    const improvements = [];
    const examples = [];

    if (analysis.hasThesis) {
      strengths.push("Clear thesis statement present");
    } else {
      const thesisSuggestions = {
        beginner: "Add a sentence that says what your essay is about",
        intermediate: "Include a clear thesis statement in your introduction",
        advanced: "Consider adding a more explicit thesis statement",
      };
      improvements.push(
        thesisSuggestions[studentLevel] || thesisSuggestions.intermediate
      );

      examples.push({
        type: "thesis_example",
        text: "Example: 'While social media offers many benefits, it also presents significant challenges that require careful consideration.'",
        explanation: "Place your thesis at the end of your introduction",
      });
    }

    if (analysis.transitions.length < 3) {
      const transitionSuggestions = {
        beginner:
          "Use words like 'also', 'but', and 'so' to connect your ideas",
        intermediate: "Add more transition words to connect your paragraphs",
        advanced: "Incorporate more sophisticated transitional phrases",
      };
      improvements.push(
        transitionSuggestions[studentLevel] ||
          transitionSuggestions.intermediate
      );

      examples.push({
        type: "transitions",
        text: "Try: 'Furthermore', 'However', 'Therefore', 'Consequently'",
        explanation: "Transitions help readers follow your argument",
      });
    }

    // Check for supporting details
    if (contentScore < 0.65) {
      improvements.push(
        "Add more specific examples and details to support your arguments"
      );
    } else {
      strengths.push("Good use of supporting details and examples");
    }

    return { strengths, improvements, examples };
  }

  // ==================== ORGANIZATION FEEDBACK ====================

  /**
   * Generate organization-specific feedback
   */
  generateOrganizationFeedback(
    analysis,
    organizationScore,
    studentLevel,
    essayStructure = null
  ) {
    const feedback = {
      structure: "",
      suggestions: [],
      positives: [],
      organizationScore: Math.round(organizationScore * 100),
    };

    // Check structure-based organization
    if (
      essayStructure &&
      essayStructure.sections &&
      essayStructure.sections.length > 0
    ) {
      console.log("✅ Using structure-based organization feedback");

      const sections = essayStructure.sections.map((s) => s.toLowerCase());
      const hasIntro = sections.some((s) => /introduction|intro/i.test(s));
      const hasConclusion = sections.some((s) => /conclusion|summary/i.test(s));

      if (hasIntro && hasConclusion) {
        feedback.structure = "✅ Good essay structure with clear sections";
        feedback.positives.push(
          "Well-organized with introduction and conclusion"
        );
      } else if (!hasConclusion) {
        const conclusionMessages = {
          beginner:
            "Your essay is missing a conclusion. Try adding a final paragraph that summarizes your main points.",
          intermediate:
            "Consider adding a conclusion paragraph to summarize your key arguments.",
          advanced:
            "The essay would benefit from a concluding section to reinforce your main arguments.",
        };

        feedback.structure = "⚠️ Missing conclusion section";
        feedback.suggestions.push(
          conclusionMessages[studentLevel] || conclusionMessages.intermediate
        );
        feedback.organizationScore = Math.max(
          50,
          feedback.organizationScore - 20
        );
      } else if (!hasIntro) {
        feedback.structure = "⚠️ Missing introduction section";
        feedback.suggestions.push(
          "Add a clear introduction to set up your essay"
        );
      }
    } else {
      // Fallback to basic structure check
      if (!analysis.hasConclusion) {
        const conclusionMessages = {
          beginner:
            "Your essay is missing an ending. Try adding a final paragraph that summarizes your main points.",
          intermediate:
            "Consider adding a conclusion paragraph to summarize your key arguments.",
          advanced:
            "The essay would benefit from a concluding section to reinforce your main arguments.",
        };

        feedback.structure = "⚠️ Incomplete structure - missing conclusion";
        feedback.suggestions.push(
          conclusionMessages[studentLevel] || conclusionMessages.intermediate
        );
        feedback.organizationScore = Math.max(
          50,
          feedback.organizationScore - 20
        );
      } else if (analysis.paragraphCount >= 3) {
        feedback.structure = "✅ Good essay structure";
        feedback.positives.push(
          "Clear introduction, body, and conclusion present"
        );
      }
    }

    // Add level-appropriate transition suggestions
    const transitionTips = {
      beginner: "Use connecting words like 'first', 'next', and 'finally'",
      intermediate:
        "Use transition words (However, Therefore, Furthermore, etc.)",
      advanced:
        "Employ sophisticated transitional devices to enhance coherence",
    };

    feedback.suggestions.push(
      transitionTips[studentLevel] || transitionTips.intermediate
    );

    return feedback;
  }

  // ==================== PERSONALIZED SUMMARY ====================

  /**
   * Generate personalized summary with actionable insights
   */
  generatePersonalizedSummary(params) {
    const {
      score,
      studentLevel,
      qualityScores,
      analysis,
      grammarErrors,
      spellingErrors,
      styleSuggestions,
    } = params;

    const avgQuality =
      (qualityScores.grammar +
        qualityScores.content +
        qualityScores.organization +
        qualityScores.style +
        qualityScores.mechanics) /
      5;

    let overallComment = "";
    let motivationalMessage = "";
    const keyTakeaways = [];
    const nextSteps = [];

    // Level-appropriate feedback
    if (avgQuality >= 0.8) {
      const excellentMessages = {
        beginner: "🎉 Amazing work! You're learning quickly!",
        intermediate: "🌟 Excellent essay! Strong writing skills demonstrated.",
        advanced: "💫 Outstanding work! Professional-level writing quality.",
      };
      overallComment =
        excellentMessages[studentLevel] || excellentMessages.intermediate;
      motivationalMessage = "Keep up the great work!";
    } else if (avgQuality >= 0.65) {
      const goodMessages = {
        beginner: "👍 Good job! You're making great progress!",
        intermediate: "📚 Solid work! Continue practicing to improve further.",
        advanced: "✅ Good essay with clear potential for refinement.",
      };
      overallComment = goodMessages[studentLevel] || goodMessages.intermediate;
      motivationalMessage = "Practice makes perfect!";
    } else {
      const needsWorkMessages = {
        beginner:
          "💪 Great effort! Writing takes practice - you'll get better!",
        intermediate: "📝 Good attempt! Focus on the feedback to improve.",
        advanced:
          "🔍 The essay shows potential but needs refinement in key areas.",
      };
      overallComment =
        needsWorkMessages[studentLevel] || needsWorkMessages.intermediate;
      motivationalMessage = "Review the feedback and try again!";
    }

    // Key takeaways based on quality scores
    if (grammarErrors.length > 5) {
      keyTakeaways.push("Focus on grammar accuracy in your next essay");
    }
    if (qualityScores.organization < 0.6) {
      keyTakeaways.push("Work on essay structure and paragraph organization");
    }
    if (qualityScores.content < 0.7) {
      keyTakeaways.push("Develop your arguments with more specific examples");
    }
    if (spellingErrors.length > 5) {
      keyTakeaways.push("Review spelling of commonly misspelled words");
    }

    // Ensure at least one takeaway
    if (keyTakeaways.length === 0) {
      keyTakeaways.push("Continue practicing to build on your strengths");
    }

    // Next steps based on student level
    const nextStepsBase = {
      beginner: [
        "Read your essay out loud to catch mistakes",
        "Practice the grammar rules highlighted above",
        "Ask your teacher for help with difficult parts",
      ],
      intermediate: [
        "Review and correct all highlighted errors",
        "Add a clear thesis statement if missing",
        "Use transition words between paragraphs",
        "Read your essay aloud to catch awkward phrasing",
      ],
      advanced: [
        "Refine grammatical accuracy for academic precision",
        "Enhance vocabulary and stylistic elements",
        "Strengthen argument development with evidence",
        "Ensure logical flow between all paragraphs",
      ],
    };

    nextSteps.push(
      ...(nextStepsBase[studentLevel] || nextStepsBase.intermediate)
    );

    return {
      overallComment,
      motivationalMessage,
      keyTakeaways: keyTakeaways.slice(0, 3),
      nextSteps: nextSteps.slice(0, 4),
      wordsAnalyzed: analysis.wordCount,
      sentencesAnalyzed: analysis.sentenceCount,
    };
  }

  // ==================== NEXT STEP RECOMMENDATIONS ====================

  /**
   * Generate next step recommendations
   */
  generateNextStepRecommendations(
    grammarErrors,
    spellingErrors,
    qualityScores,
    studentLevel,
    analysis
  ) {
    const recommendations = [];

    // Grammar recommendations
    if (grammarErrors.length > 5) {
      recommendations.push({
        priority: "high",
        category: "grammar",
        recommendation:
          studentLevel === "beginner"
            ? "Practice basic grammar rules like subject-verb agreement"
            : "Review and practice the specific grammar patterns highlighted in your feedback",
        resources: ["Grammar practice worksheets", "Online grammar exercises"],
      });
    }

    // Spelling recommendations
    if (spellingErrors.length > 5) {
      recommendations.push({
        priority: "high",
        category: "spelling",
        recommendation:
          "Create a personal spelling list and practice these words daily",
        resources: ["Spell checker tools", "Vocabulary flashcards"],
      });
    }

    // Organization recommendations
    if (qualityScores.organization < 0.6) {
      recommendations.push({
        priority: "high",
        category: "organization",
        recommendation:
          studentLevel === "beginner"
            ? "Practice writing with clear beginning, middle, and end"
            : "Use paragraph planning techniques before writing",
        resources: [
          "Essay structure templates",
          "Paragraph organization guides",
        ],
      });
    }

    // Content recommendations
    if (qualityScores.content < 0.65) {
      recommendations.push({
        priority: "medium",
        category: "content",
        recommendation:
          "Add more specific examples and details to support your main ideas",
        resources: ["Example essay analysis", "Brainstorming techniques"],
      });
    }

    // Style recommendations
    if (qualityScores.style < 0.65) {
      recommendations.push({
        priority: "medium",
        category: "style",
        recommendation:
          "Practice using more varied vocabulary and sentence structures",
        resources: [
          "Vocabulary building exercises",
          "Sentence variety practice",
        ],
      });
    }

    // General recommendation
    if (recommendations.length === 0) {
      recommendations.push({
        priority: "low",
        category: "general",
        recommendation:
          "Continue practicing regularly to maintain your strong writing skills",
        resources: ["Writing prompts", "Peer review activities"],
      });
    }

    return recommendations.slice(0, 4);
  }

  // ==================== MOTIVATIONAL MESSAGE ====================

  /**
   * Generate motivational message based on performance
   */
  generateMotivationalMessage(score, studentLevel, recentPerformance) {
    const scorePercentage = score;

    const messages = {
      beginner: {
        excellent:
          "You're doing fantastic! Your writing is improving with every essay. Keep practicing!",
        good: "Great job! You're building strong writing skills. Every essay helps you grow!",
        needsWork:
          "Don't give up! Writing is a skill that improves with practice. Focus on the feedback and try again!",
      },
      intermediate: {
        excellent:
          "Outstanding work! Your dedication to improving your writing is paying off!",
        good: "You're making solid progress! Keep focusing on the areas highlighted in your feedback.",
        needsWork:
          "Stay motivated! Review the feedback carefully and apply it to your next essay.",
      },
      advanced: {
        excellent:
          "Exceptional work! Your writing demonstrates sophisticated skills and strong attention to detail.",
        good: "Strong performance! Continue refining your skills to reach the highest level.",
        needsWork:
          "Focus on the specific areas for improvement to enhance your already strong foundation.",
      },
    };

    const level = messages[studentLevel] || messages.intermediate;

    if (scorePercentage >= 85) return level.excellent;
    if (scorePercentage >= 70) return level.good;
    return level.needsWork;
  }

  // ==================== STYLE DETECTION ====================

  /**
   * Detect style suggestions with level-appropriate explanations
   */
  detectStyleSuggestions(text, studentLevel) {
    const suggestions = [];
    const seenPositions = new Set();

    const stylePatterns = [
      {
        pattern: /\b(a lot|lots of)\b/gi,
        type: "informal_expression",
        suggestion: "many/much",
        explanations: {
          beginner:
            "Use 'many' for things you can count (people, books) and 'much' for things you can't count (time, information).",
          intermediate:
            "Replace informal 'a lot' with more academic alternatives like 'many', 'much', or 'numerous'.",
          advanced:
            "Consider using more precise quantifiers instead of the informal 'a lot'.",
        },
      },
      {
        pattern: /\b(thing|stuff)\b/gi,
        type: "vague_language",
        suggestion: "more specific terms",
        explanations: {
          beginner:
            "Try to be more specific. Instead of 'thing', say what you really mean.",
          intermediate:
            "Use precise language to strengthen your arguments. Replace vague terms with specific ones.",
          advanced:
            "Employ more precise terminology to enhance the academic tone of your writing.",
        },
      },
      {
        pattern: /\b(got|getting)\b/gi,
        type: "informal_verb",
        suggestion: "received/obtaining/became",
        explanations: {
          beginner:
            "Use more formal words like 'received' or 'became' instead of 'got'.",
          intermediate:
            "Replace the informal verb 'got' with more academic alternatives.",
          advanced:
            "Consider using more formal verb choices to improve academic style.",
        },
      },
    ];

    stylePatterns.forEach(({ pattern, type, suggestion, explanations }) => {
      const matches = [...text.matchAll(pattern)];

      for (const match of matches) {
        const posKey = `${match.index}-${match[0]}`;
        if (seenPositions.has(posKey)) continue;
        seenPositions.add(posKey);

        suggestions.push({
          type: type,
          text: match[0],
          suggestion: suggestion,
          explanation: explanations[studentLevel] || explanations.intermediate,
          context: this.getContext(text, match[0]),
          position: {
            start: match.index,
            end: match.index + match[0].length,
          },
          category: "style",
          severity: "suggestion",
        });
      }
    });

    return suggestions.slice(0, 5);
  }

  // ==================== ESSAY ANALYSIS ====================

  /**
   * Analyze essay structure and content
   */
  analyzeEssay(text, essayStructure = null) {
    const doc = compromise(text);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
    const words = text.match(/\b\w+\b/g) || [];

    //  Use structure if provided
    let hasIntroduction = false;
    let hasConclusion = false;
    let paragraphCount = paragraphs.length;

    if (
      essayStructure &&
      essayStructure.sections &&
      essayStructure.sections.length > 0
    ) {
      console.log("✅ Using essay structure for analysis");

      // Check for introduction
      const firstSection = essayStructure.sections[0].toLowerCase();
      hasIntroduction = /introduction|intro/i.test(firstSection);

      // Check for conclusion
      const sections = essayStructure.sections.map((s) => s.toLowerCase());
      hasConclusion = sections.some((s) =>
        /conclusion|summary|closing/i.test(s)
      );

      // Use structure paragraph count
      if (essayStructure.paragraphs && essayStructure.paragraphs.length > 0) {
        paragraphCount = essayStructure.paragraphs.length;
      }
    } else {
      // Fallback to text-based detection
      hasIntroduction = this.hasIntroduction(paragraphs);
      hasConclusion = this.hasConclusion(paragraphs);
    }

    return {
      sentences,
      paragraphs,
      words,
      wordCount: words.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphCount,
      nouns: doc.nouns().out("array"),
      verbs: doc.verbs().out("array"),
      adjectives: doc.adjectives().out("array"),
      hasIntroduction: hasIntroduction,
      hasConclusion: hasConclusion,
      hasThesis: this.hasThesis(text),
      transitions: this.findTransitions(sentences),
      avgSentenceLength: words.length / Math.max(sentences.length, 1),
      vocabularyDiversity:
        new Set(words.map((w) => w.toLowerCase())).size /
        Math.max(words.length, 1),
      essayStructure: essayStructure,
    };
  }

  hasIntroduction(paragraphs) {
    if (paragraphs.length === 0) return false;
    const first = paragraphs[0].toLowerCase();
    return (
      paragraphs[0].split(/\s+/).length >= 30 ||
      /this essay|will discuss|will explore|focuses on|introduction/.test(first)
    );
  }

  hasConclusion(paragraphs) {
    if (paragraphs.length === 0) return false;
    const last = paragraphs[paragraphs.length - 1].toLowerCase();
    return /conclusion|in summary|to conclude|overall|therefore|finally/.test(
      last
    );
  }

  hasThesis(text) {
    const first500 = text.substring(0, 500).toLowerCase();
    return /will discuss|will explore|argue that|thesis|main argument|this essay will/.test(
      first500
    );
  }

  findTransitions(sentences) {
    const transitions = [
      "however",
      "therefore",
      "moreover",
      "furthermore",
      "consequently",
      "for example",
      "in addition",
      "similarly",
      "in contrast",
      "thus",
    ];
    const found = new Set();

    sentences.forEach((s) => {
      const lower = s.toLowerCase();
      transitions.forEach((t) => {
        if (lower.includes(t)) found.add(t);
      });
    });

    return Array.from(found);
  }

  // ==================== HELPER METHODS ====================

  getContext(text, word) {
    const index = text.indexOf(word);
    if (index === -1) return "";
    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + word.length + 40);
    return "..." + text.substring(start, end).trim() + "...";
  }

  findSentenceContaining(sentences, word) {
    if (!word) {
      console.warn(
        "⚠️ Warning: findSentenceContaining called with undefined word"
      );
      return null;
    }

    for (const sentence of sentences) {
      if (sentence && sentence.toLowerCase().includes(word.toLowerCase())) {
        return sentence;
      }
    }
    return null;
  }

  improveStyleSentence(sentence, styleIssue) {
    let improved = sentence;
    if (
      styleIssue.type === "informal_expression" &&
      styleIssue.text.toLowerCase().includes("a lot")
    ) {
      if (
        /a lot of (time|money|effort|work|attention|information)/i.test(
          sentence
        )
      ) {
        improved = sentence.replace(/a lot of/gi, "much");
      } else if (/a lot of (people|students|friends|things)/i.test(sentence)) {
        improved = sentence.replace(/a lot of/gi, "many");
      } else {
        improved = sentence.replace(/a lot/gi, "significantly");
      }
    } else if (
      styleIssue.type === "vague_language" &&
      styleIssue.text.toLowerCase().includes("thing")
    ) {
      improved = sentence.replace(/\bthing\b/gi, "aspect");
    } else if (
      styleIssue.type === "informal_verb" &&
      styleIssue.text.toLowerCase().includes("got")
    ) {
      improved = sentence.replace(/\bgot\b/gi, "received");
    }
    return improved;
  }

  extractMainWord(text) {
    const words = text.split(/\s+/);
    return words.find((word) => word.length > 3) || words[0] || "word";
  }

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// Enhanced FeedbackGenerator with level-aware feedback
class LevelAwareFeedbackGenerator extends FeedbackGenerator {
  
  generateLevelSpecificFeedback(params) {
    const { studentLevel, score, qualityScores, grammarErrors, spellingErrors } = params;
    
    const levelTemplates = {
      beginner: {
        // Focus on encouragement and basic patterns
        grammarFocus: "Let's work on these common patterns:",
        spellingFocus: "Practice these everyday words:",
        contentFocus: "Great ideas! Let's make them clearer.",
        nextSteps: [
          "Read your essay out loud",
          "Practice the highlighted corrections",
          "Ask for help when stuck"
        ]
      },
      intermediate: {
        // Focus on refinement and structure
        grammarFocus: "Refine these grammatical patterns:",
        spellingFocus: "Review academic vocabulary:",
        contentFocus: "Strengthen your arguments with evidence.",
        nextSteps: [
          "Use transition words between paragraphs",
          "Add specific examples",
          "Check subject-verb agreement"
        ]
      },
      advanced: {
        // Focus on precision and style
        grammarFocus: "Polish for academic precision:",
        spellingFocus: "Ensure technical accuracy:",
        contentFocus: "Develop sophisticated arguments.",
        nextSteps: [
          "Enhance vocabulary variety",
          "Refine thesis statement",
          "Improve logical flow"
        ]
      }
    };
    
    return levelTemplates[studentLevel] || levelTemplates.beginner;
  }

  generateProgressiveExamples(grammarErrors, studentLevel) {
    // Group errors by difficulty level
    const errorLevels = this.categorizeErrorsByDifficulty(grammarErrors);
    
    const examples = {
      beginner: errorLevels.basic.slice(0, 3),
      intermediate: [...errorLevels.basic.slice(0, 2), ...errorLevels.intermediate.slice(0, 2)],
      advanced: [...errorLevels.intermediate.slice(0, 2), ...errorLevels.advanced.slice(0, 2)]
    };
    
    return examples[studentLevel] || examples.beginner;
  }

  categorizeErrorsByDifficulty(errors) {
    const basicErrors = ['article_usage', 'basic_spelling', 'simple_verb_tense'];
    const intermediateErrors = ['subject_verb_agreement', 'pronoun_usage', 'preposition_usage'];
    const advancedErrors = ['complex_verb_forms', 'conditional_mood', 'subjunctive', 'parallel_structure'];
    
    return {
      basic: errors.filter(e => basicErrors.includes(e.type)),
      intermediate: errors.filter(e => intermediateErrors.includes(e.type)),
      advanced: errors.filter(e => advancedErrors.includes(e.type))
    };
  }
}

module.exports = FeedbackGenerator;
