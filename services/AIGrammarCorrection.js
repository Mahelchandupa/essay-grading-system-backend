const axios = require("axios");

class AIGrammarCorrection {
  constructor() {
    this.modelUrl = process.env.GRAMMAR_MODEL_URL || "http://localhost:5001";
    this.cache = new Map();
    this.maxCacheSize = 1000;
    this.timeout = 10000; // 10 seconds
  }

  /**
   * ✅ IMPROVED: Use AI model for grammar correction with validation
   */
  async correctGrammar(sentence) {
    // Check cache first
    const cacheKey = sentence.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      console.log(`🤖 AI Grammar checking: "${sentence.substring(0, 50)}..."`);
      
      const response = await axios.post(
        `${this.modelUrl}/correct_grammar`,
        { 
          text: sentence,
          mode: 'analyze',
          min_confidence: 0.75  // Only high-confidence corrections
        },
        { timeout: this.timeout }
      );

      const result = {
        original: sentence,
        corrected: response.data.corrected || sentence,
        confidence: response.data.confidence || 0.8,
        corrections: response.data.corrections || [],
        totalErrors: response.data.total_errors || 0,
        validated: true
      };

      // Cache the result
      this.cache.set(cacheKey, result);
      if (this.cache.size > this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      console.log(`✅ AI found ${result.totalErrors} grammar errors`);
      return result;

    } catch (error) {
      console.error("AI Grammar correction service error:", error.message);
      
      // Fallback: return original with no errors
      return {
        original: sentence,
        corrected: sentence,
        confidence: 0,
        corrections: [],
        totalErrors: 0,
        error: true,
        validated: true
      };
    }
  }

  /**
   * ✅ NEW: Batch process sentences with AI model
   */
  async analyzeEssayGrammar(text) {
    try {
      console.log("🤖 Starting AI grammar analysis for entire essay...");
      
      const response = await axios.post(
        `${this.modelUrl}/analyze_essay`,
        { essay: text },
        { timeout: 15000 }
      );

      const result = {
        grammarErrors: response.data.grammar_analysis?.corrections || [],
        totalErrors: response.data.grammar_analysis?.total_errors || 0,
        qualityScores: response.data.scoring?.quality_scores || {},
        confidence: response.data.scoring?.confidence || 0.8,
        validated: true
      };

      console.log(`✅ AI analysis complete: ${result.totalErrors} errors found`);
      return result;

    } catch (error) {
      console.error("AI Essay analysis error:", error.message);
      
      // Fallback: return empty results
      return {
        grammarErrors: [],
        totalErrors: 0,
        qualityScores: {},
        confidence: 0,
        error: true,
        validated: true
      };
    }
  }

  /**
   * ✅ IMPROVED: Convert AI corrections to standardized format
   */
  convertToStandardErrors(aiCorrections, text) {
    return aiCorrections.map((correction, index) => {
      // Extract the specific word that changed
      const issueWord = this.extractChangedWord(
        correction.original, 
        correction.correction
      );

      return {
        sentenceNumber: correction.sentence_number || (index + 1),
        original: correction.original,
        issueWord: issueWord,
        correction: correction.correction,
        type: this.mapErrorType(correction.reason),
        reason: correction.reason || 'grammar improvement',
        confidence: correction.confidence || 0.85,
        severity: correction.severity || 'moderate',
        explanation: this.generateAIExplanation(correction.original, correction.correction, correction.reason),
        validated: true
      };
    });
  }

  /**
   * ✅ NEW: Extract the specific word that changed
   */
  extractChangedWord(original, corrected) {
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
   * ✅ NEW: Map AI error types to standardized types
   */
  mapErrorType(aiReason) {
    const typeMap = {
      'subject-verb agreement': 'subject_verb_agreement',
      'verb tense': 'verb_tense',
      'homophone confusion': 'pronoun_confusion',
      'article usage': 'article_usage',
      'punctuation_only': 'punctuation'
    };

    return typeMap[aiReason] || 'grammar';
  }

  /**
   * ✅ NEW: Generate explanations based on AI analysis
   */
  generateAIExplanation(original, corrected, reason) {
    const explanations = {
      'subject-verb agreement': {
        rule: "The subject and verb must match in number (singular/plural).",
        why: "This ensures grammatical accuracy and clear communication.",
        examples: [
          "❌ He go to school → ✅ He goes to school",
          "❌ They plays football → ✅ They play football",
          "❌ The cat sleep all day → ✅ The cat sleeps all day"
        ]
      },
      'verb tense': {
        rule: "Use consistent verb tenses that match the time context.",
        why: "Proper tense usage makes your writing clearer and more professional.",
        examples: [
          "❌ Yesterday I go to the store → ✅ Yesterday I went to the store",
          "❌ She has ate lunch → ✅ She has eaten lunch",
          "❌ They will went tomorrow → ✅ They will go tomorrow"
        ]
      },
      'article usage': {
        rule: "Use 'a' before consonant sounds and 'an' before vowel sounds.",
        why: "Proper article usage improves readability and sounds more natural.",
        examples: [
          "❌ a apple → ✅ an apple",
          "❌ an university → ✅ a university", 
          "❌ a hour → ✅ an hour"
        ]
      },
      'homophone confusion': {
        rule: "Words that sound the same but have different spellings and meanings.",
        why: "Using the correct homophone prevents confusion and shows attention to detail.",
        examples: [
          "❌ Their going to school → ✅ They're going to school",
          "❌ I like you're car → ✅ I like your car",
          "❌ Its a beautiful day → ✅ It's a beautiful day"
        ]
      }
    };

    const baseExplanation = explanations[reason] || {
      rule: "Grammar improvement needed for better clarity.",
      why: "This correction improves the grammatical accuracy of your sentence.",
      examples: [`❌ ${original} → ✅ ${corrected}`]
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
   * ✅ NEW: Health check for AI service
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.modelUrl}/health`, {
        timeout: 5000
      });
      return {
        healthy: true,
        service: 'AI Grammar Correction',
        version: response.data.model_version,
        device: response.data.device
      };
    } catch (error) {
      return {
        healthy: false,
        service: 'AI Grammar Correction',
        error: error.message
      };
    }
  }
}

module.exports = AIGrammarCorrection;