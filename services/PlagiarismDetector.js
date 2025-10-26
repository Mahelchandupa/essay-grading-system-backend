const natural = require("natural");
const compromise = require("compromise");
const Essay = require("../models/Essay");

class PlagiarismDetector {
  constructor() {
    this.threshold = 0.75;
    this.minChunkSize = 50;
  }

  /**
   * ✅ NEW: Detect citations and quotes properly
   */
  detectCitationsAndQuotes(text) {
  const citations = [];

  // Pattern 1: "text" (Source, Year)
  const citationPattern1 = /"([^"]+)"\s*\(([^)]+)\)/g;
  let matches = text.matchAll(citationPattern1);
  
  for (const match of matches) {
    citations.push({
      type: "quoted_citation",
      quote: match[1],
      source: match[2],
      position: match.index,
      properlyFormatted: true,
    });
  }

  // Pattern 2: According to [Source]
  const citationPattern2 = /according to\s+([^,\.]+)[,\.]/gi;
  matches = text.matchAll(citationPattern2);
  
  for (const match of matches) {
    citations.push({
      type: "attribution",
      source: match[1].trim(),
      position: match.index,
      properlyFormatted: true,
    });
  }

  // Pattern 3: [Source] states/argues/claims
  const citationPattern3 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(states|argues|claims|suggests|mentions)/g;
  matches = text.matchAll(citationPattern3);
  
  for (const match of matches) {
    citations.push({
      type: "attribution",
      source: match[1],
      position: match.index,
      properlyFormatted: true,
    });
  }

  return citations;
}

  async detectPlagiarism(text, studentId) {
    console.log("🔍 Starting enhanced plagiarism detection...");

    // Detect citations first
    const citations = this.detectCitationsAndQuotes(text);
    console.log(`   Found ${citations.length} citations`);

    // Remove cited text from plagiarism check
    let textToCheck = text;

    // Remove quoted content
    textToCheck = textToCheck.replace(/"([^"]+)"\s*\([^)]+\)/g, '');
  
    // Remove obviously attributed statements
    textToCheck = textToCheck.replace(/according to[^,\.]+[,\.]/gi, '');
    textToCheck = textToCheck.replace(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:states|argues|claims|suggests)[^\.]+\./g, '');

    citations.forEach((citation) => {
      if (citation.quote) {
        textToCheck = textToCheck.replace(citation.quote, "");
      }
    });

    const results = {
      overallSimilarity: 0,
      isPlagiarized: false,
      sources: [],
      internalMatches: [],
      confidence: 0,
      checkedChunks: 0,
      citations: citations,
      method: "internal_database_with_citation_detection",
      details: {
        previousSubmissions: [],
        suspiciousPatterns: [],
        statistics: {},
        properCitations: citations.length,
      },
    };

    try {
      // 1. Check against internal database (previous submissions)
      const internalResults = await this.checkInternalDatabase(text, studentId);
      results.internalMatches = internalResults.matches;
      results.details.previousSubmissions = internalResults.details;

      // 2. Detect suspicious patterns
      const patterns = this.detectSuspiciousPatterns(text);
      results.details.suspiciousPatterns = patterns;

      // 3. Statistical analysis
      const stats = this.analyzeTextStatistics(text);
      results.details.statistics = stats;

      // 4. Calculate overall similarity
      const maxInternal = Math.max(
        ...internalResults.matches.map((m) => m.similarity),
        0
      );
      results.overallSimilarity = maxInternal;

      // 5. Determine if plagiarized
      results.isPlagiarized = results.overallSimilarity > this.threshold;
      results.confidence = this.calculateConfidence(results);
      results.checkedChunks = internalResults.chunks;

      console.log(
        `✅ Plagiarism check complete: ${results.overallSimilarity}% similarity`
      );

      return results;
    } catch (error) {
      console.error("Plagiarism detection error:", error);
      return {
        ...results,
        error: error.message,
        confidence: 0,
      };
    }
  }

  /**
   * Check against internal database
   */
  async checkInternalDatabase(text, studentId) {
    try {
      const essays = await Essay.find({
        studentId: { $ne: studentId },
        status: "graded",
      })
        .select("originalText studentId submittedAt title")
        .limit(100);

      const chunks = this.chunkText(text);
      const matches = [];

      for (const essay of essays) {
        const similarity = this.calculateCosineSimilarity(
          text,
          essay.originalText
        );

        if (similarity > 0.5) {
          matches.push({
            essayId: essay._id,
            studentId: essay.studentId,
            title: essay.title,
            similarity: Math.round(similarity * 100),
            submittedAt: essay.submittedAt,
            matchedSections: this.findMatchingSections(
              text,
              essay.originalText
            ),
          });
        }
      }

      return {
        matches: matches
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5),
        chunks: chunks.length,
        details: matches.map((m) => ({
          source: "Previous Submission",
          similarity: m.similarity,
          title: m.title,
          date: m.submittedAt,
        })),
      };
    } catch (error) {
      console.error("Internal database check error:", error);
      return { matches: [], chunks: 0, details: [] };
    }
  }

  /**
   * ✅ NEW: Detect suspicious patterns that indicate plagiarism
   */
  detectSuspiciousPatterns(text) {
    const patterns = [];

    // 1. Detect sudden style changes
    const styleChanges = this.detectStyleChanges(text);
    if (styleChanges.detected) {
      patterns.push({
        type: "style_inconsistency",
        severity: "high",
        description: "Writing style changes dramatically within the essay",
        locations: styleChanges.locations,
      });
    }

    // 2. Detect overly complex vocabulary (above student level)
    const vocabComplexity = this.analyzeVocabularyComplexity(text);
    if (vocabComplexity.isAnomalous) {
      patterns.push({
        type: "vocabulary_anomaly",
        severity: "medium",
        description: "Some sections use unusually advanced vocabulary",
        examples: vocabComplexity.complexWords,
      });
    }

    // 3. Detect perfect grammar (too perfect)
    const grammarPerfection = this.detectPerfectGrammar(text);
    if (grammarPerfection.suspicious) {
      patterns.push({
        type: "perfect_grammar",
        severity: "low",
        description:
          "Unusually perfect grammar throughout (rare for handwritten essays)",
        score: grammarPerfection.score,
      });
    }

    // 4. Detect copy-paste markers (formatting inconsistencies)
    const formatIssues = this.detectFormattingInconsistencies(text);
    if (formatIssues.length > 0) {
      patterns.push({
        type: "formatting_inconsistency",
        severity: "medium",
        description: "Potential copy-paste detected",
        issues: formatIssues,
      });
    }

    return patterns;
  }

  /**
   * Detect style changes
   */
  detectStyleChanges(text) {
    const paragraphs = text.split(/\n\n+/);
    if (paragraphs.length < 2) return { detected: false, locations: [] };

    const styles = paragraphs.map((p) => this.analyzeStyle(p));
    const locations = [];

    for (let i = 1; i < styles.length; i++) {
      const diff = Math.abs(styles[i].complexity - styles[i - 1].complexity);
      if (diff > 30) {
        // 30% difference
        locations.push({
          paragraph: i + 1,
          change: `${styles[i - 1].complexity}% → ${styles[i].complexity}%`,
          description: "Significant complexity change",
        });
      }
    }

    return {
      detected: locations.length > 0,
      locations,
    };
  }

  /**
   * Analyze writing style
   */
  analyzeStyle(text) {
    const doc = compromise(text);
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

    const avgSentenceLength = text.split(/\s+/).length / sentences.length;
    const complexWords =
      doc.match("#Adjective").length + doc.match("#Adverb").length;
    const totalWords = doc.terms().length;

    const complexity = Math.min(
      100,
      ((avgSentenceLength / 25) * 50 + (complexWords / totalWords) * 50) * 100
    );

    return {
      complexity: Math.round(complexity),
      avgSentenceLength,
      complexWordRatio: complexWords / totalWords,
    };
  }

  /**
   * Analyze vocabulary complexity
   */
  analyzeVocabularyComplexity(text) {
    const doc = compromise(text);
    const words = doc.terms().out("array");

    // Advanced vocabulary indicators
    const advancedWords = words.filter(
      (word) =>
        word.length > 10 ||
        /^(nevertheless|consequently|furthermore|notwithstanding|substantially)/i.test(
          word
        )
    );

    const complexityScore = advancedWords.length / words.length;

    return {
      isAnomalous: complexityScore > 0.15, // 15% advanced words
      complexWords: advancedWords.slice(0, 10),
      score: Math.round(complexityScore * 100),
    };
  }

  /**
   * Detect perfect grammar (suspicious for handwritten)
   */
  detectPerfectGrammar(text) {
    const doc = compromise(text);
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

    // Check for common errors
    const hasContractionErrors = /\b(dont|cant|wont|isnt|arent)\b/i.test(text);
    const hasCapitalization = sentences.every((s) => /^[A-Z]/.test(s.trim()));
    const hasPunctuation = sentences.every((s) => /[.!?]$/.test(s.trim()));

    const perfectionScore =
      (!hasContractionErrors ? 33 : 0) +
      (hasCapitalization ? 33 : 0) +
      (hasPunctuation ? 34 : 0);

    return {
      suspicious: perfectionScore === 100,
      score: perfectionScore,
      details: {
        noContractionErrors: !hasContractionErrors,
        perfectCapitalization: hasCapitalization,
        perfectPunctuation: hasPunctuation,
      },
    };
  }

  /**
   * Detect formatting inconsistencies
   */
  detectFormattingInconsistencies(text) {
    const issues = [];

    // Check for multiple spaces (copy-paste artifact)
    if (/\s{3,}/.test(text)) {
      issues.push("Multiple consecutive spaces detected");
    }

    // Check for tab characters
    if (/\t/.test(text)) {
      issues.push("Tab characters detected (not typical in handwritten OCR)");
    }

    // Check for mixed line endings
    const hasUnixLineEndings = /\n/.test(text);
    const hasWindowsLineEndings = /\r\n/.test(text);
    if (hasUnixLineEndings && hasWindowsLineEndings) {
      issues.push("Mixed line ending styles");
    }

    // Check for special Unicode characters
    if (/[\u2000-\u200f\u2028-\u202f]/.test(text)) {
      issues.push("Special Unicode whitespace characters detected");
    }

    return issues;
  }

  /**
   * Analyze text statistics
   */
  analyzeTextStatistics(text) {
    const doc = compromise(text);
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const words = text.split(/\s+/);

    return {
      totalWords: words.length,
      totalSentences: sentences.length,
      avgSentenceLength: Math.round(words.length / sentences.length),
      uniqueWords: new Set(words.map((w) => w.toLowerCase())).size,
      lexicalDiversity: (
        (new Set(words.map((w) => w.toLowerCase())).size / words.length) *
        100
      ).toFixed(1),
      readingLevel: this.calculateReadingLevel(text),
    };
  }

  /**
   * Calculate reading level (Flesch-Kincaid)
   */
  calculateReadingLevel(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const words = text.split(/\s+/);
    const syllables = words.reduce(
      (count, word) => count + this.countSyllables(word),
      0
    );

    const avgSentenceLength = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    const grade = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;

    return {
      grade: Math.max(1, Math.round(grade)),
      level: this.getReadingLevelName(grade),
    };
  }

  /**
   * Count syllables in a word
   */
  countSyllables(word) {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
    word = word.replace(/^y/, "");
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  /**
   * Get reading level name
   */
  getReadingLevelName(grade) {
    if (grade <= 6) return "Elementary";
    if (grade <= 8) return "Middle School";
    if (grade <= 12) return "High School";
    if (grade <= 16) return "College";
    return "Graduate";
  }

  /**
   * Calculate cosine similarity
   */
  calculateCosineSimilarity(text1, text2) {
    const TfIdf = natural.TfIdf;
    const tfidf = new TfIdf();

    tfidf.addDocument(text1.toLowerCase());
    tfidf.addDocument(text2.toLowerCase());

    const vec1 = [];
    const vec2 = [];
    const terms = new Set();

    tfidf.listTerms(0).forEach((item) => terms.add(item.term));
    tfidf.listTerms(1).forEach((item) => terms.add(item.term));

    terms.forEach((term) => {
      vec1.push(tfidf.tfidf(term, 0));
      vec2.push(tfidf.tfidf(term, 1));
    });

    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

    return mag1 && mag2 ? dotProduct / (mag1 * mag2) : 0;
  }

  /**
   * Find matching sections
   */
  findMatchingSections(text1, text2) {
    const sentences1 = text1.match(/[^.!?]+[.!?]+/g) || [];
    const sentences2 = text2.match(/[^.!?]+[.!?]+/g) || [];
    const matches = [];

    sentences1.forEach((sent1, idx) => {
      sentences2.forEach((sent2) => {
        const similarity = this.calculatePhraseSimilarity(sent1, sent2);
        if (similarity > 0.7) {
          matches.push({
            section: sent1.substring(0, 100) + "...",
            similarity: Math.round(similarity * 100),
            position: idx,
          });
        }
      });
    });

    return matches.slice(0, 3);
  }

  /**
   * Calculate phrase similarity
   */
  calculatePhraseSimilarity(phrase1, phrase2) {
    const words1 = new Set(phrase1.toLowerCase().split(/\s+/));
    const words2 = new Set(phrase2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Chunk text
   */
  chunkText(text) {
    const words = text.split(/\s+/);
    const chunks = [];

    for (let i = 0; i < words.length; i += this.minChunkSize) {
      chunks.push(words.slice(i, i + this.minChunkSize * 2).join(" "));
    }

    return chunks;
  }

  /**
   * Calculate confidence
   */
  calculateConfidence(results) {
    let confidence = 0.6; // Base confidence

    if (results.internalMatches.length > 1) confidence += 0.2;
    if (results.details.suspiciousPatterns.length > 2) confidence += 0.1;
    if (results.overallSimilarity > 0.85) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }
}

module.exports = new PlagiarismDetector();
