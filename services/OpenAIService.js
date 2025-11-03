require("dotenv").config();
const OpenAI = require("openai");

/**
 * OpenAI Service - All AI calls in one place
 * Handles: Grammar Analysis, Explanations, Essay Analysis, Completeness Checking
 */
class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.cache = new Map();
    this.maxCacheSize = 1000;

    // Model configuration
    this.models = {
      primary: "gpt-3.5-turbo-0125",
      fallback: "gpt-3.5-turbo",
      explanation: "gpt-3.5-turbo",
    };

    this.currentModelIndex = 0;
  }

  // ==================== GRAMMAR ANALYSIS ====================

  /**
   * Analyze essay grammar - Returns comprehensive analysis
   */
  async analyzeEssayGrammar(text, retryCount = 0) {
    try {
      console.log(`🤖 Starting OpenAI grammar analysis...`);

      const messages = [
        {
          role: "system",
          content: `You are an English writing tutor. Analyze this essay and find ALL grammar errors.

IMPORTANT: Return ONLY valid JSON with this exact structure:
{
  "grammar_analysis": {
    "corrections": [
      {
        "sentence_number": 1,
        "original": "incorrect sentence",
        "correction": "corrected sentence",
        "type": "subject_verb_agreement|verb_tense|pronoun_confusion|article_usage",
        "reason": "brief explanation",
        "confidence": 0.9,
        "severity": "high|moderate|minor"
      }
    ],
    "total_errors": 5
  },
  "scoring": {
    "quality_scores": {
      "grammar": 0.8,
      "content": 0.8,
      "organization": 0.8,
      "style": 0.8,
      "mechanics": 0.8
    },
    "confidence": 0.9
  }
}

Find ALL grammar errors. Be thorough but accurate.`,
        },
        {
          role: "user",
          content: `Analyze this essay for grammar errors:\n\n${text.substring(
            0,
            2000
          )}`,
        },
      ];

      const completion = await this.openai.chat.completions.create({
        model: this.models.primary,
        messages: messages,
        temperature: 0.1,
        max_tokens: 2500,
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0].message.content);

      result.validated = true;
      result.model_used = this.models.primary;

      console.log(
        `✅ Grammar analysis complete: ${
          result.grammar_analysis?.total_errors || 0
        } errors found`
      );
      return result;
    } catch (error) {
      console.error(`❌ Grammar analysis error:`, error.message);

      if (retryCount < 2) {
        console.log(`🔄 Retrying... (Attempt ${retryCount + 1})`);
        await this.sleep(1000 * (retryCount + 1));
        return this.analyzeEssayGrammar(text, retryCount + 1);
      }

      return this.getFallbackGrammarAnalysis(text);
    }
  }

  /**
   * Generate adaptive explanations based on student level
   */
  async generateLeveledExplanation(error, studentLevel, essayContext = "") {
    const cacheKey = `${error.original}-${error.correction}-${studentLevel}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const prompt = this.buildExplanationPrompt(
        error,
        studentLevel,
        essayContext
      );
      const systemPrompt = this.getExplanationSystemPrompt(studentLevel);

      const completion = await this.openai.chat.completions.create({
        model: this.models.explanation,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens:
          studentLevel === "beginner"
            ? 300
            : studentLevel === "intermediate"
            ? 150
            : 100,
      });

      const explanation = completion.choices[0].message.content;

      // Cache the result
      this.addToCache(cacheKey, explanation);

      return explanation;
    } catch (error) {
      console.error("❌ Explanation generation failed:", error.message);
      return this.getFallbackExplanation(error, studentLevel);
    }
  }

  /**
   * Batch generate explanations for multiple errors
   */
  async generateBatchExplanations(errors, studentLevel, essayContext = "") {
    if (!errors || !Array.isArray(errors) || errors.length === 0) {
      return [];
    }

    const explanations = [];
    const batchSize = 3;

    for (let i = 0; i < errors.length; i += batchSize) {
      const batch = errors.slice(i, i + batchSize);
      const batchPromises = batch.map((error) =>
        this.generateLeveledExplanation(
          error,
          studentLevel,
          essayContext
        ).catch((err) => {
          console.error("❌ Error generating explanation:", err.message);
          return this.getFallbackExplanation(error, studentLevel);
        })
      );

      const batchResults = await Promise.all(batchPromises);
      explanations.push(...batchResults);
    }

    return explanations;
  }

  /**
   * Check essay completeness and structure
   */
  async checkEssayCompleteness(essayText) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.models.primary,
        messages: [
          {
            role: "system",
            content: `You are an English writing tutor. Analyze essay structure.

Return ONLY valid JSON:
{
  "hasIntroduction": boolean,
  "hasBody": boolean,
  "hasConclusion": boolean,
  "missingConclusion": boolean,
  "structureScore": number,
  "feedback": "brief structural feedback"
}`,
          },
          {
            role: "user",
            content: `Analyze the structure of this essay:\n\n${essayText.substring(
              0,
              1500
            )}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: "json_object" },
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error("❌ Structure analysis failed:", error.message);
      return {
        hasIntroduction: true,
        hasBody: true,
        hasConclusion: false,
        missingConclusion: true,
        structureScore: 60,
        feedback: "Essay appears to be missing a conclusion paragraph.",
      };
    }
  }

  /**
   * Convert OpenAI corrections to standardized format
   */
  async convertToStandardErrors(
    openAICorrections,
    text,
    studentLevel = "intermediate"
  ) {
    if (!openAICorrections || !Array.isArray(openAICorrections)) {
      return [];
    }

    const standardErrors = [];

    for (const correction of openAICorrections) {
      const issueWord = this.extractChangedWord(
        correction.original,
        correction.correction
      );

      // Generate level-appropriate explanation
      let explanation;
      try {
        explanation = await this.generateLeveledExplanation(
          {
            original: correction.original,
            correction: correction.correction,
            type: correction.type,
            reason: correction.reason || "grammar improvement",
          },
          studentLevel,
          text.substring(0, 500)
        );
      } catch (err) {
        explanation = this.getFallbackExplanation(correction, studentLevel);
      }

      standardErrors.push({
        sentenceNumber: correction.sentence_number || standardErrors.length + 1,
        original: correction.original,
        issueWord: issueWord,
        correction: correction.correction,
        type: this.mapErrorType(correction.type),
        reason: correction.reason || "grammar improvement",
        confidence: correction.confidence || 0.85,
        severity: correction.severity || "moderate",
        explanation: explanation,
        validated: true,
        studentLevel: studentLevel,
      });
    }

    return standardErrors;
  }

  // ==================== HELPER METHODS ====================

  buildExplanationPrompt(error, studentLevel, essayContext) {
    const base = `Original: "${error.original}"\nCorrected: "${
      error.correction
    }"\nError Type: ${error.type || "grammar"}\nReason: ${
      error.reason || "grammar improvement"
    }`;

    if (studentLevel === "beginner") {
      return `${base}

Please explain this grammar error to a beginner student. Include:
1. What the error is (simple terms)
2. Why it's wrong (explain the rule clearly)
3. How to remember this rule (memory tip)
4. How to avoid this mistake in future essays
5. 2-3 simple examples

Keep language simple and encouraging.`;
    }

    if (studentLevel === "intermediate") {
      return `${base}

Explain this grammar error to an intermediate student. Include:
1. The grammatical issue
2. The rule briefly
3. 1-2 examples

Be concise but clear.`;
    }

    return `${base}

Provide a brief explanation for an advanced student:
1. The grammatical principle
2. One example if needed

Be very concise - they understand grammar well.`;
  }

  getExplanationSystemPrompt(studentLevel) {
    const prompts = {
      beginner: `You are a patient, encouraging English tutor for beginner students. 
Explain grammar errors clearly and simply. Use:
- Simple vocabulary
- Step-by-step explanations
- Encouraging tone
- Practical memory tips
- Clear examples

Format:
**What's Wrong:** [Simple explanation]

**Why This Matters:** [Easy-to-understand reason]

**The Rule:** [Clear rule in simple terms]

**Memory Tip:** [Something to help remember]

**Examples:**
1. ❌ [wrong] → ✅ [correct]
2. ❌ [wrong] → ✅ [correct]`,

      intermediate: `You are an English tutor for intermediate students.
Provide clear, focused explanations without being too basic.

Format:
**Issue:** [Clear explanation]

**Rule:** [The grammatical rule]

**Examples:**
1. ❌ [wrong] → ✅ [correct]`,

      advanced: `You are an English tutor for advanced students.
Provide concise, technical explanations.

Format:
**Issue:** [Brief, precise explanation]

**Example:** ❌ [wrong] → ✅ [correct] (if needed)

Keep it short - they understand grammar.`,
    };

    return prompts[studentLevel] || prompts.intermediate;
  }

  getFallbackExplanation(error, studentLevel) {
    const templates = {
      beginner: `**What's Wrong:** ${
        error.reason || "Grammar improvement needed"
      }

**The Rule:** This is a common grammar rule that helps make your writing clearer.

**In Your Essay:**
❌ "${error.original}"
✅ "${error.correction}"

**Memory Tip:** Practice this correction in your next essay!`,

      intermediate: `**Issue:** ${error.reason || "Grammar improvement needed"}

**Correction:**
❌ "${error.original}"
✅ "${error.correction}"

**Rule:** ${(error.type || "grammar").replace(/_/g, " ")}`,

      advanced: `**Issue:** ${error.reason || "Grammatical correction needed"}

❌ "${error.original}" → ✅ "${error.correction}"`,
    };

    return templates[studentLevel] || templates.intermediate;
  }

  getFallbackGrammarAnalysis(text) {
    return {
      grammar_analysis: {
        corrections: [],
        total_errors: 0,
      },
      scoring: {
        quality_scores: {
          grammar: 0.7,
          content: 0.7,
          organization: 0.7,
          style: 0.7,
          mechanics: 0.7,
        },
        confidence: 0.6,
      },
      fallback_used: true,
      validated: true,
    };
  }

  extractChangedWord(original, corrected) {
    if (!original || !corrected) return "word";

    const origWords = original.toLowerCase().split(/\s+/);
    const corrWords = corrected.toLowerCase().split(/\s+/);

    for (let i = 0; i < Math.min(origWords.length, corrWords.length); i++) {
      if (origWords[i] !== corrWords[i]) {
        return origWords[i];
      }
    }

    return "word";
  }

  mapErrorType(openAIReason) {
    if (!openAIReason) return "grammar";

    const typeMap = {
      subject_verb_agreement: "subject_verb_agreement",
      "subject-verb agreement": "subject_verb_agreement",
      verb_tense: "verb_tense",
      "verb tense": "verb_tense",
      pronoun_confusion: "pronoun_confusion",
      "homophone confusion": "pronoun_confusion",
      article_usage: "article_usage",
      "article usage": "article_usage",
    };

    return typeMap[openAIReason] || "grammar";
  }

  addToCache(key, value) {
    if (this.cache.size > this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async healthCheck() {
    try {
      const models = await this.openai.models.list();
      return {
        healthy: true,
        service: "OpenAI Unified Service",
        available_models: models.data.slice(0, 5).map((m) => m.id),
      };
    } catch (error) {
      return {
        healthy: false,
        service: "OpenAI Unified Service",
        error: error.message,
      };
    }
  }

  /**
   * Get text embeddings using OpenAI
   */
  async getEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
        encoding_format: "float",
      });

      return {
        embedding: response.data[0].embedding,
        model: response.model,
        tokens: response.usage.total_tokens,
      };
    } catch (error) {
      console.error("OpenAI embedding error:", error);
      throw new Error("Failed to generate text embeddings");
    }
  }
}

module.exports = new OpenAIService();
