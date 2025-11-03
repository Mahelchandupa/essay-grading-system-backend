class FeatureExtractor {
  constructor() {
    this.academicWords = this.getAcademicWords();
    this.transitionWords = this.getTransitionWords();
    this.stopWords = this.getStopWords();
  }

  /**
   * Extract 150 features matching Python implementation exactly
   */
  extractFeatures(text, structure = null) {
    const features = [];

    // Preprocessing
    const cleanText = text.replace(/[^\w\s\.\!\?]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = (cleanText.match(/\b\w+\b/g) || []).map(w => w.toLowerCase());
    const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim());
    const paragraphs = cleanText.split(/\n\n+/).filter(p => p.trim());

    if (words.length === 0 || sentences.length === 0) {
      return new Array(150).fill(0);
    }

    const uniqueWords = [...new Set(words)];
    
    // ===== SECTION 1: BASIC TEXT FEATURES (1-30) =====
    
    // 1-3: Basic counts (log normalized like Python)
    features.push(
      Math.log1p(cleanText.length) / 10.0,  // Total characters (normalized)
      Math.log1p(sentences.length) / 5.0,   // Sentence count (normalized)
      Math.log1p(words.length) / 8.0        // Word count (normalized)
    );

    // 4-6: Vocabulary richness
    features.push(
      uniqueWords.length,                    // Unique words count
      uniqueWords.length / Math.max(words.length, 1),  // Type-token ratio
      words.filter(w => w.length > 6).length / Math.max(words.length, 1)  // Long words ratio
    );

    // 7-9: Academic vocabulary
    const academicCount = words.filter(w => this.academicWords.has(w)).length;
    features.push(
      academicCount,  // Academic word count
      academicCount / Math.max(words.length, 1),  // Academic word ratio
      words.filter(w => !this.stopWords.has(w)).length / Math.max(words.length, 1)  // Content word ratio
    );

    // 10-15: Sentence structure features
    if (sentences.length > 0) {
      const sentLengths = sentences.map(s => s.split(/\s+/).length);
      features.push(
        this.mean(sentLengths),  // Avg sentence length
        this.std(sentLengths),   // Sentence length variation
        Math.max(...sentLengths), // Max sentence length
        Math.min(...sentLengths), // Min sentence length
        sentLengths.filter(l => l > 15).length / sentLengths.length,  // Complex sentences ratio
        sentLengths.filter(l => l < 8).length / sentLengths.length   // Simple sentences ratio
      );
    } else {
      features.push(0, 0, 0, 0, 0, 0);
    }

    // 16-20: Grammar indicators (positive features)
    const lowerText = cleanText.toLowerCase();
    features.push(
      (lowerText.match(/\b(is|are|was|were|be|being|been)\b/g) || []).length / Math.max(words.length, 1),  // Being verbs
      (lowerText.match(/\b(have|has|had)\b/g) || []).length / Math.max(words.length, 1),  // Perfect tenses
      (lowerText.match(/\b(can|could|will|would|shall|should|may|might|must)\b/g) || []).length / Math.max(words.length, 1),  // Modal verbs
      (lowerText.match(/\b(although|however|therefore|furthermore|moreover|consequently)\b/g) || []).length / Math.max(words.length, 1),  // Transition words
      (lowerText.match(/\b(because|since|although|while|if|unless|until)\b/g) || []).length / Math.max(words.length, 1)  // Subordinating conjunctions
    );

    // 21-25: Essay structure features
    features.push(
      paragraphs.length,  // Paragraph count
      this.assessIntroduction(cleanText) ? 1 : 0,  // Has introduction
      this.assessConclusion(cleanText) ? 1 : 0,    // Has conclusion
      (lowerText.match(/\b(first|second|third|finally|next|then)\b/g) || []).length / Math.max(words.length, 1),  // Sequencing words
      (lowerText.match(/\b(for example|for instance|such as|including|specifically)\b/g) || []).length / Math.max(words.length, 1)  // Example markers
    );

    // 26-30: Readability features
    if (sentences.length > 0 && words.length > 0) {
      const avgSentLength = words.length / sentences.length;
      const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
      const complexWords = words.filter(w => w.length > 6 && !this.stopWords.has(w)).length;
      
      // Simplified Flesch Reading Ease
      const fleschScore = 206.835 - (1.015 * avgSentLength) - (84.6 * (complexWords / words.length));
      features.push(
        Math.max(0, Math.min(100, fleschScore)) / 100.0,  // Normalized readability
        avgWordLength,  // Average word length
        complexWords / Math.max(words.length, 1),  // Complex word ratio
        words.filter(w => w.endsWith('ing') || w.endsWith('ed') || w.endsWith('ly')).length / Math.max(words.length, 1),  // Morphological complexity
        (lowerText.match(/\b(not|no|never|nothing|none)\b/g) || []).length / Math.max(words.length, 1)  // Negation density
      );
    } else {
      features.push(0, 0, 0, 0, 0);
    }

    // ===== SECTION 2: CONTENT QUALITY INDICATORS (31-50) =====
    
    // 31-35: Content indicators
    features.push(
      (lowerText.match(/\b(believe|think|feel|opinion|view|perspective)\b/g) || []).length / Math.max(words.length, 1),  // Personal voice
      (lowerText.match(/\b(important|significant|crucial|essential|vital)\b/g) || []).length / Math.max(words.length, 1),  // Emphasis words
      (lowerText.match(/\b(according to|research shows|studies indicate|evidence suggests)\b/g) || []).length / Math.max(words.length, 1),  // Evidence markers
      (lowerText.match(/\b(therefore|thus|hence|consequently|as a result)\b/g) || []).length / Math.max(words.length, 1),  // Conclusion markers
      (lowerText.match(/\b(in addition|furthermore|moreover|additionally)\b/g) || []).length / Math.max(words.length, 1)  // Addition markers
    );

    // 36-50: Part-of-speech features
    features.push(
      this.countPattern(lowerText, /\b(\w+ing|\w+ment|\w+tion|\w+sion|\w+ness|\w+ity|\w+ance|\w+ence)\b/) / Math.max(words.length, 1),  // Nouns
      this.countPattern(lowerText, /\b(\w+ed|\w+ing|\w+s)\b/) / Math.max(words.length, 1),  // Verbs
      this.countPattern(lowerText, /\b(\w+ful|\w+ous|\w+ish|\w+ive|\w+less|\w+able|\w+ible)\b/) / Math.max(words.length, 1),  // Adjectives
      this.countPattern(lowerText, /\b(\w+ly)\b/) / Math.max(words.length, 1),  // Adverbs
      (lowerText.match(/\b(in|on|at|by|with|about|against|between|through|during|before|after|above|below|from|of)\b/g) || []).length / Math.max(words.length, 1)  // Prepositions
    );

    // Fill remaining POS features
    while (features.length < 50) features.push(0);

    // ===== SECTION 3: ADVANCED FEATURES (51-150) =====
    
    // Word frequency features (51-55)
    const wordFreq = this.getWordFrequency(words);
    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => count / words.length);
    
    features.push(...topWords);
    while (features.length < 55) features.push(0);

    // Structure-based features (56-70)
    if (structure) {
      features.push(
        structure.title ? 1 : 0,
        structure.sections ? structure.sections.length : 0,
        structure.paragraphs ? structure.paragraphs.length : 0,
        structure.paragraphs ? this.mean(structure.paragraphs.map(p => p.text.split(/\s+/).length)) : 0,
        structure.paragraphs ? this.std(structure.paragraphs.map(p => p.text.split(/\s+/).length)) : 0
      );
    } else {
      features.push(0, 0, 0, 0, 0);
    }

    // Coherence features (71-85)
    features.push(
      this.calculateParagraphCoherence(paragraphs),
      this.calculateTopicConsistency(sentences),
      this.calculateLexicalDiversity(words),
      this.calculateSentenceVariety(sentences),
      this.calculateArgumentStrength(cleanText)
    );

    // Error density features (86-100) - but keep them minimal to avoid penalizing good essays
    features.push(
      this.countSpellingIndicators(cleanText) / Math.max(words.length, 1),
      this.countGrammarIndicators(cleanText) / Math.max(words.length, 1),
      this.countInformalLanguage(cleanText) / Math.max(words.length, 1),
      0, 0  // Reserve for future error metrics
    );

    // Fill remaining features with meaningful zeros
    while (features.length < 150) {
      features.push(0);
    }

    // Ensure we return exactly 150 features
    return features.slice(0, 150).map(f => {
      // Ensure all features are finite numbers
      if (typeof f !== 'number' || !isFinite(f)) return 0;
      // Cap extreme values
      return Math.max(-1, Math.min(1, f));
    });
  }

  /**
   * Helper: Calculate mean
   */
  mean(arr) {
    if (!arr || arr.length === 0) return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum / arr.length;
  }

  /**
   * Helper: Calculate standard deviation
   */
  std(arr) {
    if (!arr || arr.length <= 1) return 0;
    const avg = this.mean(arr);
    const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  /**
   * Count pattern matches
   */
  countPattern(text, pattern) {
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }

  /**
   * Get word frequency
   */
  getWordFrequency(words) {
    const freq = {};
    words.forEach(word => {
      freq[word] = (freq[word] || 0) + 1;
    });
    return freq;
  }

  /**
   * Assess introduction quality
   */
  assessIntroduction(text) {
    const firstPara = text.substring(0, Math.min(500, text.length)).toLowerCase();
    return /introduction|firstly|to begin|in this essay|this paper|the purpose/i.test(firstPara);
  }

  /**
   * Assess conclusion quality
   */
  assessConclusion(text) {
    const lastPara = text.substring(Math.max(0, text.length - 500)).toLowerCase();
    return /conclusion|in conclusion|to conclude|in summary|finally|overall/i.test(lastPara);
  }

  /**
   * Calculate paragraph coherence
   */
  calculateParagraphCoherence(paragraphs) {
    if (paragraphs.length < 2) return 0.5;
    const lengths = paragraphs.map(p => p.split(/\s+/).length);
    const meanLength = this.mean(lengths);
    const stdLength = this.std(lengths);
    return Math.min(1.0, stdLength / (meanLength + 1));
  }

  /**
   * Calculate topic consistency
   */
  calculateTopicConsistency(sentences) {
    if (sentences.length < 2) return 0.5;
    
    const overlaps = [];
    for (let i = 0; i < sentences.length - 1; i++) {
      const words1 = new Set(sentences[i].toLowerCase().split(/\s+/));
      const words2 = new Set(sentences[i + 1].toLowerCase().split(/\s+/));
      
      const intersection = new Set([...words1].filter(x => words2.has(x)));
      const union = new Set([...words1, ...words2]);
      
      if (union.size > 0) {
        overlaps.push(intersection.size / union.size);
      }
    }
    
    return overlaps.length > 0 ? this.mean(overlaps) : 0.5;
  }

  /**
   * Calculate lexical diversity
   */
  calculateLexicalDiversity(words) {
    if (words.length === 0) return 0;
    const unique = new Set(words);
    return unique.size / words.length;
  }

  /**
   * Calculate sentence variety
   */
  calculateSentenceVariety(sentences) {
    if (sentences.length < 2) return 0.5;
    const lengths = sentences.map(s => s.split(/\s+/).length);
    return this.std(lengths) / (this.mean(lengths) + 1);
  }

  /**
   * Calculate argument strength
   */
  calculateArgumentStrength(text) {
    const lowerText = text.toLowerCase();
    const argumentMarkers = [
      'because', 'therefore', 'thus', 'consequently', 'as a result',
      'evidence', 'research', 'study', 'data', 'analysis',
      'argue', 'claim', 'suggest', 'propose', 'demonstrate'
    ];
    
    const count = argumentMarkers.filter(marker => lowerText.includes(marker)).length;
    return Math.min(1.0, count / 10.0);
  }

  /**
   * Count spelling indicators (minimal - don't over-penalize)
   */
  countSpellingIndicators(text) {
    const commonErrors = ['alot', 'recieve', 'seperate', 'definately', 'occured'];
    return commonErrors.filter(error => text.toLowerCase().includes(error)).length;
  }

  /**
   * Count grammar indicators (minimal)
   */
  countGrammarIndicators(text) {
    // Very basic grammar issue detection
    const lowerText = text.toLowerCase();
    let count = 0;
    
    // Double spaces
    if (/\s{2,}/.test(text)) count++;
    
    // Missing spaces after punctuation
    if (/[.,!?][A-Za-z]/.test(text)) count++;
    
    return count;
  }

  /**
   * Count informal language
   */
  countInformalLanguage(text) {
    const informalWords = ['gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'ain\'t'];
    return informalWords.filter(word => text.toLowerCase().includes(word)).length;
  }

  /**
   * Academic words set
   */
  getAcademicWords() {
    return new Set([
      'analysis', 'approach', 'area', 'assessment', 'assume', 'authority', 'available',
      'benefit', 'concept', 'consistent', 'context', 'contract', 'create', 'data',
      'definition', 'derived', 'distribution', 'economic', 'environment', 'established',
      'estimate', 'evidence', 'factors', 'function', 'indicate', 'individual',
      'interpretation', 'method', 'process', 'research', 'significant', 'theory',
      'achieve', 'acquisition', 'administration', 'affect', 'appropriate', 'aspects',
      'assistance', 'categories', 'chapter', 'commission', 'community', 'complex',
      'conclusion', 'conduct', 'consequences', 'construction', 'consumer', 'credit',
      'cultural', 'design', 'distinction', 'elements', 'equation', 'evaluation',
      'framework', 'hypothesis', 'implementation', 'implications', 'investigation'
    ].map(w => w.toLowerCase()));
  }

  /**
   * Transition words set
   */
  getTransitionWords() {
    return new Set([
      'however', 'therefore', 'moreover', 'furthermore', 'consequently', 'nevertheless',
      'nonetheless', 'accordingly', 'similarly', 'likewise', 'conversely', 'meanwhile',
      'instead', 'subsequently', 'ultimately', 'additionally', 'besides', 'thus',
      'hence', 'indeed', 'specifically', 'particularly', 'especially', 'namely'
    ].map(w => w.toLowerCase()));
  }

  /**
   * Stop words set
   */
  getStopWords() {
    return new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 
      'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'is', 'are', 'was', 'were',
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'can'
    ]);
  }
}

module.exports = FeatureExtractor;