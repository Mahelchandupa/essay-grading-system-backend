const SpellChecker = require("simple-spellchecker");

class SpellingCheckerService {
  constructor(openAIService = null) {
    this.dictionary = null;
    this.dictionaryReady = false;
    this.openAIService = openAIService; // ✅ Inject OpenAI service
    this.initializeDictionary();

    // Technical vocabulary that should NOT be flagged
    this.technicalVocabulary = new Set([
      "ai", "chatbot", "chatbots", "covid", "internet", "email", "emails",
      "online", "offline", "google", "instagram", "facebook", "youtube",
      "smartphone", "smartphones", "wifi", "app", "apps", "cyber",
      "cyberbullying", "tiktok", "netflix", "uber", "amazon",
    ]);

    this.informalWords = new Set([
      "ok", "okay", "yeah", "gonna", "wanna", "gotta", "lot", "lots"
    ]);
  }

  async initializeDictionary() {
    return new Promise((resolve, reject) => {
      SpellChecker.getDictionary("en-US", (err, dictionary) => {
        if (err) {
          console.error("❌ Failed to load dictionary:", err);
          this.dictionary = null;
          reject(err);
        } else {
          this.dictionary = dictionary;
          this.dictionaryReady = true;
          console.log("✅ Spelling dictionary loaded");
          resolve();
        }
      });
    });
  }

  /**
 * Filter out words that are actually correct
 */
async checkSpellingWithContext(text) {
  try {
    const potentialErrors = this.checkSpelling(text);
    
    if (potentialErrors.length === 0) {
      return [];
    }

    console.log(`   Found ${potentialErrors.length} potential spelling errors`);

    // Use OpenAI to verify which are ACTUAL errors
    const prompt = `Check these words for spelling errors. Return ONLY the words that are ACTUALLY misspelled.

TEXT CONTEXT:
"${text.substring(0, 1500)}"

WORDS TO CHECK:
${potentialErrors.map((e, i) => `${i + 1}. "${e.word}"`).join('\n')}

Return EXACT JSON:
{
  "actualErrors": [
    {
      "word": "misspelled word",
      "correction": "correct spelling",
      "reason": "why it's wrong",
      "isActualError": true
    }
  ]
}

IMPORTANT: Only include words that are ACTUALLY misspelled. Words like "selfies", "influencers", "online", "cyberbullying" are CORRECT modern English words.`;

    const completion = await this.openAIService.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a spelling checker. Only flag words that are ACTUALLY misspelled. Modern words, technical terms, and proper nouns are often correct."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content);
    
    // ✅ Filter: Only return words that are ACTUAL errors
    const actualErrors = result.actualErrors?.filter(e => e.isActualError === true) || [];
    
    // Map back to original format
    const verifiedErrors = [];
    for (const error of actualErrors) {
      const original = potentialErrors.find(e => 
        e.word.toLowerCase() === error.word.toLowerCase()
      );
      
      if (original) {
        verifiedErrors.push({
          ...original,
          correction: error.correction,
          aiReason: error.reason,
          verified: true
        });
      }
    }

    console.log(`   ✅ Verified: ${verifiedErrors.length} ACTUAL spelling errors (filtered out ${potentialErrors.length - verifiedErrors.length} correct words)`);
    
    return verifiedErrors;

  } catch (error) {
    console.error("Context-aware spelling check failed:", error.message);
    // Fallback to basic check, but filter out common modern words
    return this.checkSpelling(text).filter(e => 
      !this.isModernWord(e.word)
    );
  }
}

/**
 * Check if a word is a modern/technical term that's correct
 */
isModernWord(word) {
  const modernWords = new Set([
    'selfies', 'selfie', 'influencers', 'influencer',
    'online', 'offline', 'cyberbullying', 'smartphone',
    'internet', 'wifi', 'app', 'apps', 'email', 'blog',
    'vlog', 'podcast', 'hashtag', 'trending', 'viral'
  ]);
  
  return modernWords.has(word.toLowerCase());
}

  /**
   * ✅ IMPROVED: Check spelling with OpenAI context awareness
   */
  // async checkSpellingWithContext(text) {
  //   if (!this.dictionary) {
  //     console.warn("⚠️ Dictionary not ready, skipping spell check");
  //     return [];
  //   }

  //   console.log(`🔤 Checking spelling with context...`);

  //   // Step 1: Find misspelled words using dictionary
  //   const potentialErrors = this.findMisspelledWords(text);
    
  //   if (potentialErrors.length === 0) {
  //     console.log(`✅ No spelling errors found`);
  //     return [];
  //   }

  //   console.log(`   Found ${potentialErrors.length} potential spelling errors`);

  //   // Step 2: Use OpenAI to get context-aware corrections
  //   if (this.openAIService) {
  //     try {
  //       const contextualErrors = await this.getContextualCorrections(text, potentialErrors);
  //       console.log(`✅ OpenAI improved ${contextualErrors.length} corrections`);
  //       return contextualErrors;
  //     } catch (error) {
  //       console.warn("⚠️ OpenAI correction failed, using dictionary suggestions:", error.message);
  //       return potentialErrors;
  //     }
  //   }

  //   return potentialErrors;
  // }

  /**
   * ✅ Synchronous method (backward compatible) - no context awareness
   */
  checkSpelling(text) {
    if (!this.dictionary) {
      console.warn("⚠️ Dictionary not ready, skipping spell check");
      return [];
    }

    console.log(`🔤 Checking spelling (sync mode)...`);
    const errors = this.findMisspelledWords(text);
    console.log(`✅ Found ${errors.length} spelling errors`);
    return errors;
  }

  /**
   * ✅ Find misspelled words using dictionary
   */
  findMisspelledWords(text) {
    const words = text.match(/\b[a-zA-Z']+\b/g) || [];
    const spellingErrors = [];
    const checkedWords = new Set();

    for (const word of words) {
      const lowerWord = word.toLowerCase();

      if (checkedWords.has(lowerWord)) continue;
      checkedWords.add(lowerWord);

      if (word.length < 3) continue;
      if (this.technicalVocabulary.has(lowerWord)) continue;
      if (this.informalWords.has(lowerWord)) continue;
      if (/^\d+$/.test(word)) continue;
      if (word === word.toUpperCase() && word.length > 1) continue;

      const isCorrect = this.dictionary.spellCheck(word);

      if (!isCorrect) {
        const suggestions = this.dictionary.getSuggestions(word, 5) || [];
        
        if (suggestions.length > 0) {
          spellingErrors.push({
            word: word,
            correction: suggestions[0], // Default to first suggestion
            suggestions: suggestions.slice(0, 3),
            context: this.getContext(text, word),
            position: this.findWordPosition(text, word),
            severity: this.calculateSeverity(word, suggestions[0]),
            type: "spelling",
            source: "dictionary",
          });
        }
      }
    }

    return spellingErrors;
  }

  /**
   * ✅ NEW: Get context-aware corrections from OpenAI
   */
  async getContextualCorrections(text, potentialErrors) {
    try {
      const misspelledWords = potentialErrors.map(e => ({
        word: e.word,
        suggestions: e.suggestions,
        context: e.context
      }));

      const prompt = this.buildSpellingPrompt(text, misspelledWords);
      
      const response = await this.openAIService.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a spelling correction expert. Given a text and list of misspelled words with dictionary suggestions, choose the BEST correction based on context. Return ONLY a JSON array."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      if (result.corrections && Array.isArray(result.corrections)) {
        return this.mergeCorrections(potentialErrors, result.corrections);
      }

      return potentialErrors;
    } catch (error) {
      console.error("❌ OpenAI spelling correction error:", error.message);
      throw error;
    }
  }

  /**
   * ✅ Build prompt for OpenAI spelling correction
   */
  buildSpellingPrompt(text, misspelledWords) {
    return `
Text to analyze:
"${text}"

Misspelled words with dictionary suggestions:
${misspelledWords.map((w, i) => `${i + 1}. "${w.word}" → suggestions: [${w.suggestions.join(', ')}]`).join('\n')}

Task: For each misspelled word, choose the BEST correction based on the context of the essay.

Return JSON format:
{
  "corrections": [
    {
      "word": "nowdays",
      "correction": "nowadays",
      "reason": "Refers to the present time period"
    },
    {
      "word": "cides",
      "correction": "sides",
      "reason": "Refers to different aspects/sides of an issue"
    }
  ]
}

IMPORTANT:
- Choose the correction that makes the most sense in the essay context
- "nowdays" should be "nowadays" (not "noways")
- "cides" should be "sides" (not "ciders")
- "intemet" should be "internet" (not "intent")
- "cousing" should be "causing" (not "cousin")
`.trim();
  }

  /**
   * ✅ Merge OpenAI corrections with original errors
   */
  mergeCorrections(originalErrors, aiCorrections) {
    const improvedErrors = [];

    for (const originalError of originalErrors) {
      // Find corresponding AI correction
      const aiCorrection = aiCorrections.find(
        ac => ac.word.toLowerCase() === originalError.word.toLowerCase()
      );

      if (aiCorrection) {
        // Use AI correction (context-aware)
        improvedErrors.push({
          ...originalError,
          correction: aiCorrection.correction,
          suggestions: [aiCorrection.correction, ...originalError.suggestions.slice(0, 2)],
          source: "openai_context",
          aiReason: aiCorrection.reason
        });
        
        console.log(`   ✅ Improved: "${originalError.word}" → "${aiCorrection.correction}" (was: "${originalError.correction}")`);
      } else {
        // Keep dictionary suggestion
        improvedErrors.push(originalError);
      }
    }

    return improvedErrors;
  }

  getContext(text, word, contextLength = 40) {
    const index = text.indexOf(word);
    if (index === -1) return "";

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + word.length + contextLength);
    return "..." + text.substring(start, end).trim() + "...";
  }

  findWordPosition(text, word) {
    const index = text.indexOf(word);
    return {
      start: index !== -1 ? index : 0,
      end: index !== -1 ? index + word.length : word.length,
    };
  }

  calculateSeverity(original, correction) {
    if (!correction) return "high";
    
    const distance = this.levenshteinDistance(
      original.toLowerCase(),
      correction.toLowerCase()
    );

    if (distance <= 1) return "minor";
    if (distance <= 2) return "moderate";
    return "high";
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  applyCorrections(text, errors) {
    let correctedText = text;
    const sortedErrors = [...errors].sort(
      (a, b) => b.position.start - a.position.start
    );

    sortedErrors.forEach((error) => {
      if (error.correction) {
        const before = correctedText.substring(0, error.position.start);
        const after = correctedText.substring(error.position.end);
        correctedText = before + error.correction + after;
      }
    });

    return correctedText;
  }
}

module.exports = SpellingCheckerService;