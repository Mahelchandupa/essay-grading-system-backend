const natural = require("natural");
const compromise = require("compromise");
const Essay = require("../models/Essay");
const OpenAIService = require("./OpenAIService");

class PlagiarismDetector {
  constructor() {
    this.threshold = 0.75;
    this.minChunkSize = 50;
    this.conceptualThreshold = 0.85;
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
    const citationPattern3 =
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(states|argues|claims|suggests|mentions)/g;
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

  // async detectPlagiarism(text, studentId) {
  //   console.log("🔍 Starting enhanced plagiarism detection...");

  //   // Detect citations first
  //   const citations = this.detectCitationsAndQuotes(text);
  //   console.log(`   Found ${citations.length} citations`);

  //   // Remove cited text from plagiarism check
  //   let textToCheck = text;

  //   // Remove quoted content
  //   textToCheck = textToCheck.replace(/"([^"]+)"\s*\([^)]+\)/g, '');

  //   // Remove obviously attributed statements
  //   textToCheck = textToCheck.replace(/according to[^,\.]+[,\.]/gi, '');
  //   textToCheck = textToCheck.replace(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:states|argues|claims|suggests)[^\.]+\./g, '');

  //   citations.forEach((citation) => {
  //     if (citation.quote) {
  //       textToCheck = textToCheck.replace(citation.quote, "");
  //     }
  //   });

  //   const results = {
  //     overallSimilarity: 0,
  //     isPlagiarized: false,
  //     sources: [],
  //     internalMatches: [],
  //     confidence: 0,
  //     checkedChunks: 0,
  //     citations: citations,
  //     method: "internal_database_with_citation_detection",
  //     details: {
  //       previousSubmissions: [],
  //       suspiciousPatterns: [],
  //       statistics: {},
  //       properCitations: citations.length,
  //     },
  //   };

  //   try {
  //     // 1. Check against internal database (previous submissions)
  //     const internalResults = await this.checkInternalDatabase(text, studentId);
  //     results.internalMatches = internalResults.matches;
  //     results.details.previousSubmissions = internalResults.details;

  //     // 2. Detect suspicious patterns
  //     const patterns = this.detectSuspiciousPatterns(text);
  //     results.details.suspiciousPatterns = patterns;

  //     // 3. Statistical analysis
  //     const stats = this.analyzeTextStatistics(text);
  //     results.details.statistics = stats;

  //     // 4. Calculate overall similarity
  //     const maxInternal = Math.max(
  //       ...internalResults.matches.map((m) => m.similarity),
  //       0
  //     );
  //     results.overallSimilarity = maxInternal;

  //     // 5. Determine if plagiarized
  //     results.isPlagiarized = results.overallSimilarity > this.threshold;
  //     results.confidence = this.calculateConfidence(results);
  //     results.checkedChunks = internalResults.chunks;

  //     console.log(
  //       `✅ Plagiarism check complete: ${results.overallSimilarity}% similarity`
  //     );

  //     return results;
  //   } catch (error) {
  //     console.error("Plagiarism detection error:", error);
  //     return {
  //       ...results,
  //       error: error.message,
  //       confidence: 0,
  //     };
  //   }
  // }

  /**
   * ✅ ENHANCED: Main plagiarism detection with conceptual analysis
   */
  async detectPlagiarism(text, studentId) {
    console.log(
      "🔍 Starting enhanced plagiarism detection with conceptual analysis..."
    );

    // Detect citations first
    const citations = this.detectCitationsAndQuotes(text);
    console.log(`   Found ${citations.length} citations`);

    // Remove cited text from plagiarism check
    let textToCheck = this.removeCitations(text, citations);

    const results = {
      overallSimilarity: 0,
      isPlagiarized: false,
      sources: [],
      internalMatches: [],
      conceptualMatches: [],
      confidence: 0,
      checkedChunks: 0,
      citations: citations,
      originalityScore: 0,
      method: "embedding_based_conceptual_analysis",
      details: {
        previousSubmissions: [],
        suspiciousPatterns: [],
        conceptualSimilarities: [],
        statistics: {},
        properCitations: citations.length,
      },
    };

    try {
      // 1. Check against internal database (previous submissions)
      const internalResults = await this.checkInternalDatabase(
        textToCheck,
        studentId
      );
      results.internalMatches = internalResults.matches;
      results.details.previousSubmissions = internalResults.details;

      // 2. Conceptual similarity analysis using OpenAI embeddings
      const conceptualResults = await this.analyzeConceptualSimilarity(
        textToCheck,
        studentId
      );
      results.conceptualMatches = conceptualResults.matches;
      results.details.conceptualSimilarities = conceptualResults.details;
      results.originalityScore = conceptualResults.originalityScore;

      // 3. Detect suspicious patterns
      const patterns = this.detectSuspiciousPatterns(text);
      results.details.suspiciousPatterns = patterns;

      // 4. Statistical analysis
      const stats = this.analyzeTextStatistics(text);
      results.details.statistics = stats;

      // 5. Calculate overall similarity (combine text and conceptual similarity)
      const maxInternal = Math.max(
        ...internalResults.matches.map((m) => m.similarity),
        0
      );
      const maxConceptual = Math.max(
        ...conceptualResults.matches.map((m) => m.conceptualSimilarity),
        0
      );

      results.overallSimilarity = Math.max(maxInternal, maxConceptual * 100);

      // 6. Determine if plagiarized
      results.isPlagiarized = results.overallSimilarity > this.threshold;
      results.confidence = this.calculateConfidence(results);
      results.checkedChunks = internalResults.chunks + conceptualResults.chunks;

      console.log(
        `✅ Plagiarism check complete: ${results.overallSimilarity}% similarity, ${results.originalityScore}% originality`
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
   * ✅ NEW: Analyze conceptual similarity using OpenAI embeddings
   */
  async analyzeConceptualSimilarity(text, studentId) {
    try {
      console.log("   🤖 Analyzing conceptual similarity with OpenAI...");

      // Get recent essays for comparison
      const recentEssays = await Essay.find({
        studentId: { $ne: studentId },
        status: "graded",
      })
        .select("originalText studentId submittedAt title topic")
        .sort({ submittedAt: -1 })
        .limit(20);

      if (recentEssays.length === 0) {
        return { matches: [], chunks: 0, details: [], originalityScore: 100 };
      }

      // Generate embeddings for current essay
      const currentEmbedding = await this.getTextEmbedding(text);
      const matches = [];

      // Compare with each recent essay
      for (const essay of recentEssays) {
        try {
          const essayEmbedding = await this.getTextEmbedding(
            essay.originalText
          );
          const similarity = this.cosineSimilarity(
            currentEmbedding,
            essayEmbedding
          );

          if (similarity > this.conceptualThreshold) {
            matches.push({
              essayId: essay._id,
              studentId: essay.studentId,
              title: essay.title,
              topic: essay.topic,
              conceptualSimilarity: Math.round(similarity * 100),
              submittedAt: essay.submittedAt,
              analysis: this.getConceptualAnalysis(similarity),
            });
          }
        } catch (error) {
          console.error(`Error processing essay ${essay._id}:`, error.message);
          continue;
        }
      }

      // Calculate originality score
      const originalityScore = this.calculateOriginalityScore(
        matches,
        recentEssays.length
      );

      return {
        matches: matches
          .sort((a, b) => b.conceptualSimilarity - a.conceptualSimilarity)
          .slice(0, 5),
        chunks: recentEssays.length,
        details: matches.map((m) => ({
          source: "Conceptual Similarity",
          similarity: m.conceptualSimilarity,
          title: m.title,
          topic: m.topic,
          analysis: m.analysis,
        })),
        originalityScore: originalityScore,
      };
    } catch (error) {
      console.error("Conceptual similarity analysis error:", error);
      return { matches: [], chunks: 0, details: [], originalityScore: 0 };
    }
  }

  /**
   * ✅ NEW: Remove citations from text for analysis
   */
  removeCitations(text, citations) {
    let cleanedText = text;

    // Remove quoted content with citations
    cleanedText = cleanedText.replace(/"([^"]+)"\s*\([^)]+\)/g, "");

    // Remove attribution phrases
    cleanedText = cleanedText.replace(/according to[^,\.]+[,\.]/gi, "");
    cleanedText = cleanedText.replace(
      /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:states|argues|claims|suggests)[^\.]+\./g,
      ""
    );

    // Remove specific cited quotes
    citations.forEach((citation) => {
      if (citation.quote) {
        const escapedQuote = citation.quote.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );
        cleanedText = cleanedText.replace(new RegExp(escapedQuote, "g"), "");
      }
    });

    return cleanedText;
  }

  /**
   * ✅ NEW: Fallback embedding using TF-IDF
   */
  generateFallbackEmbedding(text) {
    const words = text.toLowerCase().split(/\s+/);
    const wordFreq = {};

    words.forEach((word) => {
      if (word.length > 2) {
        // Ignore very short words
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    // Convert to simple vector (first 100 dimensions)
    const vector = new Array(100).fill(0);
    const wordsList = Object.keys(wordFreq);

    wordsList.slice(0, 100).forEach((word, index) => {
      vector[index] = wordFreq[word] / words.length;
    });

    return vector;
  }

  /**
   * ✅ NEW: Calculate cosine similarity between vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * ✅ NEW: Get conceptual analysis based on similarity
   */
  getConceptualAnalysis(similarity) {
    if (similarity > 0.95) {
      return "Very high conceptual overlap - potential verbatim copying";
    } else if (similarity > 0.9) {
      return "High conceptual similarity - similar arguments and structure";
    } else if (similarity > 0.85) {
      return "Moderate conceptual similarity - shared themes and ideas";
    } else if (similarity > 0.8) {
      return "Low conceptual similarity - common topic but different approach";
    } else {
      return "Minimal conceptual similarity - original content";
    }
  }

  /**
   * ✅ NEW: Calculate originality score
   */
  calculateOriginalityScore(matches, totalComparisons) {
    if (totalComparisons === 0) return 100;

    const maxSimilarity =
      matches.length > 0
        ? Math.max(...matches.map((m) => m.conceptualSimilarity / 100))
        : 0;

    // Originality decreases with higher similarity matches
    const similarityPenalty = maxSimilarity * 50; // Up to 50% penalty for high similarity

    // Bonus for having no high-similarity matches
    const uniquenessBonus = matches.length === 0 ? 20 : 0;

    // Base score adjusted by comparisons
    const baseScore = 80 - (matches.length / totalComparisons) * 20;

    return Math.max(
      0,
      Math.min(100, baseScore - similarityPenalty + uniquenessBonus)
    );
  }

  /**
   * ✅ NEW: Get text embedding using OpenAI
   */
  async getTextEmbedding(text) {
    try {
      // Use your existing OpenAIService or direct OpenAI API call
      const response = await OpenAIService.getEmbedding(
        text.substring(0, 2000)
      ); // Limit text length
      return response.embedding || response.data[0].embedding;
    } catch (error) {
      console.error("Embedding generation failed:", error);

      // Fallback: Generate simple TF-IDF vector
      return this.generateFallbackEmbedding(text);
    }
  }

  /**
   * Check against internal database
   */
  // async checkInternalDatabase(text, studentId) {
  //   try {
  //     const essays = await Essay.find({
  //       studentId: { $ne: studentId },
  //       status: "graded",
  //     })
  //       .select("originalText studentId submittedAt title")
  //       .limit(100);

  //     const chunks = this.chunkText(text);
  //     const matches = [];

  //     for (const essay of essays) {
  //       const similarity = this.calculateCosineSimilarity(
  //         text,
  //         essay.originalText
  //       );

  //       if (similarity > 0.5) {
  //         matches.push({
  //           essayId: essay._id,
  //           studentId: essay.studentId,
  //           title: essay.title,
  //           similarity: Math.round(similarity * 100),
  //           submittedAt: essay.submittedAt,
  //           matchedSections: this.findMatchingSections(
  //             text,
  //             essay.originalText
  //           ),
  //         });
  //       }
  //     }

  //     return {
  //       matches: matches
  //         .sort((a, b) => b.similarity - a.similarity)
  //         .slice(0, 5),
  //       chunks: chunks.length,
  //       details: matches.map((m) => ({
  //         source: "Previous Submission",
  //         similarity: m.similarity,
  //         title: m.title,
  //         date: m.submittedAt,
  //       })),
  //     };
  //   } catch (error) {
  //     console.error("Internal database check error:", error);
  //     return { matches: [], chunks: 0, details: [] };
  //   }
  // }

  /**
   * ✅ ENHANCED: Check internal database with semantic analysis
   */
  async checkInternalDatabase(text, studentId) {
    try {
      const essays = await Essay.find({
        studentId: { $ne: studentId },
        status: "graded",
      })
        .select("originalText studentId submittedAt title topic")
        .limit(50);

      const chunks = this.chunkText(text);
      const matches = [];

      for (const essay of essays) {
        // Traditional text similarity
        const textSimilarity = this.calculateCosineSimilarity(
          text,
          essay.originalText
        );

        if (textSimilarity > 0.5) {
          matches.push({
            essayId: essay._id,
            studentId: essay.studentId,
            title: essay.title,
            topic: essay.topic,
            similarity: Math.round(textSimilarity * 100),
            submittedAt: essay.submittedAt,
            matchedSections: this.findMatchingSections(
              text,
              essay.originalText
            ),
            detectionMethod: "text_similarity",
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
          topic: m.topic,
          date: m.submittedAt,
          method: m.detectionMethod,
        })),
      };
    } catch (error) {
      console.error("Internal database check error:", error);
      return { matches: [], chunks: 0, details: [] };
    }
  }

  /**
   * Detect suspicious patterns that indicate plagiarism
   */
  // detectSuspiciousPatterns(text) {
  //   const patterns = [];

  //   // 1. Detect sudden style changes
  //   const styleChanges = this.detectStyleChanges(text);
  //   if (styleChanges.detected) {
  //     patterns.push({
  //       type: "style_inconsistency",
  //       severity: "high",
  //       description: "Writing style changes dramatically within the essay",
  //       locations: styleChanges.locations,
  //     });
  //   }

  //   // 2. Detect overly complex vocabulary (above student level)
  //   const vocabComplexity = this.analyzeVocabularyComplexity(text);
  //   if (vocabComplexity.isAnomalous) {
  //     patterns.push({
  //       type: "vocabulary_anomaly",
  //       severity: "medium",
  //       description: "Some sections use unusually advanced vocabulary",
  //       examples: vocabComplexity.complexWords,
  //     });
  //   }

  //   // 3. Detect perfect grammar (too perfect)
  //   const grammarPerfection = this.detectPerfectGrammar(text);
  //   if (grammarPerfection.suspicious) {
  //     patterns.push({
  //       type: "perfect_grammar",
  //       severity: "low",
  //       description:
  //         "Unusually perfect grammar throughout (rare for handwritten essays)",
  //       score: grammarPerfection.score,
  //     });
  //   }

  //   // 4. Detect copy-paste markers (formatting inconsistencies)
  //   const formatIssues = this.detectFormattingInconsistencies(text);
  //   if (formatIssues.length > 0) {
  //     patterns.push({
  //       type: "formatting_inconsistency",
  //       severity: "medium",
  //       description: "Potential copy-paste detected",
  //       issues: formatIssues,
  //     });
  //   }

  //   return patterns;
  // }

  /**
   * Detect suspicious patterns with AI assistance
   */
  async detectSuspiciousPatterns(text) {
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

    // 2. Detect vocabulary anomalies
    const vocabComplexity = this.analyzeVocabularyComplexity(text);
    if (vocabComplexity.isAnomalous) {
      patterns.push({
        type: "vocabulary_anomaly",
        severity: "medium",
        description: "Some sections use unusually advanced vocabulary",
        examples: vocabComplexity.complexWords,
        score: vocabComplexity.score,
      });
    }

    // 3. Detect perfect grammar (too perfect)
    const grammarPerfection = this.detectPerfectGrammar(text);
    if (grammarPerfection.suspicious) {
      patterns.push({
        type: "perfect_grammar",
        severity: "low",
        description: "Unusually perfect grammar throughout",
        score: grammarPerfection.score,
      });
    }

    // 4. Detect formatting inconsistencies
    const formatIssues = this.detectFormattingInconsistencies(text);
    if (formatIssues.length > 0) {
      patterns.push({
        type: "formatting_inconsistency",
        severity: "medium",
        description: "Potential copy-paste detected",
        issues: formatIssues,
      });
    }

    // 5. Analyze creativity indicators
    const creativity = await this.analyzeCreativityIndicators(text);
    if (creativity.lowCreativity) {
      patterns.push({
        type: "low_creativity",
        severity: "medium",
        description: "Essay shows limited original thought or analysis",
        indicators: creativity.indicators,
      });
    }

    return patterns;
  }

  /**
   * ✅ NEW: Analyze creativity indicators
   */
  async analyzeCreativityIndicators(text) {
    const indicators = [];

    // Check for generic phrases
    const genericPhrases = [
      "in today's society",
      "since the beginning of time",
      "it is widely known that",
      "many people believe that",
      "in conclusion",
      "last but not least",
    ];

    const foundGeneric = genericPhrases.filter((phrase) =>
      text.toLowerCase().includes(phrase.toLowerCase())
    );

    if (foundGeneric.length > 2) {
      indicators.push(`Uses ${foundGeneric.length} generic phrases`);
    }

    // Check for question depth (number of unique insights)
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const uniqueInsights = sentences.filter(
      (sentence) =>
        sentence.length > 50 &&
        !sentence.toLowerCase().includes("the") && // Simple heuristic
        !sentence.toLowerCase().includes("and") &&
        sentence.split(/\s+/).length > 8
    ).length;

    const insightRatio = uniqueInsights / sentences.length;
    if (insightRatio < 0.2) {
      indicators.push(`Low insight ratio: ${Math.round(insightRatio * 100)}%`);
    }

    // Check for personal voice indicators
    const personalVoiceMarkers = [
      "i believe",
      "in my opinion",
      "from my perspective",
      "i think",
    ];
    const personalVoiceCount = personalVoiceMarkers.filter((marker) =>
      text.toLowerCase().includes(marker)
    ).length;

    if (personalVoiceCount === 0 && text.length > 500) {
      indicators.push("No personal voice markers detected");
    }

    return {
      lowCreativity: indicators.length > 1,
      indicators: indicators,
      insightRatio: Math.round(insightRatio * 100),
      personalVoiceScore: personalVoiceCount,
    };
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

    // Text similarity evidence
    if (results.internalMatches.length > 1) confidence += 0.15;
    if (results.overallSimilarity > 0.85) confidence += 0.1;

    // Conceptual similarity evidence
    if (results.conceptualMatches.length > 0) confidence += 0.1;
    if (results.originalityScore < 50) confidence += 0.05;

    // Pattern evidence
    if (results.details.suspiciousPatterns.length > 2) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }
}

module.exports = new PlagiarismDetector();
