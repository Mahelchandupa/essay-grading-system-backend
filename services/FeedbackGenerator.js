const natural = require("natural");
const compromise = require("compromise");
const SpellChecker = require("simple-spellchecker");
const writeGood = require("write-good");
const axios = require("axios");

class FeedbackGenerator {
  constructor() {
    this.dictionary = null;
    this.dictionaryReady = false;
    this.initializeDictionary();

    // Cache for API calls to avoid rate limiting
    this.definitionCache = new Map();
    this.maxCacheSize = 2000;
  }

  // Clear cache periodically
  clearOldCache() {
    if (this.definitionCache.size > this.maxCacheSize) {
      const entries = Array.from(this.definitionCache.entries());
      this.definitionCache = new Map(entries.slice(-500));
    }
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

  async generate(params) {
    const {
      text,
      studentLevel,
      studentProfile,
      persistentIssues,
      score,
      qualityScores,
      recentPerformance,
    } = params;

    // Wait for dictionary to be ready
    if (!this.dictionaryReady) {
      await this.initializeDictionary();
    }

    const analysis = this.analyzeEssay(text);

    const feedback = {
      studentLevel,
      grammarErrors: await this.detectGrammarErrors(text, studentLevel),
      spellingErrors: await this.detectSpellingErrors(text, studentLevel),
      styleIssues: this.detectStyleIssues(text, studentLevel),
      vocabularyEnhancements: await this.suggestVocabularyEnhancements(
        text,
        studentLevel
      ),
      sentenceStructure: this.analyzeSentenceStructure(analysis, studentLevel),
      contentFeedback: this.generateContentFeedback(
        analysis,
        qualityScores.content,
        studentLevel
      ),
      organizationFeedback: this.generateOrganizationFeedback(
        analysis,
        qualityScores.organization,
        studentLevel
      ),
      summary: this.generatePersonalizedSummary({
        score,
        studentLevel,
        persistentIssues,
        recentPerformance,
        qualityScores,
        analysis,
      }),
    };

    return feedback;
  }

  analyzeEssay(text) {
    const doc = compromise(text);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
    const words = text.match(/\b\w+\b/g) || [];

    return {
      sentences,
      paragraphs,
      words,
      wordCount: words.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      nouns: doc.nouns().out("array"),
      verbs: doc.verbs().out("array"),
      adjectives: doc.adjectives().out("array"),
      adverbs: doc.adverbs().out("array"),
      hasIntroduction: this.hasIntroduction(paragraphs),
      hasConclusion: this.hasConclusion(paragraphs),
      hasThesis: this.hasThesis(text),
      transitions: this.findTransitions(sentences),
      avgSentenceLength: words.length / sentences.length,
      vocabularyDiversity:
        new Set(words.map((w) => w.toLowerCase())).size / words.length,
      passiveVoiceCount: this.countPassiveVoice(sentences),
      complexSentences: this.identifyComplexSentences(sentences),
    };
  }

  async detectGrammarErrors(text, studentLevel) {
    console.log("🔍 Starting grammar analysis...");

    // Use simple sentence splitting - the most reliable approach
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
    const errors = [];

    console.log(`📝 Found ${sentences.length} sentences to analyze`);

    for (let idx = 0; idx < sentences.length; idx++) {
      const sentence = sentences[idx].trim();
      if (!sentence || sentence.length < 10) continue;

      // Use ONLY the new, simplified grammar checking
      const sentenceErrors = this.checkForRealGrammarErrors(sentence);

      // Add sentence number to errors
      sentenceErrors.forEach((error) => {
        errors.push({
          ...error,
          sentenceNumber: idx + 1,
          explanation: this.getGrammarExplanation(error.type, studentLevel),
          severity: error.severity || "moderate",
        });
      });

      // Check for run-on sentences (only obvious cases)
      if (this.isRunOnSentence(sentence)) {
        errors.push({
          sentence: sentence,
          sentenceNumber: idx + 1,
          type: "run_on_sentence",
          error: "Long sentence that might be hard to read",
          correction:
            "Consider breaking this into shorter sentences for clarity",
          explanation: this.getGrammarExplanation("run_on", studentLevel),
          severity: "minor",
        });
      }
    }

    console.log(`✅ Found ${errors.length} grammar errors`);
    return errors.slice(0, 10); // Limit to most important errors
  }

  /**
   * Analyze a single sentence for grammar errors
   */
  async analyzeSingleSentence(sentence, sentenceNumber, studentLevel) {
    const errors = [];

    // 1. Check for actual common errors (not false positives)
    const realErrors = this.checkForRealGrammarErrors(sentence);
    errors.push(...realErrors);

    // 2. Check sentence structure
    if (this.isRunOnSentence(sentence)) {
      errors.push({
        sentence: sentence,
        sentenceNumber: sentenceNumber,
        type: "run_on_sentence",
        error: "Long sentence that might be hard to read",
        correction: "Consider breaking this into shorter sentences for clarity",
        explanation: this.getGrammarExplanation("run_on", studentLevel),
        severity: "minor",
      });
    }

    // 3. Check for fragments (only if it's actually a fragment)
    if (this.isRealFragment(sentence)) {
      errors.push({
        sentence: sentence,
        sentenceNumber: sentenceNumber,
        type: "sentence_fragment",
        error: "Incomplete thought",
        correction: "Add a subject and verb to complete the sentence",
        explanation: this.getGrammarExplanation("fragments", studentLevel),
        severity: "moderate",
      });
    }

    // Add sentence number to all errors
    errors.forEach((error) => {
      error.sentenceNumber = sentenceNumber;
    });

    return errors;
  }

  /**
   * Check for ONLY obvious, real grammar errors
   */
  checkForRealGrammarErrors(sentence) {
    const errors = [];

    // ONLY check for clear, unambiguous errors
    const obviousErrors = [
      // Subject-verb agreement (clear cases only)
      {
        pattern: /\b(he|she|it)\s+(go|do|have)\b/gi,
        correction: (match) => {
          const verb = match.split(/\s+/)[1];
          const corrections = { go: "goes", do: "does", have: "has" };
          return match.replace(verb, corrections[verb.toLowerCase()] || verb);
        },
        reason: "subject-verb agreement",
        type: "subject_verb_agreement",
      },
      {
        pattern: /\b(I|you|we|they)\s+(goes|does|has)\b/gi,
        correction: (match) => {
          const verb = match.split(/\s+/)[1];
          const corrections = { goes: "go", does: "do", has: "have" };
          return match.replace(verb, corrections[verb.toLowerCase()] || verb);
        },
        reason: "subject-verb agreement",
        type: "subject_verb_agreement",
      },

      // Common pronoun errors (only clear cases)
      {
        pattern: /\btheir\s+(is|are|was|were)\b/gi,
        correction: (match) => match.replace("their", "there"),
        reason: "their vs there confusion",
        type: "pronoun_confusion",
      },
      {
        pattern: /\bthere\s+(house|car|book|idea)\b/gi,
        correction: (match) => match.replace("there", "their"),
        reason: "there vs their confusion",
        type: "pronoun_confusion",
      },

      // Common verb tense errors (only with clear time indicators)
      {
        pattern: /\byesterday\s+(go|see|take)\b/gi,
        correction: (match) => {
          const verb = match.split(/\s+/)[1];
          const pastTense = { go: "went", see: "saw", take: "took" };
          return match.replace(verb, pastTense[verb.toLowerCase()] || verb);
        },
        reason: "verb tense consistency",
        type: "verb_tense",
      },
      {
        pattern: /\btomorrow\s+(went|saw|took)\b/gi,
        correction: (match) => {
          const verb = match.split(/\s+/)[1];
          const presentTense = { went: "go", saw: "see", took: "take" };
          return match.replace(verb, presentTense[verb.toLowerCase()] || verb);
        },
        reason: "verb tense consistency",
        type: "verb_tense",
      },
    ];

    obviousErrors.forEach(({ pattern, correction, reason, type }) => {
      const matches = sentence.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          errors.push({
            sentence: sentence,
            error: reason,
            original: match,
            correction: correction(match),
            type: type,
            severity: "moderate",
          });
        });
      }
    });

    return errors;
  }

  /**
   * PROPER sentence splitting that actually works
   */
  splitIntoSentencesProperly(text) {
    // Clean the text first
    text = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

    // Split on sentence endings but be smart about it
    const sentences = [];
    let currentSentence = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      currentSentence += char;

      // Track quotes
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      }

      // Sentence endings: . ! ? but not in quotes or abbreviations
      if ((char === "." || char === "!" || char === "?") && !inQuotes) {
        // Check if it's likely a real sentence end
        const nextChar = i < text.length - 1 ? text[i + 1] : "";
        const isEndOfSentence =
          nextChar === " " &&
          currentSentence.length > 15 && // Reasonable sentence length
          !this.isAbbreviation(currentSentence.trim());

        if (isEndOfSentence || i === text.length - 1) {
          const cleanSentence = currentSentence.trim();
          if (
            cleanSentence.length > 10 &&
            !cleanSentence.match(/^(section|chapter|figure|\d+\.)/i)
          ) {
            sentences.push(cleanSentence);
          }
          currentSentence = "";
        }
      }
    }

    // Add any remaining text
    if (currentSentence.trim().length > 10) {
      sentences.push(currentSentence.trim());
    }

    return sentences;
  }

  isAbbreviation(sentence) {
    const abbreviations = [
      "mr",
      "mrs",
      "dr",
      "prof",
      "inc",
      "ltd",
      "etc",
      "eg",
      "ie",
    ];
    const words = sentence.toLowerCase().split(" ");
    const lastWord = words[words.length - 1]?.replace(/[.,!?]/g, "");
    return abbreviations.includes(lastWord);
  }

  getSpellingSeverity(word, suggestions) {
    // If no close suggestions, it's more severe
    if (!suggestions || suggestions.length === 0) return "severe";

    // Check Levenshtein distance
    const distance = natural.LevenshteinDistance(
      word.toLowerCase(),
      suggestions[0].toLowerCase()
    );

    if (distance === 1) return "minor"; // typo
    if (distance === 2) return "moderate";
    return "severe"; // completely different word
  }

  /**
   * Proper sentence splitting that handles academic writing
   */
  splitIntoSentences(text) {
    // Remove extra whitespace and normalize
    text = text.replace(/\s+/g, " ").trim();

    // Split on sentence endings but handle abbreviations, titles, etc.
    const sentenceRegex = /[^.!?]*[.!?]\s+/g;
    let matches = text.match(sentenceRegex);

    if (!matches) {
      // Fallback: split on periods, exclamation, question marks
      return text
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 10);
    }

    // Clean up the sentences
    return matches
      .map((sentence) => sentence.trim())
      .filter((sentence) => {
        // Filter out very short fragments and section headers
        return (
          sentence.length > 15 &&
          !sentence.match(/^(section|chapter|figure|table)\s+\d+/i) &&
          !sentence.match(/^\d+\.\s*$/)
        );
      });
  }

  /**
   * Improved spelling detection - fix common word issues
   */
  async detectSpellingErrors(text, studentLevel) {
    if (!this.dictionaryReady) {
      return [];
    }

    const words = text.match(/\b[a-zA-Z']+\b/g) || [];
    const errors = [];
    const seen = new Set();

    // Common words that should NEVER be flagged or corrected incorrectly
    const alwaysCorrectWords = new Set([
      "apps",
      "social",
      "media",
      "online",
      "website",
      "internet",
      "email",
      "digital",
      "mobile",
      "computer",
      "software",
      "hardware",
      "database",
      "network",
      "algorithm",
    ]);

    // Words that often get bad suggestions
    const badSuggestionsMap = {
      apps: ["apps", "applications", "software"],
      chatbots: ["chatbots", "chat bots", "AI assistants"],
      dysmorphia: ["dysmorphia", "body dysmorphia"],
    };

    for (const word of words) {
      const lower = word.toLowerCase();

      // Skip if already checked, too short, or proper noun
      if (seen.has(lower) || word.length <= 3) continue;
      seen.add(lower);

      // Skip proper nouns (capitalized words)
      if (/^[A-Z]/.test(word) && word.length > 3) continue;

      // Skip always-correct words
      if (alwaysCorrectWords.has(lower)) continue;

      // Check spelling
      const isMisspelled = !this.dictionary.spellCheck(word);

      if (isMisspelled) {
        let suggestions = this.dictionary.getSuggestions(word, 3);

        // Use custom suggestions for problematic words
        if (badSuggestionsMap[lower]) {
          suggestions = badSuggestionsMap[lower];
        }

        // Only flag if we have good suggestions
        if (suggestions.length > 0 && suggestions[0] !== word) {
          // Additional filter: don't suggest completely different words
          const distance = natural.LevenshteinDistance(
            word.toLowerCase(),
            suggestions[0].toLowerCase()
          );

          if (distance <= 2) {
            // Only suggest close matches
            errors.push({
              word: word,
              correction: suggestions[0],
              suggestions: suggestions.slice(0, 2),
              context: this.getWordContext(text, word),
              position: this.findWordPosition(text, word),
              severity: this.getSpellingSeverity(word, suggestions),
            });
          }
        }
      }

      // Limit to avoid overwhelming feedback
      if (errors.length >= 10) break;
    }

    return errors;
  }

  getGrammarExplanation(errorType, level) {
    const explanations = {
      subject_verb_agreement: {
        beginner:
          "The subject and verb must match. With 'he/she/it', add 's' to the verb. Example: 'He goes' not 'He go'.",
        intermediate:
          "Ensure subject-verb agreement: singular subjects need singular verbs ending with 's'.",
        advanced:
          "Maintain proper subject-verb agreement throughout your writing, particularly with third-person singular subjects.",
      },
      pronoun_confusion: {
        beginner:
          "Use 'their' for belonging to someone, 'there' for a place, 'they're' for 'they are'.",
        intermediate:
          "Distinguish between possessive 'their', location 'there', and contraction 'they're'.",
        advanced:
          "Ensure correct usage of homophones: their/there/they're, its/it's, your/you're.",
      },
      verb_tense: {
        beginner:
          "Keep verb tenses consistent with time words like 'yesterday' or 'tomorrow'.",
        intermediate:
          "Maintain consistent verb tense with temporal indicators throughout your writing.",
        advanced:
          "Ensure temporal consistency in verb usage unless intentionally shifting timeframes.",
      },
      run_on_sentence: {
        beginner:
          "This sentence is quite long. Try breaking it into shorter sentences for better clarity.",
        intermediate:
          "Consider dividing long sentences or using appropriate punctuation for better readability.",
        advanced:
          "While long sentences can be effective stylistically, they may benefit from restructuring for academic writing.",
      },
    };

    return (
      explanations[errorType]?.[level] ||
      "Consider revising for better clarity and readability."
    );
  }

  /**
   * Rule-based grammar error detection (existing code)
   */
  async detectRuleBasedGrammarErrors(sentence, sentenceNumber, studentLevel) {
    const errors = [];

    // 1. Subject-verb agreement
    const svErrors = this.checkSubjectVerbAgreement(sentence);
    svErrors.forEach((error) =>
      errors.push({
        ...error,
        sentenceNumber: sentenceNumber + 1,
        type: "subject_verb_agreement",
        explanation: this.getGrammarExplanation("subject_verb", studentLevel),
        severity: "moderate",
      })
    );

    // 2. Article errors (a/an/the)
    const articleErrors = this.checkArticles(sentence);
    articleErrors.forEach((error) =>
      errors.push({
        ...error,
        sentenceNumber: sentenceNumber + 1,
        type: "article_usage",
        explanation: this.getGrammarExplanation("articles", studentLevel),
        severity: "minor",
      })
    );

    // 3. Pronoun errors
    const pronounErrors = this.checkPronouns(sentence);
    pronounErrors.forEach((error) =>
      errors.push({
        ...error,
        sentenceNumber: sentenceNumber + 1,
        type: "pronoun_confusion",
        explanation: this.getGrammarExplanation("pronouns", studentLevel),
        severity: "moderate",
      })
    );

    // 4. Verb tense consistency
    const tenseErrors = this.checkVerbTense(sentence);
    tenseErrors.forEach((error) =>
      errors.push({
        ...error,
        sentenceNumber: sentenceNumber + 1,
        type: "verb_tense",
        explanation: this.getGrammarExplanation("tense", studentLevel),
        severity: "moderate",
      })
    );

    // 5. Fragment sentences
    if (this.isFragment(sentence)) {
      errors.push({
        sentence,
        sentenceNumber: sentenceNumber + 1,
        type: "sentence_fragment",
        error: "Incomplete sentence (fragment)",
        correction: "Add a subject and verb to make a complete sentence",
        explanation: this.getGrammarExplanation("fragments", studentLevel),
        severity: "severe",
      });
    }

    // 6. Run-on sentences
    if (this.isRunOn(sentence)) {
      errors.push({
        sentence,
        sentenceNumber: sentenceNumber + 1,
        type: "run_on_sentence",
        error: "Run-on sentence detected",
        correction:
          "Break this into multiple sentences or use proper punctuation",
        explanation: this.getGrammarExplanation("run_on", studentLevel),
        severity: "moderate",
      });
    }

    return errors;
  }

  checkSubjectVerbAgreement(sentence) {
    const errors = [];

    // Enhanced patterns
    const patterns = [
      {
        regex:
          /\b(he|she|it)\s+(go|do|have|say|help|write|need|want|make|take|give|come)\b/gi,
        fix: (match) => {
          const parts = match.split(/\s+/);
          return `${parts[0]} ${parts[1]}s`;
        },
        message: "Third person singular needs -s ending",
      },
      {
        regex: /\b(he|she|it)\s+don't\b/gi,
        fix: (match) => match.replace("don't", "doesn't"),
        message: 'Use "doesn\'t" with he/she/it',
      },
      {
        regex: /\b(I|you|we|they)\s+doesn't\b/gi,
        fix: (match) => match.replace("doesn't", "don't"),
        message: 'Use "don\'t" with I/you/we/they',
      },
      {
        regex: /\b(he|she|it)\s+are\b/gi,
        fix: (match) => match.replace("are", "is"),
        message: 'Use "is" with he/she/it',
      },
      {
        regex: /\b(I|you|we|they)\s+is\b/gi,
        fix: (match) => match.replace("is", "are"),
        message: 'Use "are" with you/we/they, or "am" with I',
      },
    ];

    patterns.forEach(({ regex, fix, message }) => {
      const matches = sentence.match(regex);
      if (matches) {
        matches.forEach((match) => {
          errors.push({
            sentence,
            error: message,
            original: match,
            correction: fix(match),
            rule: "subject_verb_agreement",
          });
        });
      }
    });

    return errors;
  }

  checkArticles(sentence) {
    const errors = [];

    // FIXED: Better pattern that avoids suggesting articles for verbs
    const pattern =
      /\b(have|has|need|needs|want|wants|buy|bought|see|saw|find|found|use|uses|get|got)\s+([a-z]+)\b/gi;
    const matches = [...sentence.matchAll(pattern)];

    // Common uncountable/mass nouns that don't need articles
    const uncountable = new Set([
      "water",
      "time",
      "money",
      "information",
      "advice",
      "research",
      "evidence",
      "furniture",
      "equipment",
      "homework",
      "knowledge",
      "news",
      "progress",
      "traffic",
      "travel",
      "work",
      "access",
      "food",
      "music",
      "art",
      "literature",
      "software",
      "data",
    ]);

    // Words that should NEVER have articles before them
    const neverArticle = new Set([
      "become",
      "to",
      "that",
      "which",
      "who",
      "whom",
      "whose",
      "and",
      "or",
      "but",
      "so",
      "because",
      "since",
      "although",
      "if",
      "when",
      "where",
      "why",
      "how",
      "what",
    ]);

    for (const match of matches) {
      const noun = match[2].toLowerCase();

      // Skip if uncountable, plural, or should never have article
      if (uncountable.has(noun) || neverArticle.has(noun)) continue;
      if (noun.endsWith("s") && !noun.endsWith("ss")) continue; // Plurals

      // Check if article already present nearby
      const contextBefore = sentence.substring(
        Math.max(0, match.index - 20),
        match.index
      );
      if (
        /\b(a|an|the|my|your|his|her|its|our|their|some|any|this|that|these|those)\b/i.test(
          contextBefore
        )
      ) {
        continue;
      }

      // Only suggest article for actual countable nouns
      const article = /^[aeiou]/i.test(noun) ? "an" : "a";
      errors.push({
        sentence,
        error: `Consider adding an article before "${noun}"`,
        original: noun,
        correction: `${article} ${noun}`,
        rule: "article_usage",
      });
    }

    return errors.slice(0, 3); // Very limited suggestions
  }

  checkPronouns(sentence) {
    const errors = [];

    const confusedPairs = [
      {
        wrong:
          /\bthere\s+(way|idea|approach|method|plan|strategy|work|job|homework|essay|project)\b/gi,
        correct: "their",
        explanation: 'Use "their" for possession (belonging to them)',
      },
      {
        wrong: /\btheir\s+(is|are|was|were)\b/gi,
        correct: "there",
        explanation: 'Use "there" for location or existence',
      },
      {
        wrong: /\bits\s+(a|an|the|very|really|so|quite)\b/gi,
        correct: "it's",
        explanation: 'Use "it\'s" as contraction for "it is" or "it has"',
      },
      {
        wrong: /\byour\s+(a|an|the|going|coming|doing|being|very|really)\b/gi,
        correct: "you're",
        explanation: 'Use "you\'re" as contraction for "you are"',
      },
    ];

    confusedPairs.forEach(({ wrong, correct, explanation }) => {
      const matches = sentence.match(wrong);
      if (matches) {
        matches.forEach((match) => {
          errors.push({
            sentence,
            error: `Incorrect pronoun usage`,
            original: match,
            correction: match.replace(/\w+/, correct),
            explanation,
            rule: "pronoun_confusion",
          });
        });
      }
    });

    return errors;
  }

  checkVerbTense(sentence) {
    const errors = [];

    // Check for sudden tense shifts (simplified)
    const hasPast =
      /\b(was|were|had|did|went|came|saw|made|took|gave|got|said|told|wrote|found|thought|knew|felt|became)\b/i.test(
        sentence
      );
    const hasPresent =
      /\b(is|are|am|has|have|does|do|goes|comes|sees|makes|takes|gives|gets|says|tells|writes|finds|thinks|knows|feels|becomes)\b/i.test(
        sentence
      );

    if (hasPast && hasPresent) {
      errors.push({
        sentence,
        error: "Possible tense shift within sentence",
        correction: "Keep verb tenses consistent throughout your sentence",
        rule: "verb_tense",
        severity: "moderate",
      });
    }

    return errors;
  }

  /**
   * Check if a word looks like a technical term vs a real spelling error
   */
  looksLikeTechnicalTerm(original, suggestion) {
    // If the "correction" is completely different, it's probably a technical term
    const distance = natural.LevenshteinDistance(
      original.toLowerCase(),
      suggestion.toLowerCase()
    );

    // If Levenshtein distance is > 3, it's probably not a simple spelling error
    return distance > 3;
  }

  checkDoubleNegatives(sentence) {
    const errors = [];
    const negatives = [
      "not",
      "n't",
      "no",
      "never",
      "nothing",
      "nobody",
      "nowhere",
      "neither",
      "none",
    ];

    let negCount = 0;
    let foundNegs = [];

    negatives.forEach((neg) => {
      if (sentence.toLowerCase().includes(neg)) {
        negCount++;
        foundNegs.push(neg);
      }
    });

    if (negCount >= 2) {
      errors.push({
        sentence,
        error: "Double negative detected",
        original: foundNegs.join(" ... "),
        correction: "Remove one negative word to make the sentence clearer",
        rule: "double_negative",
      });
    }

    return errors;
  }

  isFragment(sentence) {
    // Very basic fragment detection
    const words = sentence.split(/\s+/);
    if (words.length < 3) return true;

    // Check for verb
    const hasVerb =
      /\b(is|are|am|was|were|be|been|being|have|has|had|do|does|did|can|could|will|would|shall|should|may|might|must|going|coming|make|take|get|give|see|know|think|want|need|use|find|tell|ask|work|seem|feel|try|leave|call|keeps?|goes|comes|makes|takes|gets|gives|sees|knows|thinks|wants|needs|uses|finds|tells|asks|works|seems|feels|tries|leaves|calls)\b/i.test(
        sentence
      );

    return !hasVerb;
  }

  isRunOn(sentence) {
    // Check for comma splices and very long sentences
    const words = sentence.split(/\s+/);
    if (words.length > 40) return true; // Very long sentence

    // Check for comma splice pattern
    const hasCommaSplice =
      /,\s+(however|therefore|moreover|furthermore|consequently|nevertheless|thus|hence|indeed)\s/i.test(
        sentence
      );

    return hasCommaSplice;
  }

  /**
   * Improved style issues detection
   */
  detectStyleIssues(text, studentLevel) {
    const issues = [];

    // Only flag obvious style problems
    const stylePatterns = [
      {
        pattern: /\b(very|really|quite)\s+\w+/gi,
        reason: "Overused intensifier",
        suggestion: "Try using a stronger word instead",
        example: 'Instead of "very good" try "excellent" or "outstanding"',
      },
      {
        pattern: /\b(a lot|lots of)\b/gi,
        reason: "Informal expression",
        suggestion:
          'Use more formal alternatives like "many", "much", or "numerous"',
        example: 'Instead of "a lot of people" try "many people"',
      },
      {
        pattern: /\b(thing|stuff)\b/gi,
        reason: "Vague language",
        suggestion: "Be more specific about what you are referring to",
        example:
          'Instead of "many things" try "many factors" or "several elements"',
      },
    ];

    stylePatterns.forEach(({ pattern, reason, suggestion, example }) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          issues.push({
            type: reason,
            text: match,
            context: this.getWordContext(text, match),
            suggestion: suggestion,
            example: example,
            position: this.findWordPosition(text, match),
          });
        });
      }
    });

    return issues.slice(0, 5); // Limit style feedback
  }

  /**
   * Helper methods
   */
  getWordContext(text, word, contextLength = 30) {
    const index = text.indexOf(word);
    if (index === -1) return "";

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + word.length + contextLength);
    return "..." + text.substring(start, end).trim() + "...";
  }

  findWordPosition(text, word) {
    const index = text.indexOf(word);
    return {
      start: index,
      end: index + word.length,
    };
  }

  isRealFragment(sentence) {
    // Only flag obvious fragments
    const words = sentence.split(/\s+/);
    if (words.length < 4) return true;

    // Check for basic sentence structure
    const hasSubject =
      /\b(I|you|he|she|it|we|they|this|that|these|those|\w+s)\b/i.test(
        sentence
      );
    const hasVerb =
      /\b(is|are|was|were|have|has|had|do|does|did|can|could|will|would|should|may|might|must|go|goes|went|make|makes|made|take|takes|took)\b/i.test(
        sentence
      );

    return !(hasSubject && hasVerb);
  }

  /**
   * Only flag VERY long sentences as run-on
   */
  isRunOnSentence(sentence) {
    const words = sentence.split(/\s+/);
    // Only flag extremely long sentences (60+ words)
    return words.length > 60;
  }

  getStyleSuggestion(reason, level) {
    const suggestions = {
      "passive voice": {
        beginner:
          'Try to use active voice. Instead of "The ball was thrown," write "John threw the ball."',
        intermediate: "Active voice makes writing more direct and engaging.",
        advanced:
          "Consider converting to active voice for stronger, more direct prose.",
      },
      "weasel words": {
        beginner:
          'Avoid vague words like "very," "really," "quite." Be more specific.',
        intermediate: "Replace weak qualifiers with concrete descriptions.",
        advanced:
          "Eliminate unnecessary qualifiers to strengthen your argument.",
      },
      wordy: {
        beginner: "This phrase is too long. Try to make it shorter.",
        intermediate: "Simplify this phrase for clearer communication.",
        advanced: "Consider a more concise alternative.",
      },
    };

    return (
      suggestions[reason]?.[level] ||
      suggestions[reason]?.intermediate ||
      "Consider revising for clarity."
    );
  }

  /**
   * NEW: Vocabulary enhancement suggestions using Dictionary API
   */
  async suggestVocabularyEnhancements(text, studentLevel) {
    if (studentLevel === "beginner") return []; // Skip for beginners

    const suggestions = [];
    const doc = compromise(text);

    // Find commonly overused words
    const overusedWords = this.findOverusedWords(text);

    for (const word of overusedWords.slice(0, 5)) {
      try {
        const alternatives = await this.getWordAlternatives(word);
        if (alternatives.length > 0) {
          suggestions.push({
            original: word,
            alternatives: alternatives.slice(0, 3),
            reason: `"${word}" appears ${
              overusedWords.find((w) => w === word)
                ? "frequently"
                : "multiple times"
            }. Consider varying your vocabulary.`,
            context: this.getContext(text, word),
          });
        }
      } catch (error) {
        // Skip if API fails
        continue;
      }
    }

    return suggestions;
  }

  findOverusedWords(text) {
    const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const frequency = {};

    // Common words to ignore
    const ignore = new Set([
      "that",
      "this",
      "with",
      "from",
      "have",
      "will",
      "been",
      "were",
      "their",
      "which",
      "about",
      "would",
      "there",
      "could",
      "should",
      "these",
      "those",
      "what",
      "when",
      "where",
      "them",
      "then",
      "than",
      "into",
      "very",
      "some",
      "make",
      "like",
      "time",
      "just",
      "know",
      "take",
      "people",
      "year",
      "good",
      "work",
      "also",
      "well",
      "many",
      "much",
      "most",
      "more",
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
    // Check cache first
    if (this.definitionCache.has(word)) {
      return this.definitionCache.get(word);
    }

    try {
      const response = await axios.get(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`,
        { timeout: 3000 }
      );

      const synonyms = new Set();
      response.data.forEach((entry) => {
        entry.meanings?.forEach((meaning) => {
          meaning.definitions?.forEach((def) => {
            def.synonyms?.forEach((syn) => synonyms.add(syn));
          });
          meaning.synonyms?.forEach((syn) => synonyms.add(syn));
        });
      });

      const result = Array.from(synonyms).slice(0, 5);
      this.definitionCache.set(word, result);
      return result;
    } catch (error) {
      return [];
    }
  }

  /**
   * NEW: Sentence structure analysis
   */
  analyzeSentenceStructure(analysis, studentLevel) {
    const issues = [];
    const suggestions = [];

    // Check sentence length variety
    const sentenceLengths = analysis.sentences.map(
      (s) => s.split(/\s+/).length
    );
    const avgLength =
      sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
    const variance =
      sentenceLengths.reduce(
        (sum, len) => sum + Math.pow(len - avgLength, 2),
        0
      ) / sentenceLengths.length;

    if (variance < 10) {
      issues.push("Sentences are too similar in length");
      suggestions.push(
        "Vary your sentence structure with short, medium, and long sentences"
      );
    }

    // Check for sentence variety
    const shortSentences = sentenceLengths.filter((l) => l < 10).length;
    const longSentences = sentenceLengths.filter((l) => l > 25).length;

    if (shortSentences / sentenceLengths.length > 0.7) {
      issues.push("Many very short sentences");
      suggestions.push(
        "Combine related ideas into longer, more complex sentences"
      );
    }

    if (longSentences / sentenceLengths.length > 0.5) {
      issues.push("Many very long sentences");
      suggestions.push(
        "Break down complex ideas into shorter, clearer sentences"
      );
    }

    // Check paragraph length
    const paragraphLengths = analysis.paragraphs.map(
      (p) => p.split(/\s+/).length
    );
    const avgParagraphLength =
      paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length;

    if (avgParagraphLength < 50) {
      suggestions.push(
        "Develop your paragraphs more fully with examples and explanations"
      );
    } else if (avgParagraphLength > 200) {
      suggestions.push(
        "Consider breaking long paragraphs into smaller ones for better readability"
      );
    }

    return {
      issues,
      suggestions,
      metrics: {
        avgSentenceLength: avgLength.toFixed(1),
        sentenceVariety: variance > 20 ? "Good" : "Needs improvement",
        avgParagraphLength: avgParagraphLength.toFixed(0),
      },
    };
  }

  countPassiveVoice(sentences) {
    let count = 0;
    const passivePattern = /\b(am|is|are|was|were|be|been|being)\s+\w+ed\b/gi;

    sentences.forEach((sentence) => {
      if (passivePattern.test(sentence)) count++;
    });

    return count;
  }

  identifyComplexSentences(sentences) {
    return sentences.filter((s) => {
      const words = s.split(/\s+/).length;
      const clauses = (s.match(/,|;|\band\b|\bor\b|\bbut\b/gi) || []).length;
      return words > 20 || clauses > 2;
    });
  }

  getContext(text, word) {
    const index = text.indexOf(word);
    if (index === -1) return "";

    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + word.length + 40);
    return "..." + text.substring(start, end).trim() + "...";
  }

  getGrammarExplanation(errorType, level) {
    const explanations = {
      subject_verb: {
        beginner:
          "The subject and verb must match. With 'he/she/it', add 's' to the verb. Example: 'He walks' not 'He walk'.",
        intermediate:
          "Ensure subject-verb agreement: singular subjects take singular verbs (add 's').",
        advanced:
          "Maintain subject-verb agreement, particularly with third-person singular subjects.",
      },
      articles: {
        beginner:
          "Use 'a' or 'an' before singular nouns. Use 'a' before consonants (a book), 'an' before vowels (an apple).",
        intermediate:
          "Articles (a/an/the) are required before singular countable nouns. 'The' for specific items, 'a/an' for general.",
        advanced:
          "Ensure proper article usage based on noun countability and specificity.",
      },
      pronouns: {
        beginner:
          "Common confusions: 'there' (place), 'their' (ownership), 'they're' (they are). 'Its' (ownership), 'it's' (it is).",
        intermediate:
          "Distinguish homophones carefully: there/their/they're, its/it's, your/you're.",
        advanced: "Use context-appropriate pronouns and possessives correctly.",
      },
      tense: {
        beginner:
          "Keep the same time throughout your sentence. Don't mix 'is' with 'was'.",
        intermediate:
          "Maintain consistent verb tense within sentences and paragraphs.",
        advanced:
          "Ensure temporal consistency unless intentionally shifting timeframes.",
      },
      fragments: {
        beginner:
          "Every sentence needs a subject (who/what) and a verb (action). Example: 'The dog runs.' not just 'Running fast.'",
        intermediate:
          "Incomplete sentences (fragments) lack either a subject or a complete verb.",
        advanced:
          "Ensure all clauses form complete, independent thoughts with both subject and predicate.",
      },
      run_on: {
        beginner:
          "Don't connect two complete sentences with just a comma. Use a period or add 'and', 'but', 'or'.",
        intermediate:
          "Avoid comma splices. Use semicolons, conjunctions, or separate sentences.",
        advanced:
          "Connect independent clauses with appropriate punctuation or conjunctions.",
      },
    };

    return (
      explanations[errorType]?.[level] ||
      explanations[errorType]?.intermediate ||
      "Grammar issue detected."
    );
  }

  // Content feedback generation (enhanced)
  generateContentFeedback(analysis, contentScore, level) {
    const strengths = [];
    const improvements = [];
    const examples = [];

    const normalizedScore = contentScore * 100;

    // Analyze strengths
    if (analysis.hasThesis) {
      strengths.push("Clear thesis statement present");
    }

    if (analysis.vocabularyDiversity > 0.5) {
      strengths.push(
        `Good vocabulary variety (${Math.round(
          analysis.vocabularyDiversity * 100
        )}% unique words)`
      );
    }

    if (analysis.transitions.length >= 3) {
      strengths.push(
        `Effective use of transitions (${analysis.transitions.length} found)`
      );
    }

    if (analysis.paragraphCount >= 5) {
      strengths.push("Well-structured with multiple paragraphs");
    }

    // Suggest improvements
    if (!analysis.hasThesis) {
      improvements.push(
        "Add a clear thesis statement that presents your main argument"
      );
      examples.push({
        type: "thesis_example",
        text: "Example thesis: 'While technology offers many benefits in education, it should not completely replace traditional teaching methods.'",
        explanation: "Place your thesis at the end of your introduction",
      });
    }

    if (analysis.transitions.length < 3) {
      improvements.push("Use more transitional phrases to connect your ideas");
      examples.push({
        type: "transitions",
        text: "Try: 'Furthermore', 'In addition', 'However', 'On the other hand', 'As a result', 'Consequently'",
        explanation: "Transitions help readers follow your argument",
      });
    }

    if (analysis.avgSentenceLength < 12) {
      improvements.push("Develop sentences with more detail and complexity");
      examples.push({
        type: "sentence_development",
        before: "Technology is important. It helps students.",
        after:
          "Technology is important in education because it helps students access information quickly and learn at their own pace.",
        explanation: "Combine related ideas and add supporting details",
      });
    }

    if (analysis.wordCount < 300 && level !== "beginner") {
      improvements.push(
        "Expand your essay with more examples and explanations"
      );
    }

    return { strengths, improvements, examples };
  }

  generateOrganizationFeedback(analysis, orgScore, level) {
    const suggestions = [];
    const positives = [];

    if (analysis.hasIntroduction) {
      positives.push("Clear introduction present");
    } else {
      suggestions.push(
        "Add an introduction that provides background and presents your thesis"
      );
    }

    if (analysis.hasConclusion) {
      positives.push("Conclusion summarizes main points");
    } else {
      suggestions.push(
        "Include a conclusion that restates your thesis and summarizes key arguments"
      );
    }

    if (analysis.paragraphCount < 4) {
      suggestions.push(
        "Organize ideas into more paragraphs (aim for 5-6 in an academic essay)"
      );
    } else if (analysis.paragraphCount >= 5) {
      positives.push("Good paragraph structure");
    }

    if (analysis.transitions.length < 3) {
      suggestions.push(
        "Use more transition words between paragraphs (Moreover, However, Furthermore)"
      );
    }

    const structure = this.assessStructure(analysis);

    return {
      structure,
      suggestions,
      positives,
      organizationScore: Math.round(orgScore * 100),
    };
  }

  generatePersonalizedSummary(params) {
    const { score, studentLevel, qualityScores, analysis } = params;

    let overallComment = "";
    let motivationalMessage = "";
    const keyTakeaways = [];
    const nextSteps = [];

    const avgQuality =
      (qualityScores.grammar +
        qualityScores.content +
        qualityScores.organization +
        qualityScores.style +
        qualityScores.mechanics) /
      5;
    const normalizedAvg = avgQuality * 100;

    // Overall assessment
    if (normalizedAvg >= 85) {
      overallComment =
        "🌟 Excellent work! Your essay demonstrates strong writing skills.";
      motivationalMessage =
        "Keep up the outstanding effort! Continue refining your academic voice.";
    } else if (normalizedAvg >= 75) {
      overallComment =
        "👍 Good effort! Solid foundation with clear room for growth.";
      motivationalMessage =
        "You're on the right track! Focus on the specific areas highlighted below.";
    } else if (normalizedAvg >= 65) {
      overallComment = "📚 Making progress! Keep working on the fundamentals.";
      motivationalMessage =
        "Practice makes perfect! Work through the feedback systematically.";
    } else {
      overallComment =
        "💪 Keep practicing! Focus on building strong foundations.";
      motivationalMessage =
        "Writing improves with practice. Start with the most important errors first.";
    }

    // Key takeaways
    if (qualityScores.grammar * 100 < 70) {
      keyTakeaways.push(
        "Grammar needs attention - review subject-verb agreement and verb tenses"
      );
    }

    if (qualityScores.organization * 100 < 70) {
      keyTakeaways.push(
        "Improve essay structure with clear introduction, body, and conclusion"
      );
    }

    if (qualityScores.content * 100 < 75) {
      keyTakeaways.push(
        "Develop arguments more fully with specific examples and evidence"
      );
    }

    if (analysis.vocabularyDiversity < 0.4) {
      keyTakeaways.push("Expand vocabulary to avoid repetition");
    }

    // Next steps (prioritized)
    nextSteps.push(
      "Review and correct all highlighted spelling and grammar errors"
    );

    if (!analysis.hasThesis) {
      nextSteps.push("Add a clear thesis statement to your introduction");
    }

    nextSteps.push("Read your essay aloud to catch awkward phrasing");

    if (analysis.transitions.length < 3) {
      nextSteps.push("Add transition words between paragraphs");
    }

    nextSteps.push("Have someone else read your essay for feedback");

    return {
      overallComment,
      motivationalMessage,
      keyTakeaways,
      nextSteps,
      wordsAnalyzed: analysis.wordCount,
      sentencesAnalyzed: analysis.sentenceCount,
    };
  }

  // Helper methods
  hasIntroduction(paragraphs) {
    if (paragraphs.length === 0) return false;
    const first = paragraphs[0].toLowerCase();
    const indicators = [
      "introduction",
      "this essay",
      "will discuss",
      "will explore",
      "will examine",
      "will analyze",
      "is important",
      "focuses on",
      "in this essay",
      "this paper",
    ];
    const words = first.split(/\s+/);
    return words.length >= 30 || indicators.some((ind) => first.includes(ind));
  }

  hasConclusion(paragraphs) {
    if (paragraphs.length === 0) return false;
    const last = paragraphs[paragraphs.length - 1].toLowerCase();
    const indicators = [
      "conclusion",
      "in summary",
      "to conclude",
      "in conclusion",
      "to sum up",
      "overall",
      "ultimately",
      "in the end",
      "therefore",
      "thus",
    ];
    const words = last.split(/\s+/);
    return words.length >= 30 || indicators.some((ind) => last.includes(ind));
  }

  hasThesis(text) {
    const first500 = text.substring(0, 500).toLowerCase();
    const indicators = [
      "will discuss",
      "will explore",
      "will examine",
      "focuses on",
      "this essay",
      "main argument",
      "argue that",
      "will show",
      "demonstrates",
      "thesis",
    ];
    return indicators.some((ind) => first500.includes(ind));
  }

  findTransitions(sentences) {
    const transitions = [
      "however",
      "therefore",
      "moreover",
      "furthermore",
      "firstly",
      "secondly",
      "finally",
      "in addition",
      "on the other hand",
      "consequently",
      "as a result",
      "for example",
      "for instance",
      "similarly",
      "likewise",
      "in contrast",
      "nevertheless",
      "also",
      "additionally",
      "meanwhile",
      "subsequently",
    ];
    const found = new Set();

    sentences.forEach((s) => {
      const lower = s.toLowerCase();
      transitions.forEach((t) => {
        if (lower.includes(t)) {
          found.add(t);
        }
      });
    });

    return Array.from(found);
  }

  assessStructure(analysis) {
    const score =
      analysis.hasIntroduction +
      analysis.hasConclusion +
      (analysis.paragraphCount >= 5 ? 1 : 0);

    if (score === 3) {
      return "✓ Well-structured with introduction, body paragraphs, and conclusion";
    } else if (score === 2) {
      return "ⓘ Good structure, but missing one key component";
    } else {
      return "✗ Needs better organization - add clear introduction, body paragraphs, and conclusion";
    }
  }
}

module.exports = FeedbackGenerator;

/**
 * ENHANCED: Grammar detection with more comprehensive patterns
 */
// async detectGrammarErrors(text, studentLevel) {
//   const errors = [];
//   const sentences = text.split(/[.!?]+/).filter(s => s.trim());

//   for (let idx = 0; idx < sentences.length; idx++) {
//     const sentence = sentences[idx].trim();
//     if (!sentence) continue;

//     // 1. Subject-verb agreement
//     const svErrors = this.checkSubjectVerbAgreement(sentence);
//     svErrors.forEach(error => errors.push({
//       ...error,
//       sentenceNumber: idx + 1,
//       type: 'subject_verb_agreement',
//       explanation: this.getGrammarExplanation('subject_verb', studentLevel),
//       severity: 'moderate'
//     }));

//     // 2. Article errors (a/an/the)
//     const articleErrors = this.checkArticles(sentence);
//     articleErrors.forEach(error => errors.push({
//       ...error,
//       sentenceNumber: idx + 1,
//       type: 'article_usage',
//       explanation: this.getGrammarExplanation('articles', studentLevel),
//       severity: 'minor'
//     }));

//     // 3. Pronoun errors (there/their/they're, its/it's, your/you're)
//     const pronounErrors = this.checkPronouns(sentence);
//     pronounErrors.forEach(error => errors.push({
//       ...error,
//       sentenceNumber: idx + 1,
//       type: 'pronoun_confusion',
//       explanation: this.getGrammarExplanation('pronouns', studentLevel),
//       severity: 'moderate'
//     }));

//     // 4. Verb tense consistency
//     const tenseErrors = this.checkVerbTense(sentence);
//     tenseErrors.forEach(error => errors.push({
//       ...error,
//       sentenceNumber: idx + 1,
//       type: 'verb_tense',
//       explanation: this.getGrammarExplanation('tense', studentLevel),
//       severity: 'moderate'
//     }));

//     // 5. Fragment sentences
//     if (this.isFragment(sentence)) {
//       errors.push({
//         sentence,
//         sentenceNumber: idx + 1,
//         type: 'sentence_fragment',
//         error: 'Incomplete sentence (fragment)',
//         correction: 'Add a subject and verb to make a complete sentence',
//         explanation: this.getGrammarExplanation('fragments', studentLevel),
//         severity: 'severe'
//       });
//     }

//     // 6. Run-on sentences
//     if (this.isRunOn(sentence)) {
//       errors.push({
//         sentence,
//         sentenceNumber: idx + 1,
//         type: 'run_on_sentence',
//         error: 'Run-on sentence detected',
//         correction: 'Break this into multiple sentences or use proper punctuation',
//         explanation: this.getGrammarExplanation('run_on', studentLevel),
//         severity: 'moderate'
//       });
//     }

//     // 7. Double negatives
//     const doubleNegErrors = this.checkDoubleNegatives(sentence);
//     doubleNegErrors.forEach(error => errors.push({
//       ...error,
//       sentenceNumber: idx + 1,
//       type: 'double_negative',
//       explanation: 'Avoid using two negative words in the same clause',
//       severity: 'moderate'
//     }));
//   }

//   return errors.slice(0, 20); // Limit to top 20
// }

// async detectGrammarErrors(text, studentLevel) {
//   try {
//     // Split the essay into sentences first
//     const sentences = this.splitIntoSentences(text);
//     const grammarCorrections = [];

//     console.log(
//       `Processing ${sentences.length} sentences for grammar checking...`
//     );

//     // Process each sentence individually with timeout for each
//     for (let i = 0; i < sentences.length; i++) {
//       const sentence = sentences[i].trim();

//       // Skip very short sentences or whitespace-only
//       if (sentence.length < 3 || !sentence.match(/[a-zA-Z]/)) continue;

//       try {
//         const response = await axios.post(
//           `${process.env.INFERENCE_SERVICE_URL}/correct_grammar`,
//           {
//             text: sentence,
//             mode: "analyze",
//           },
//           { timeout: 3000 } // 3 seconds per sentence (reduced from 5)
//         );

//         // Check if we got corrections and the sentence was actually changed
//         if (
//           response.data.corrections &&
//           response.data.corrections.length > 0 &&
//           response.data.corrections[0].original !==
//             response.data.corrections[0].correction
//         ) {
//           grammarCorrections.push({
//             ...response.data.corrections[0],
//             sentence_number: i + 1,
//           });
//         }

//         // Small delay to avoid overwhelming the service (optional)
//         if (i % 5 === 0 && i < sentences.length - 1) {
//           await new Promise((resolve) => setTimeout(resolve, 50));
//         }
//       } catch (error) {
//         console.log(
//           `Skipping sentence ${i + 1} due to error: ${error.message}`
//         );
//         // Continue with other sentences even if one fails
//         continue;
//       }
//     }

//     console.log(`Found ${grammarCorrections.length} grammar corrections`);

//     const errors = [];

//     // Convert the corrections to the format expected by your frontend
//     grammarCorrections.forEach((correction) => {
//       errors.push({
//         sentence: correction.original, // This will now be just the sentence, not the whole essay
//         sentenceNumber: correction.sentence_number,
//         type: "grammar_correction",
//         error: "Grammar issue detected",
//         original: correction.original,
//         correction: correction.correction,
//         reason: correction.reason,
//         explanation: this.getGrammarExplanationFromReason(
//           correction.reason,
//           studentLevel
//         ),
//         confidence: correction.confidence || 0.8,
//         severity: this.getGrammarSeverity(
//           correction.original,
//           correction.correction
//         ),
//       });
//     });

//     // Also include rule-based errors for comprehensive feedback
//     const ruleBasedErrors = await this.detectRuleBasedGrammarErrors(
//       text,
//       studentLevel
//     );
//     errors.push(...ruleBasedErrors);

//     return errors.slice(0, 25);
//   } catch (error) {
//     console.error("Grammar analysis service error:", error.message);
//     // Fallback to rule-based only
//     return await this.detectRuleBasedGrammarErrors(text, studentLevel);
//   }
// }
