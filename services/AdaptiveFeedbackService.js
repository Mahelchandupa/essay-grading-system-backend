require("dotenv").config();
const OpenAI = require("openai");

class AdaptiveFeedbackService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.cache = new Map();
  }

  /**
   * 🎯 MAIN: Generate comprehensive adaptive feedback
   */
  async generateCompleteFeedback(params) {
    const {
      essayText,
      studentLevel,
      score,
      qualityScores,
      grammarErrors,
      spellingErrors,
      essayStructure,
      studentHistory,
    } = params;

    console.log(
      `🤖 Generating Complete Adaptive Feedback for ${studentLevel}...`
    );

    try {
      // Run all analyses in parallel for efficiency
      const [
        scoreExplanation,
        errorAnalysis,
        vocabularyAnalysis,
        improvementPlan,
        futurePreventionTips,
      ] = await Promise.all([
        this.explainScoreWithReasons(
          essayText,
          score,
          qualityScores,
          studentLevel
        ),
        this.analyzeErrorsWithSolutions(
          grammarErrors,
          spellingErrors,
          essayText,
          studentLevel
        ),
        this.analyzeVocabularyUsage(essayText, studentLevel),
        this.generatePersonalizedImprovementPlan(
          essayText,
          qualityScores,
          studentLevel,
          studentHistory
        ),
        this.generateFuturePreventionStrategies(
          grammarErrors,
          spellingErrors,
          studentLevel
        ),
      ]);

      return {
        // 1. WHY THIS SCORE
        scoreExplanation,

        // 2. ERROR ANALYSIS
        errorAnalysis,

        // 3. VOCABULARY RECOMMENDATIONS
        vocabularyAnalysis,

        // 4. IMPROVEMENT PLAN
        improvementPlan,

        // 5. PREVENTION TIPS
        futurePreventionTips,

        // 6. OVERALL SUMMARY
        overallSummary: this.generateOverallSummary(
          score,
          studentLevel,
          scoreExplanation,
          improvementPlan
        ),
      };
    } catch (error) {
      console.error("❌ Adaptive feedback generation failed:", error);
      return this.getFallbackFeedback(params);
    }
  }

  /**
   * ✨ 1. Explain WHY student got this score
   */
  async explainScoreWithReasons(essayText, score, qualityScores, studentLevel) {
    const prompt = `As an expert writing tutor, explain to a ${studentLevel}-level student WHY they received a ${score}/100 score.

ESSAY EXCERPT:
"${essayText.substring(0, 1000)}"

QUALITY BREAKDOWN:
- Grammar: ${Math.round(qualityScores.grammar * 100)}/100
- Content: ${Math.round(qualityScores.content * 100)}/100
- Organization: ${Math.round(qualityScores.organization * 100)}/100
- Style: ${Math.round(qualityScores.style * 100)}/100
- Mechanics: ${Math.round(qualityScores.mechanics * 100)}/100

Provide ${
      studentLevel === "beginner"
        ? "SIMPLE, ENCOURAGING"
        : studentLevel === "intermediate"
        ? "CLEAR, CONSTRUCTIVE"
        : "DETAILED, PROFESSIONAL"
    } feedback.

Return EXACT JSON:
{
  "mainReason": "One clear sentence explaining the overall score",
  "whatWentWell": [
    {
      "aspect": "What they did well",
      "evidence": "Quote from their essay",
      "impact": "Why this is good"
    }
  ],
  "whatNeedsWork": [
    {
      "aspect": "What needs improvement",
      "evidence": "Quote from their essay",
      "impact": "Why this matters",
      "priority": "high|medium|low"
    }
  ],
  "categoryBreakdown": {
    "grammar": "Brief explanation with example",
    "content": "Brief explanation with example",
    "organization": "Brief explanation",
    "style": "Brief explanation"
  },
  "keyInsight": "The ONE most important thing they should focus on"
}

Use ${
      studentLevel === "beginner"
        ? "simple words and short sentences"
        : studentLevel === "intermediate"
        ? "clear explanations"
        : "precise academic language"
    }.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an encouraging ${studentLevel}-level writing tutor. Always quote actual text from the student's essay.`,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error("Score explanation error:", error);
      return this.getFallbackScoreExplanation(
        score,
        qualityScores,
        studentLevel
      );
    }
  }

  /**
   * ✨ 2. Analyze errors with HOW TO FIX + HOW TO AVOID
   */
  async analyzeErrorsWithSolutions(
    grammarErrors,
    spellingErrors,
    essayText,
    studentLevel
  ) {
    //  Filter out "correct" spelling errors
    const actualSpellingErrors = spellingErrors.filter(
      (e) =>
        e.word !== e.correction && // Only if correction is different
        !this.isModernWord(e.word) // And not a modern word
    );

    if (grammarErrors.length === 0 && spellingErrors.length === 0) {
      return {
        hasErrors: false,
        message: "✅ Excellent! No major errors detected.",
        details: [],
      };
    }

    const topErrors = [
      ...grammarErrors.slice(0, 3).map((e) => ({ ...e, errorType: "grammar" })),
      ...spellingErrors
        .slice(0, 2)
        .map((e) => ({ ...e, errorType: "spelling" })),
    ];

    const prompt = `Analyze these writing errors for a ${studentLevel}-level student. For EACH error, explain:
1. What's wrong (simple terms)
2. Why it matters
3. HOW TO FIX IT (step-by-step)
4. HOW TO AVOID in future essays
5. Memory trick

ERRORS:
${topErrors
  .map(
    (e, i) => `
${i + 1}. Type: ${e.errorType}
   Original: "${e.original || e.word}"
   Correction: "${e.correction}"
   Context: "${this.getContext(essayText, e.original || e.word)}"
`
  )
  .join("\n")}

Return EXACT JSON:
{
  "errorAnalysis": [
    {
      "errorNumber": 1,
      "type": "grammar|spelling",
      "original": "exact original text",
      "corrected": "corrected version",
      "whatsWrong": "${
        studentLevel === "beginner" ? "Simple explanation" : "Clear explanation"
      }",
      "whyItMatters": "Impact on writing quality",
      "howToFix": {
        "step1": "First thing to do",
        "step2": "Second thing to do",
        "step3": "Final check"
      },
      "howToAvoid": [
        "Prevention tip 1",
        "Prevention tip 2"
      ],
      "memoryTrick": "Easy way to remember",
      "similarMistakes": ["related error 1", "related error 2"]
    }
  ],
  "errorPatterns": {
    "mostCommon": "The pattern they repeat most",
    "focusArea": "The ONE thing to practice most"
  }
}

Use ${
      studentLevel === "beginner"
        ? "VERY SIMPLE language"
        : studentLevel === "intermediate"
        ? "CLEAR language"
        : "PRECISE language"
    }.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0].message.content);
      return {
        hasErrors: true,
        totalErrors: grammarErrors.length + spellingErrors.length,
        ...result,
      };
    } catch (error) {
      console.error("Error analysis failed:", error);
      return this.getFallbackErrorAnalysis(
        grammarErrors,
        spellingErrors,
        studentLevel
      );
    }
  }

  /**
   * Helper: Check if word is a modern term
   */
  isModernWord(word) {
    const modernWords = new Set([
      "selfies",
      "selfie",
      "influencers",
      "influencer",
      "online",
      "offline",
      "cyberbullying",
      "smartphone",
      "internet",
      "wifi",
      "app",
      "apps",
      "email",
    ]);
    return modernWords.has(word.toLowerCase());
  }

  /**
   * ✨ 3. Analyze vocabulary with specific recommendations
   */
  async analyzeVocabularyUsage(essayText, studentLevel) {
    const words = essayText.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const uniqueWords = [...new Set(words)];
    const diversity = ((uniqueWords.length / words.length) * 100).toFixed(1);

    const prompt = `Analyze vocabulary for a ${studentLevel}-level student and provide SPECIFIC, ACTIONABLE recommendations.

ESSAY EXCERPT:
"${essayText.substring(0, 1200)}"

STATS:
- Total words: ${words.length}
- Unique words: ${uniqueWords.length}
- Diversity: ${diversity}%

Provide ${
      studentLevel === "beginner"
        ? "SIMPLE"
        : studentLevel === "intermediate"
        ? "MODERATE"
        : "ADVANCED"
    } vocabulary improvements.

Return EXACT JSON:
{
  "currentLevel": "Assessment of their vocabulary",
  "overusedWords": [
    {
      "word": "overused word",
      "timesUsed": 5,
      "betterAlternatives": [
        {
          "word": "alternative",
          "whenToUse": "context for using it",
          "example": "Example sentence"
        }
      ]
    }
  ],
  "vocabularyUpgrades": [
    {
      "from": "basic word they used",
      "to": "better word",
      "meaning": "what it means",
      "example": "example in their topic context",
      "difficulty": "easy|medium|hard"
    }
  ],
  "topicSpecificWords": [
    {
      "word": "relevant advanced word",
      "meaning": "definition",
      "usage": "how to use it in their essay topic"
    }
  ],
  "practiceExercises": [
    {
      "exercise": "Specific exercise",
      "goal": "What it improves",
      "timeNeeded": "5-10 minutes"
    }
  ]
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0].message.content);
      return {
        ...result,
        statistics: {
          totalWords: words.length,
          uniqueWords: uniqueWords.length,
          diversity: diversity,
        },
      };
    } catch (error) {
      console.error("Vocabulary analysis failed:", error);
      return this.getFallbackVocabularyAnalysis(
        words,
        uniqueWords,
        diversity,
        studentLevel
      );
    }
  }

  /**
   * ✨ 4. Generate personalized improvement plan
   */
  async generatePersonalizedImprovementPlan(
    essayText,
    qualityScores,
    studentLevel,
    history
  ) {
    const weakestArea = Object.entries(qualityScores).sort(
      (a, b) => a[1] - b[1]
    )[0][0];

    const hasImproved =
      history?.hasHistory && history.essays.length > 1
        ? history.essays[0].grading.finalScore >
          history.essays[history.essays.length - 1].grading.finalScore
        : false;

    const prompt = `Create a DETAILED, ACTIONABLE improvement plan for a ${studentLevel}-level student.

ESSAY EXCERPT:
"${essayText.substring(0, 800)}"

SCORES:
- Grammar: ${Math.round(qualityScores.grammar * 100)}%
- Content: ${Math.round(qualityScores.content * 100)}%
- Organization: ${Math.round(qualityScores.organization * 100)}%
- Style: ${Math.round(qualityScores.style * 100)}%

WEAKEST: ${weakestArea}
${hasImproved ? "✅ Student is improving" : "Student needs more practice"}

Return EXACT JSON:
{
  "immediateActions": [
    {
      "action": "Specific thing to do NOW",
      "why": "Why this helps",
      "howTo": "Step-by-step instructions",
      "example": "Example from their essay",
      "timeNeeded": "5-10 minutes",
      "priority": 1
    }
  ],
  "weeklyPractice": [
    {
      "day": "Monday|Tuesday|etc",
      "activity": "Specific practice activity",
      "duration": "15-20 minutes",
      "goal": "What to achieve"
    }
  ],
  "nextEssayGoals": [
    {
      "goal": "Specific, measurable goal",
      "howToAchieve": "Concrete steps",
      "successCriteria": "How to know you achieved it"
    }
  ],
  "resources": [
    {
      "type": "video|article|exercise",
      "topic": "What it covers",
      "why": "How it helps",
      "priority": "high|medium|low"
    }
  ],
  "trackingMetrics": [
    {
      "metric": "What to measure",
      "currentLevel": "Where they are now",
      "targetLevel": "Where to get to",
      "howToMeasure": "How to track it"
    }
  ]
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        response_format: { type: "json_object" },
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error("Improvement plan generation failed:", error);
      return this.getFallbackImprovementPlan(weakestArea, studentLevel);
    }
  }

  /**
   * ✨ 5. Generate future prevention strategies
   */
  async generateFuturePreventionStrategies(
    grammarErrors,
    spellingErrors,
    studentLevel
  ) {
    const errorTypes = [
      ...new Set([
        ...grammarErrors.map((e) => e.type),
        ...spellingErrors.map((e) => "spelling"),
      ]),
    ];

    const prompt = `Create a PREVENTION GUIDE for a ${studentLevel}-level student to AVOID these errors in future essays.

ERROR TYPES: ${errorTypes.join(", ")}

Return EXACT JSON:
{
  "beforeWriting": [
    {
      "step": "What to do before starting",
      "why": "How it prevents errors",
      "timeNeeded": "5 minutes"
    }
  ],
  "whileWriting": [
    {
      "checkpoint": "What to check",
      "when": "When to check it",
      "howTo": "How to do the check"
    }
  ],
  "afterWriting": [
    {
      "review": "What to review",
      "method": "How to review it",
      "timeNeeded": "10-15 minutes"
    }
  ],
  "toolsAndTechniques": [
    {
      "tool": "Specific tool/technique",
      "purpose": "What it helps with",
      "howToUse": "Instructions"
    }
  ],
  "selfCheckChecklist": [
    {
      "item": "Specific thing to check",
      "howToCheck": "Method to verify"
    }
  ]
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error("Prevention strategies failed:", error);
      return this.getFallbackPreventionStrategies(studentLevel);
    }
  }

  /**
   * ✨ 6. Generate overall summary
   */
  generateOverallSummary(
    score,
    studentLevel,
    scoreExplanation,
    improvementPlan
  ) {
    const grade =
      score >= 90
        ? "excellent"
        : score >= 75
        ? "good"
        : score >= 60
        ? "fair"
        : "needs improvement";

    const messages = {
      beginner: {
        excellent: "🌟 Amazing! You're writing really well! Keep practicing!",
        good: "👍 Good job! You're getting better! Follow the tips above!",
        fair: "💪 Nice try! Writing is hard, but you can do it! Use the improvement plan!",
        "needs improvement":
          "📚 Keep trying! Everyone starts somewhere. Follow the steps to improve!",
      },
      intermediate: {
        excellent: "🎯 Excellent work! Your skills are strong!",
        good: "✅ Solid essay! Focus on the improvement areas!",
        fair: "📝 Decent work! Use the feedback to get better!",
        "needs improvement":
          "🔍 This needs work. Follow the improvement plan carefully!",
      },
      advanced: {
        excellent: "💎 Outstanding! Professional-level writing!",
        good: "✨ Strong work! Minor refinements needed!",
        fair: "📊 Good foundation. Polish the highlighted areas!",
        "needs improvement": "⚠️ Below standards. Review feedback thoroughly!",
      },
    };

    return {
      message: messages[studentLevel][grade],
      focusOn:
        scoreExplanation.keyInsight || "Follow the improvement plan above",
      nextMilestone: this.getNextMilestone(score, studentLevel),
      motivationalNote: this.getMotivationalNote(
        score,
        studentLevel,
        improvementPlan
      ),
    };
  }

  getNextMilestone(score, studentLevel) {
    if (studentLevel === "beginner") {
      if (score < 70)
        return "🎯 Goal: Score 70+ consistently to move toward intermediate level!";
      if (score < 75) return "🎯 Almost there! Keep scoring 70+ to level up!";
      return "🎯 Great! 3 more scores of 75+ will move you to intermediate level!";
    } else if (studentLevel === "intermediate") {
      if (score < 82)
        return "🎯 Goal: Score 82+ consistently for advanced level!";
      return "🎯 Excellent! Keep this up to reach advanced level!";
    } else {
      return "🎯 Maintain 85+ scores to stay at advanced level!";
    }
  }

  getMotivationalNote(score, studentLevel, improvementPlan) {
    const actions = improvementPlan?.immediateActions?.length || 0;

    if (score >= 85) {
      return `Outstanding work! You're mastering ${studentLevel}-level writing!`;
    } else if (score >= 70) {
      return `Good progress! Focus on the ${actions} immediate actions to improve further!`;
    } else {
      return `Don't give up! Follow the improvement plan step-by-step. You'll get better!`;
    }
  }

  // Helper methods
  getContext(text, target) {
    if (!target) return "";
    const index = text.toLowerCase().indexOf(target.toLowerCase());
    if (index === -1) return "";
    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + target.length + 40);
    return "..." + text.substring(start, end) + "...";
  }

  // Fallback methods
  getFallbackScoreExplanation(score, qualityScores, studentLevel) {
    return {
      mainReason: `You scored ${score}/100 based on grammar, content, organization, style, and mechanics.`,
      whatWentWell: [
        {
          aspect: "Effort",
          evidence: "Completed essay",
          impact: "Good participation",
        },
      ],
      whatNeedsWork: [
        {
          aspect: "Grammar",
          evidence: "Various errors",
          impact: "Affects clarity",
          priority: "high",
        },
      ],
      categoryBreakdown: {
        grammar: `Grammar: ${Math.round(qualityScores.grammar * 100)}%`,
        content: `Content: ${Math.round(qualityScores.content * 100)}%`,
        organization: `Organization: ${Math.round(
          qualityScores.organization * 100
        )}%`,
        style: `Style: ${Math.round(qualityScores.style * 100)}%`,
      },
      keyInsight: "Focus on improving grammar accuracy",
    };
  }

  getFallbackErrorAnalysis(grammarErrors, spellingErrors, studentLevel) {
    return {
      hasErrors: true,
      totalErrors: grammarErrors.length + spellingErrors.length,
      errorAnalysis: grammarErrors.slice(0, 3).map((e, i) => ({
        errorNumber: i + 1,
        type: "grammar",
        original: e.original,
        corrected: e.correction,
        whatsWrong: "Grammar needs correction",
        whyItMatters: "Affects writing clarity",
        howToFix: {
          step1: "Read the correction",
          step2: "Practice the rule",
          step3: "Check in future writing",
        },
        howToAvoid: ["Review grammar rules", "Proofread carefully"],
        memoryTrick: "Practice makes perfect!",
        similarMistakes: [],
      })),
      errorPatterns: {
        mostCommon: "Grammar errors",
        focusArea: "Grammar review",
      },
    };
  }

  getFallbackVocabularyAnalysis(words, uniqueWords, diversity, studentLevel) {
    return {
      currentLevel: `You used ${uniqueWords.length} unique words (${diversity}% diversity)`,
      overusedWords: [],
      vocabularyUpgrades: [],
      topicSpecificWords: [],
      practiceExercises: [
        {
          exercise: "Read daily",
          goal: "Improve vocabulary",
          timeNeeded: "15 minutes",
        },
      ],
      statistics: {
        totalWords: words.length,
        uniqueWords: uniqueWords.length,
        diversity,
      },
    };
  }

  getFallbackImprovementPlan(weakestArea, studentLevel) {
    return {
      immediateActions: [
        {
          action: `Focus on improving ${weakestArea}`,
          why: "It's your weakest area",
          howTo: "Review feedback and practice",
          example: "See errors above",
          timeNeeded: "10 minutes",
          priority: 1,
        },
      ],
      weeklyPractice: [],
      nextEssayGoals: [
        {
          goal: `Improve ${weakestArea} by 10%`,
          howToAchieve: "Practice daily",
          successCriteria: "Fewer errors",
        },
      ],
      resources: [],
      trackingMetrics: [],
    };
  }

  getFallbackPreventionStrategies(studentLevel) {
    return {
      beforeWriting: [
        {
          step: "Review grammar rules",
          why: "Prevents errors",
          timeNeeded: "5 minutes",
        },
      ],
      whileWriting: [
        {
          checkpoint: "Check each sentence",
          when: "After writing",
          howTo: "Read aloud",
        },
      ],
      afterWriting: [
        {
          review: "Proofread",
          method: "Read backwards",
          timeNeeded: "10 minutes",
        },
      ],
      toolsAndTechniques: [
        {
          tool: "Spell checker",
          purpose: "Catch errors",
          howToUse: "Use before submitting",
        },
      ],
      selfCheckChecklist: [
        { item: "Grammar", howToCheck: "Read each sentence" },
      ],
    };
  }

  getFallbackFeedback(params) {
    const { score, qualityScores, studentLevel } = params;
    return {
      scoreExplanation: this.getFallbackScoreExplanation(
        score,
        qualityScores,
        studentLevel
      ),
      errorAnalysis: {
        hasErrors: false,
        message: "Error analysis unavailable",
      },
      vocabularyAnalysis: { currentLevel: "Analysis unavailable" },
      improvementPlan: this.getFallbackImprovementPlan("grammar", studentLevel),
      futurePreventionTips: this.getFallbackPreventionStrategies(studentLevel),
      overallSummary: {
        message: "Keep practicing!",
        focusOn: "Review feedback",
        nextMilestone: "Submit more essays",
        motivationalNote: "Practice makes perfect!",
      },
    };
  }
}

module.exports = new AdaptiveFeedbackService();
