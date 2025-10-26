require("dotenv").config();
const OpenAI = require("openai");
const AdaptiveExplanationGenerator = require("./AdaptiveExplanationGenerator");

class AdvanceAIGrammarCorrection {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.cache = new Map();
    this.maxCacheSize = 1000;

    // ✅ Updated model list focusing on reliability
    this.availableModels = [
      "gpt-3.5-turbo-0125", // Most reliable for JSON
      "gpt-3.5-turbo", // Fallback
      "gpt-4", // GPT-4 fallback
      "gpt-4-turbo-preview", // Last resort
    ];

    this.currentModelIndex = 0;
  }

  /**
   * ✅ IMPROVED: Better JSON parsing that handles truncated responses
   */
  async parseJSONResponse(responseText) {
    if (!responseText || typeof responseText !== "string") {
      throw new Error("Empty or invalid response text");
    }

    // Clean the response text first
    let cleanedText = responseText.trim();

    // Remove any markdown code blocks
    cleanedText = cleanedText.replace(/```json\s*/g, "").replace(/```\s*/g, "");

    console.log("🔧 Cleaning JSON response...");
    console.log("📏 Response length:", cleanedText.length);

    // Check if response looks truncated (ends abruptly)
    const isTruncated = this.isResponseTruncated(cleanedText);
    if (isTruncated) {
      console.log("⚠️ Response appears truncated, attempting to fix...");
      cleanedText = this.fixTruncatedJSON(cleanedText);
    }

    // Multiple parsing attempts
    const parsingAttempts = [
      // Attempt 1: Direct parse
      () => {
        return JSON.parse(cleanedText);
      },

      // Attempt 2: Try to complete truncated JSON
      () => {
        const completedJson = this.completeJSONStructure(cleanedText);
        return JSON.parse(completedJson);
      },

      // Attempt 3: Extract and parse just the grammar_analysis part
      () => {
        const grammarMatch = cleanedText.match(
          /"grammar_analysis"\s*:\s*(\{[\s\S]*?\})(?=\s*[,}])/
        );
        if (grammarMatch) {
          const grammarJson = `{"grammar_analysis": ${grammarMatch[1]}}`;
          const result = JSON.parse(grammarJson);

          // Ensure we have the required structure
          if (
            result.grammar_analysis &&
            Array.isArray(result.grammar_analysis.corrections)
          ) {
            return {
              grammar_analysis: {
                corrections: result.grammar_analysis.corrections,
                total_errors: result.grammar_analysis.corrections.length,
              },
              scoring: {
                quality_scores: {
                  grammar: 0.7,
                  content: 0.7,
                  organization: 0.7,
                  style: 0.7,
                  mechanics: 0.7,
                },
                confidence: 0.7,
              },
            };
          }
        }
        throw new Error("Could not extract grammar analysis");
      },

      // Attempt 4: Try to parse as much as possible and build minimal structure
      () => {
        // Find all complete correction objects
        const correctionPattern =
          /\{"sentence_number":\s*\d+[\s\S]*?"severity":\s*"\w+"\}/g;
        const matches = cleanedText.match(correctionPattern) || [];

        const corrections = [];
        matches.forEach((match) => {
          try {
            const correction = JSON.parse(match);
            corrections.push(correction);
          } catch (e) {
            // Skip invalid corrections
          }
        });

        if (corrections.length > 0) {
          return {
            grammar_analysis: {
              corrections: corrections,
              total_errors: corrections.length,
            },
            scoring: {
              quality_scores: {
                grammar: Math.max(0.6, 1 - corrections.length / 20),
                content: 0.7,
                organization: 0.7,
                style: 0.7,
                mechanics: 0.7,
              },
              confidence: 0.7,
            },
          };
        }
        throw new Error("No valid corrections found");
      },
    ];

    for (let i = 0; i < parsingAttempts.length; i++) {
      try {
        const result = parsingAttempts[i]();
        console.log(`✅ JSON parsing successful with attempt ${i + 1}`);
        return result;
      } catch (error) {
        console.log(
          `⚠️ JSON parsing attempt ${i + 1} failed: ${error.message}`
        );
        if (i === parsingAttempts.length - 1) {
          throw new Error(`All JSON parsing attempts failed: ${error.message}`);
        }
      }
    }
  }

  /**
   * ✅ NEW: Check if response is truncated
   */
  isResponseTruncated(text) {
    // Check for common truncation patterns
    const truncationPatterns = [
      /,\s*$/, // Ends with comma
      /"\s*$/, // Ends with quote
      /\}\s*$/, // Ends with brace (incomplete)
      /\]\s*$/, // Ends with bracket (incomplete)
      /[^{\[]\s*$/, // Ends without proper closure
    ];

    return truncationPatterns.some((pattern) => pattern.test(text));
  }

  /**
   * ✅ NEW: Fix truncated JSON
   */
  fixTruncatedJSON(text) {
    let fixed = text;

    // Remove trailing commas
    fixed = fixed.replace(/,\s*$/, "");

    // Close open quotes in the last line
    const lines = fixed.split("\n");
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      if (lastLine.includes('"') && !lastLine.match(/".*"$/)) {
        // Quote is not closed, remove the incomplete part
        const lastCompleteIndex = fixed.lastIndexOf('",');
        if (lastCompleteIndex !== -1) {
          fixed = fixed.substring(0, lastCompleteIndex + 2);
        }
      }
    }

    // Ensure the JSON is properly closed
    if (fixed.trim().startsWith("{") && !fixed.trim().endsWith("}")) {
      // Count open braces to see how many need to be closed
      const openBraces = (fixed.match(/{/g) || []).length;
      const closeBraces = (fixed.match(/}/g) || []).length;
      const bracesToClose = openBraces - closeBraces;

      for (let i = 0; i < bracesToClose; i++) {
        fixed += "}";
      }
    }

    // Close arrays if needed
    if (fixed.includes("[") && !fixed.includes("]")) {
      const lastBracket = fixed.lastIndexOf("[");
      const contentAfter = fixed.substring(lastBracket);
      if (!contentAfter.includes("]")) {
        // Remove incomplete array and everything after it
        fixed = fixed.substring(0, lastBracket);
      }
    }

    return fixed;
  }

  /**
   * ✅ NEW: Complete JSON structure for truncated responses
   */
  completeJSONStructure(text) {
    let completed = text;

    // Basic structure completion
    if (!completed.trim().endsWith("}")) {
      completed += "\n}";
    }

    // Ensure grammar_analysis has corrections array if missing
    if (
      !completed.includes('"corrections"') &&
      completed.includes('"grammar_analysis"')
    ) {
      const grammarIndex = completed.indexOf('"grammar_analysis"');
      const afterGrammar = completed.substring(grammarIndex);
      if (!afterGrammar.includes('"corrections"')) {
        // Insert corrections array
        completed = completed.replace(
          /"grammar_analysis":\s*\{/,
          '"grammar_analysis": {\n"corrections": [],'
        );
      }
    }

    return completed;
  }

  /**
   * ✅ FIXED: Analyze essay grammar WITHOUT filtering out corrections
   */
  async analyzeEssayGrammar(text, retryCount = 0) {
    try {
      console.log(
        `🤖 Starting OpenAI essay analysis with ${this.getCurrentModel()}...`
      );

      const currentModel = this.getCurrentModel();

      const messages = [
        {
          role: "system",
          content: `You are an English writing tutor. Find ALL grammar errors in this essay.

IMPORTANT: Return JSON with ALL grammar errors you find. Include subject-verb agreement, verb tense, pronoun errors, etc.

Required JSON format:
{
  "grammar_analysis": {
    "corrections": [
      {
        "sentence_number": 1,
        "original": "incorrect sentence", 
        "correction": "corrected sentence",
        "type": "error_type",
        "reason": "brief explanation",
        "confidence": 0.9,
        "severity": "moderate"
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

Find and return ALL grammar errors. Don't filter anything.`,
        },
        {
          role: "user",
          content: `Find ALL grammar errors in this student essay. Be thorough and include all errors:\n\n${text.substring(
            0,
            2000
          )}`,
        },
      ];

      const requestConfig = {
        model: currentModel,
        messages: messages,
        temperature: 0.1,
        max_tokens: 2500,
      };

      const completion = await this.openai.chat.completions.create(
        requestConfig
      );
      const responseText = completion.choices[0].message.content;

      console.log("📄 Raw OpenAI response received");

      const result = await this.parseJSONResponse(responseText);

      // ✅ CRITICAL FIX: DON'T FILTER CORRECTIONS - Keep all of them
      if (result.grammar_analysis && result.grammar_analysis.corrections) {
        console.log(
          `📝 OpenAI raw corrections: ${result.grammar_analysis.corrections.length}`
        );

        // Only remove exact duplicates, keep all valid corrections
        const uniqueCorrections = this.removeDuplicateCorrections(
          result.grammar_analysis.corrections
        );
        console.log(
          `✅ After deduplication: ${uniqueCorrections.length} corrections`
        );

        result.grammar_analysis.corrections = uniqueCorrections;
        result.grammar_analysis.total_errors = uniqueCorrections.length;
      }

      result.validated = true;
      result.model_used = currentModel;

      console.log(
        `✅ OpenAI analysis complete: ${
          result.grammar_analysis?.total_errors || 0
        } errors found`
      );
      return result;
    } catch (error) {
      console.error(`❌ OpenAI essay analysis error:`, error.message);

      // Fallback to basic analysis
      return this.fallbackEssayAnalysis(text);
    }
  }

  /**
   * ✅ SIMPLIFIED: Remove only exact duplicates
   */
  removeDuplicateCorrections(corrections) {
    if (!corrections || !Array.isArray(corrections)) return [];

    const seen = new Set();
    const unique = [];

    corrections.forEach((correction) => {
      if (!correction || !correction.original) return;

      const key = `${correction.original}-${correction.correction}-${correction.sentence_number}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(correction);
      }
    });

    return unique;
  }

  /**
   * ✅ IMPROVED: Grammar correction with better JSON handling
   */
  async correctGrammar(sentence, retryCount = 0) {
    // Check cache first
    const cacheKey = sentence.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      console.log(
        `🤖 OpenAI Grammar checking with ${this.getCurrentModel()}: "${sentence.substring(
          0,
          50
        )}..."`
      );

      const currentModel = this.getCurrentModel();

      const messages = [
        {
          role: "system",
          content: `You are an English tutor. Correct grammar errors and return JSON.

IMPORTANT: Return ONLY valid JSON, no other text.

Required JSON format:
{
  "original": "original text",
  "corrected": "corrected text", 
  "confidence": 0.9,
  "corrections": [
    {
      "original": "incorrect part",
      "correction": "corrected part",
      "type": "error_type",
      "reason": "brief explanation",
      "confidence": 0.9
    }
  ],
  "total_errors": 1
}`,
        },
        {
          role: "user",
          content: `Correct this sentence. Return JSON only: "${sentence}"`,
        },
      ];

      const requestConfig = {
        model: currentModel,
        messages: messages,
        temperature: 0.1,
        max_tokens: 500,
      };

      if (currentModel.includes("gpt-4")) {
        requestConfig.response_format = { type: "json_object" };
      }

      const completion = await this.openai.chat.completions.create(
        requestConfig
      );
      const responseText = completion.choices[0].message.content;

      const result = await this.parseJSONResponse(responseText);
      result.validated = true;
      result.model_used = currentModel;

      // Cache the result
      this.cache.set(cacheKey, result);
      if (this.cache.size > this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      console.log(
        `✅ OpenAI (${currentModel}) found ${result.total_errors} grammar errors`
      );
      return result;
    } catch (error) {
      console.error(
        `❌ OpenAI error with ${this.getCurrentModel()}:`,
        error.message
      );

      // Retry with next model if available
      if (retryCount < this.availableModels.length - 1) {
        console.log(
          `🔄 Retrying with different model... (Attempt ${retryCount + 1})`
        );
        this.rotateModel();
        return this.correctGrammar(sentence, retryCount + 1);
      }

      // Final fallback
      console.log("🔄 Using rule-based fallback");
      return this.fallbackCorrection(sentence);
    }
  }

  /**
   * ✅ Get current active model
   */
  getCurrentModel() {
    return this.availableModels[this.currentModelIndex];
  }

  /**
   * ✅ Rotate to next model if current fails
   */
  rotateModel() {
    this.currentModelIndex =
      (this.currentModelIndex + 1) % this.availableModels.length;
    console.log(`🔄 Switching to model: ${this.getCurrentModel()}`);
  }

  /**
   * ✅ NEW: Convert OpenAI corrections to standardized format
   * This matches the interface expected by EssayGradingService
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

      // ✅ Generate level-appropriate explanation
      let explanation;
      try {
        explanation =
          await AdaptiveExplanationGenerator.generateLeveledExplanation(
            {
              original: correction.original,
              correction: correction.correction,
              type: correction.type,
              reason: correction.reason || "grammar improvement",
            },
            studentLevel,
            text.substring(0, 500) // Context for better explanations
          );
      } catch (error) {
        // Fallback to basic explanation
        explanation = this.generateAIExplanation(
          correction.original,
          correction.correction,
          correction.reason
        );
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
        explanation: explanation, // ✅ Now level-appropriate
        validated: true,
        studentLevel: studentLevel, // Track which level this was generated for
      });
    }

    return standardErrors;
  }

  /**
   * ✅ NEW: Extract the specific word that changed
   */
  extractChangedWord(original, corrected) {
    if (!original || !corrected) return "word";

    const origWords = original.toLowerCase().split(/\s+/);
    const corrWords = corrected.toLowerCase().split(/\s+/);

    // Find the first word that changed
    for (let i = 0; i < Math.min(origWords.length, corrWords.length); i++) {
      if (origWords[i] !== corrWords[i]) {
        return origWords[i];
      }
    }

    return "word";
  }

  /**
   * ✅ NEW: Map OpenAI error types to standardized types
   */
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
      spelling: "spelling",
      word_choice: "word_choice",
      "word choice": "word_choice",
    };

    return typeMap[openAIReason] || "grammar";
  }

  /**
   * ✅ NEW: Generate explanations based on OpenAI analysis
   */
  generateAIExplanation(original, corrected, reason) {
    const explanations = {
      subject_verb_agreement: {
        rule: "The subject and verb must match in number (singular/plural).",
        why: "This ensures grammatical accuracy and clear communication.",
        examples: [
          "❌ He go to school → ✅ He goes to school",
          "❌ They plays football → ✅ They play football",
          "❌ The cat sleep all day → ✅ The cat sleeps all day",
        ],
      },
      verb_tense: {
        rule: "Use consistent verb tenses that match the time context.",
        why: "Proper tense usage makes your writing clearer and more professional.",
        examples: [
          "❌ Yesterday I go to the store → ✅ Yesterday I went to the store",
          "❌ She has ate lunch → ✅ She has eaten lunch",
          "❌ They will went tomorrow → ✅ They will go tomorrow",
        ],
      },
      pronoun_confusion: {
        rule: "Words that sound the same but have different spellings and meanings.",
        why: "Using the correct homophone prevents confusion and shows attention to detail.",
        examples: [
          "❌ Their going to school → ✅ They're going to school",
          "❌ I like you're car → ✅ I like your car",
          "❌ Its a beautiful day → ✅ It's a beautiful day",
        ],
      },
    };

    const baseExplanation = explanations[this.mapErrorType(reason)] || {
      rule: "Grammar improvement needed for better clarity.",
      why: "This correction improves the grammatical accuracy of your sentence.",
      examples: [`❌ ${original} → ✅ ${corrected}`],
    };

    let formatted = `**AI-Detected Issue: ${reason}**\n\n`;
    formatted += `**Rule:** ${baseExplanation.rule}\n\n`;
    formatted += `**Why This Matters:** ${baseExplanation.why}\n\n`;
    formatted += `**In Your Essay:**\n`;
    formatted += `❌ "${original}"\n`;
    formatted += `✅ "${corrected}"\n\n`;
    formatted += `**More Examples:**\n`;
    baseExplanation.examples.forEach((ex, i) => {
      formatted += `${i + 1}. ${ex}\n`;
    });

    return formatted;
  }

  /**
   * ✅ Simple fallback correction when OpenAI fails
   */
  fallbackCorrection(sentence) {
    // Basic rule-based corrections as fallback
    const corrections = [];
    let corrected = sentence;

    // Common grammar fixes
    const rules = [
      {
        pattern: /\bHe go\b/gi,
        replacement: "He goes",
        type: "subject_verb_agreement",
        reason: 'Use "goes" with singular subject "He"',
      },
      {
        pattern: /\bthey plays\b/gi,
        replacement: "they play",
        type: "subject_verb_agreement",
        reason: 'Use "play" with plural subject "they"',
      },
      {
        pattern: /\beveryday\b/gi,
        replacement: "every day",
        type: "word_choice",
        reason:
          '"every day" (two words) means each day; "everyday" (one word) is an adjective',
      },
      {
        pattern: /\bhave changed\b/gi,
        replacement: "has changed",
        type: "subject_verb_agreement",
        reason: 'Use "has" with singular "social media"',
      },
      {
        pattern: /\bpeoples\b/gi,
        replacement: "people's",
        type: "spelling",
        reason: 'Use "people\'s" for possessive form',
      },
    ];

    rules.forEach((rule) => {
      if (rule.pattern.test(corrected)) {
        const originalMatch = corrected.match(rule.pattern)[0];
        corrected = corrected.replace(rule.pattern, rule.replacement);
        corrections.push({
          original: originalMatch,
          correction: rule.replacement,
          type: rule.type,
          reason: rule.reason,
          confidence: 0.8,
        });
      }
    });

    return {
      original: sentence,
      corrected: corrected,
      confidence: 0.7,
      corrections: corrections,
      total_errors: corrections.length,
      validated: true,
      fallback_used: true,
    };
  }

  /**
   * ✅ Fallback essay analysis
   */
  fallbackEssayAnalysis(text) {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
    const corrections = [];

    sentences.forEach((sentence, index) => {
      const sentenceCorrection = this.fallbackCorrection(sentence.trim());
      if (sentenceCorrection.corrections.length > 0) {
        corrections.push({
          sentence_number: index + 1,
          original: sentence.trim(),
          correction: sentenceCorrection.corrected,
          type: sentenceCorrection.corrections[0].type,
          reason: sentenceCorrection.corrections[0].reason,
          confidence: 0.7,
          severity: "moderate",
        });
      }
    });

    return {
      grammar_analysis: {
        corrections: corrections,
        total_errors: corrections.length,
      },
      scoring: {
        quality_scores: {
          grammar: Math.max(
            0.6,
            1 - (corrections.length / sentences.length) * 0.3
          ),
          content: 0.75,
          organization: 0.7,
          style: 0.65,
          mechanics: 0.7,
        },
        confidence: 0.6,
      },
      fallback_used: true,
      validated: true,
    };
  }

  /**
   * ✅ Health check with model verification
   */
  async healthCheck() {
    try {
      const models = await this.openai.models.list();
      const availableModelNames = models.data.map((m) => m.id);

      console.log("📋 Available models:", availableModelNames.slice(0, 5));

      const workingModels = this.availableModels.filter((model) =>
        availableModelNames.includes(model)
      );

      if (workingModels.length === 0) {
        return {
          healthy: false,
          service: "OpenAI Grammar Correction",
          error: "No compatible models available",
          available_models: availableModelNames.slice(0, 10),
        };
      }

      this.availableModels = workingModels;
      this.currentModelIndex = 0;

      return {
        healthy: true,
        service: "OpenAI Grammar Correction",
        current_model: this.getCurrentModel(),
        available_models: workingModels,
        total_models_available: availableModelNames.length,
      };
    } catch (error) {
      return {
        healthy: false,
        service: "OpenAI Grammar Correction",
        error: error.message,
      };
    }
  }
}

module.exports = AdvanceAIGrammarCorrection;
