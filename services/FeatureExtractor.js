class FeatureExtractor {
  constructor() {
    this.academicWords = this.getAcademicWords();
    this.transitionWords = this.getTransitionWords();
  }

  /**
   * Extract 150 features from essay text (matching Python implementation)
   */
  extractFeatures(text) {
    const features = [];

    // Preprocessing
    const words = (text.match(/\b\w+\b/g) || []).map(w => w.toLowerCase());
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

    if (words.length === 0 || sentences.length === 0) {
      return new Array(150).fill(0);
    }

    // ===== SECTION 1: Basic Structure (30 features) =====
    features.push(
      words.length,  // Total words
      sentences.length,  // Total sentences
      paragraphs.length,  // Total paragraphs
      words.length / Math.max(sentences.length, 1),  // Avg sentence length
      sentences.length / Math.max(paragraphs.length, 1),  // Sentences per paragraph
      new Set(words).size / words.length,  // Vocabulary diversity (TTR)
      words.filter(w => w.length > 6).length / words.length,  // Long words
      words.filter(w => w.length <= 3).length / words.length,  // Short words
      this.mean(words.map(w => w.length)),  // Mean word length
      this.std(words.map(w => w.length)),  // Word length std
      this.mean(sentences.map(s => s.split(/\s+/).length)),  // Mean sentence length
      this.std(sentences.map(s => s.split(/\s+/).length)),  // Sentence length std
      Math.max(...sentences.map(s => s.split(/\s+/).length)),  // Max sentence length
      Math.min(...sentences.map(s => s.split(/\s+/).length)),  // Min sentence length
      // Paragraph structure
      this.mean(paragraphs.map(p => p.split(/\s+/).length)),
      this.std(paragraphs.map(p => p.split(/\s+/).length)),
      paragraphs.filter(p => p.split(/\s+/).length > 50).length / Math.max(paragraphs.length, 1),
      paragraphs.filter(p => p.split(/\s+/).length < 30).length / Math.max(paragraphs.length, 1),
      // Character analysis
      (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1),
      (text.match(/[.,;:]/g) || []).length / Math.max(sentences.length, 1),
      (text.match(/!/g) || []).length / Math.max(sentences.length, 1),
      (text.match(/\?/g) || []).length / Math.max(sentences.length, 1),
      // Word complexity
      words.filter(w => w.length >= 8).length / words.length,
      words.filter(w => w.length >= 10).length / words.length,
      // Unique word analysis
      words.filter(w => words.filter(x => x === w).length === 1).length / words.length
    );
    
    // Fill remaining slots in section 1
    while (features.length < 30) features.push(0);

    // ===== SECTION 2: Academic Quality (30 features) =====
    features.push(
      // Academic vocabulary
      words.filter(w => this.academicWords.has(w)).length / words.length,
      words.filter(w => this.transitionWords.has(w)).length / Math.max(sentences.length, 1),
      // Argument indicators
      sentences.filter(s => /because|since|therefore|thus|consequently/i.test(s)).length / Math.max(sentences.length, 1),
      sentences.filter(s => /however|although|despite|while|whereas/i.test(s)).length / Math.max(sentences.length, 1),
      // Evidence markers
      sentences.filter(s => /example|instance|evidence|research|study/i.test(s)).length / Math.max(sentences.length, 1),
      // Opinion/Position markers
      sentences.filter(s => /argue|believe|claim|suggest|propose/i.test(s)).length / Math.max(sentences.length, 1),
      // Organization markers
      sentences.filter(s => /first|second|third|finally|lastly/i.test(s)).length / Math.max(paragraphs.length, 1),
      // Introduction quality
      this.assessIntroduction(text),
      this.assessConclusion(text),
      this.assessThesisPresence(text)
    );
    
    while (features.length < 60) features.push(0);

    // ===== SECTION 3: Grammar & Language (40 features) =====
    const lowerText = text.toLowerCase();
    features.push(
      // Verb usage
      (lowerText.match(/\b(is|are|was|were|be|being|been)\b/g) || []).length / words.length,
      (lowerText.match(/\b(has|have|had)\b/g) || []).length / words.length,
      (lowerText.match(/\b(will|would|can|could|shall|should|may|might|must)\b/g) || []).length / words.length,
      // Tense markers
      (lowerText.match(/ed\b/g) || []).length / words.length,
      (lowerText.match(/ing\b/g) || []).length / words.length,
      // Pronoun usage
      (text.match(/\b(I|we|you|they|he|she|it)\b/g) || []).length / words.length,
      (lowerText.match(/\b(this|that|these|those)\b/g) || []).length / words.length,
      (lowerText.match(/\b(who|which|where|when|why|how)\b/g) || []).length / words.length,
      // Sentence variety
      sentences.filter(s => /^[A-Z]/.test(s.trim())).length / Math.max(sentences.length, 1),
      sentences.filter(s => s.includes(',')).length / Math.max(sentences.length, 1),
      sentences.filter(s => s.includes(';')).length / Math.max(sentences.length, 1),
      // Common errors
      (lowerText.match(/alot/g) || []).length / words.length,
      (lowerText.match(/\bthere\b/g) || []).length / words.length,
      (lowerText.match(/\btheir\b/g) || []).length / words.length,
      (lowerText.match(/they're/g) || []).length / words.length
    );
    
    while (features.length < 100) features.push(0);

    // ===== SECTION 4: Coherence & Flow (30 features) =====
    features.push(
      // Cohesive devices
      (lowerText.match(/\b(and|but|or|nor|yet|so)\b/g) || []).length / Math.max(sentences.length, 1),
      (lowerText.match(/\b(in addition|furthermore|moreover|also)\b/g) || []).length / Math.max(sentences.length, 1),
      (lowerText.match(/\b(in contrast|on the other hand|conversely)\b/g) || []).length / Math.max(sentences.length, 1),
      // Paragraph coherence
      this.calculateParagraphCoherence(paragraphs),
      // Topic consistency
      this.calculateTopicConsistency(sentences)
    );
    
    while (features.length < 130) features.push(0);

    // ===== SECTION 5: Advanced Quality Indicators (20 features) =====
    features.push(
      // Depth indicators
      sentences.filter(s => s.split(/\s+/).length > 20).length / Math.max(sentences.length, 1),
      sentences.filter(s => s.includes(',') && s.split(/\s+/).length > 15).length / Math.max(sentences.length, 1),
      // Quote/Citation markers
      (text.match(/"/g) || []).length / Math.max(sentences.length, 1),
      (text.match(/'/g) || []).length / Math.max(sentences.length, 1),
      // Critical thinking markers
      sentences.filter(s => /analyze|evaluate|compare|contrast|assess/i.test(s)).length / Math.max(sentences.length, 1)
    );
    
    // Ensure exactly 150 features
    while (features.length < 150) features.push(0);
    
    return features.slice(0, 150);
  }

  /**
   * Helper: Calculate mean
   */
  mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Helper: Calculate standard deviation
   */
  std(arr) {
    if (arr.length <= 1) return 0;
    const avg = this.mean(arr);
    const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  /**
   * Assess introduction quality
   */
  assessIntroduction(text) {
    const firstPara = text.substring(0, 500).toLowerCase();
    const indicators = ['thesis', 'argue', 'discuss', 'explore', 'examine'];
    const score = indicators.filter(word => firstPara.includes(word)).length * 0.2;
    return Math.min(1.0, score);
  }

  /**
   * Assess conclusion quality
   */
  assessConclusion(text) {
    const lastPara = text.substring(Math.max(0, text.length - 500)).toLowerCase();
    const indicators = ['conclusion', 'summary', 'overall', 'finally', 'therefore'];
    const score = indicators.filter(word => lastPara.includes(word)).length * 0.2;
    return Math.min(1.0, score);
  }

  /**
   * Assess thesis presence
   */
  assessThesisPresence(text) {
    const firstPara = text.substring(0, 500).toLowerCase();
    const indicators = ['argue', 'claim', 'thesis', 'believe'];
    return indicators.some(word => firstPara.includes(word)) ? 1.0 : 0.5;
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
   * Calculate topic consistency (word overlap between sentences)
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
    ]);
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
    ]);
  }
}

module.exports = FeatureExtractor;