const axios = require('axios');

class GrammarCorrectionService {
  constructor() {
    this.modelUrl = process.env.GRAMMAR_MODEL_URL || "http://localhost:5002";
    this.cache = new Map();
    this.maxCacheSize = 1000;
  }

  async correctGrammar(sentence) {
    // Check cache first
    if (this.cache.has(sentence)) {
      return this.cache.get(sentence);
    }

    try {
      const response = await axios.post(
        `${this.modelUrl}/correct`,
        { text: sentence },
        { timeout: 5000 }
      );

      const result = {
        original: sentence,
        corrected: response.data.corrected,
        confidence: response.data.confidence || 0.8
      };

      // Cache the result
      this.cache.set(sentence, result);
      if (this.cache.size > this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      return result;
    } catch (error) {
      console.error("Grammar correction service error:", error.message);
      // Fallback: return original sentence
      return {
        original: sentence,
        corrected: sentence,
        confidence: 0,
        error: true
      };
    }
  }

  async batchCorrect(sentences) {
    const results = [];
    for (const sentence of sentences) {
      const result = await this.correctGrammar(sentence);
      results.push(result);
    }
    return results;
  }
}

module.exports = GrammarCorrectionService;