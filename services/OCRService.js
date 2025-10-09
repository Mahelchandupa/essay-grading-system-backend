const { ImageAnnotatorClient } = require("@google-cloud/vision");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const natural = require("natural");
const fs = require("fs").promises;
const path = require("path");

class OCRService {
  constructor() {
    this.commonWords = this.loadCommonWords();
    this.spellChecker = new natural.Spellcheck(Array.from(this.commonWords));
    this.tesseractWorker = null;

    // Initialize Google Vision Client
    try {
      // Method 1: Use environment variable for key file path
      const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

      // Method 2: Or load from your config
      if (keyFilePath && fs.existsSync(keyFilePath)) {
        this.visionClient = new ImageAnnotatorClient();
        console.log("✅ Google Cloud Vision API initialized");
      } else {
        console.log(
          "⚠️ Google Vision credentials not found, using Tesseract only"
        );
        this.visionClient = null;
      }
    } catch (error) {
      console.error("❌ Google Vision initialization failed:", error.message);
      this.visionClient = null;
    }
  }

  /**
   * Main OCR processing with fallback strategy
   */
  async processImage(imagePath) {
    let preprocessedPath = null;

    try {
      console.log("Processing image with enhanced OCR...");

      // Try Google Vision first (if available)
      if (this.visionClient) {
        try {
          console.log("🔄 Attempting Google Vision OCR...");
          const visionResult = await this.processWithGoogleVision(imagePath);

          if (visionResult.confidence > 70) {
            console.log(
              "✅ Google Vision successful, confidence:",
              visionResult.confidence
            );
            return visionResult;
          } else {
            console.log(
              "⚠️ Google Vision confidence low, falling back to Tesseract"
            );
          }
        } catch (visionError) {
          console.log(
            "⚠️ Google Vision failed, using Tesseract:",
            visionError.message
          );
        }
      }

      // Fallback to Tesseract
      console.log("🔄 Using Tesseract OCR...");
      return await this.processWithTesseract(imagePath);
    } catch (error) {
      console.error("OCR processing error:", error);
      throw new Error(`OCR failed: ${error.message}`);
    }
  }

  /**
   * Google Cloud Vision OCR (More accurate for handwriting)
   */
  async processWithGoogleVision(imagePath) {
    if (!this.visionClient) {
      throw new Error("Google Vision client not initialized");
    }

    try {
      // Read image file
      const imageBuffer = await fs.readFile(imagePath);

      const [result] = await this.visionClient.documentTextDetection({
        image: { content: imageBuffer },
      });

      const textAnnotation = result.fullTextAnnotation;

      if (!textAnnotation) {
        throw new Error("No text detected in image");
      }

      const extractedText = textAnnotation.text;
      const confidence = this.calculateVisionConfidence(textAnnotation);

      // Enhanced post-processing
      const correctedText = await this.advancedPostProcessOCR(
        extractedText,
        confidence
      );

      return {
        text: correctedText,
        originalText: extractedText,
        confidence: confidence,
        source: "google_vision",
        wordConfidences: this.extractWordConfidences(textAnnotation),
        warnings: this.generateWarnings(confidence, extractedText),
      };
    } catch (error) {
      console.error("Google Vision OCR error:", error);
      throw error;
    }
  }

  /**
   * Calculate confidence from Google Vision response
   */
  calculateVisionConfidence(textAnnotation) {
    if (!textAnnotation.pages || textAnnotation.pages.length === 0) {
      return 50; // Default confidence
    }

    let totalConfidence = 0;
    let wordCount = 0;

    textAnnotation.pages.forEach((page) => {
      page.blocks.forEach((block) => {
        block.paragraphs.forEach((paragraph) => {
          paragraph.words.forEach((word) => {
            const wordConfidence = word.confidence || 0;
            totalConfidence += wordConfidence;
            wordCount++;
          });
        });
      });
    });

    return wordCount > 0 ? (totalConfidence / wordCount) * 100 : 50;
  }

  /**
   * Extract word-level confidences from Vision response
   */
  extractWordConfidences(textAnnotation) {
    const words = [];

    if (!textAnnotation.pages) return words;

    textAnnotation.pages.forEach((page) => {
      page.blocks.forEach((block) => {
        block.paragraphs.forEach((paragraph) => {
          paragraph.words.forEach((word) => {
            const wordText = word.symbols.map((symbol) => symbol.text).join("");

            words.push({
              text: wordText,
              confidence: (word.confidence || 0) * 100,
            });
          });
        });
      });
    });

    return words;
  }

  /**
   * Tesseract OCR (Fallback)
   */
  async processWithTesseract(imagePath) {
    let preprocessedPath = null;

    try {
      // Simple preprocessing for Tesseract
      preprocessedPath = await this.simplePreprocessImage(imagePath);

      if (!this.tesseractWorker) {
        this.tesseractWorker = await Tesseract.createWorker("eng", 1, {
          logger: (m) => {
            if (m.status === "recognizing text") {
              console.log(
                `Tesseract Progress: ${Math.round(m.progress * 100)}%`
              );
            }
          },
        });
      }

      const { data } = await this.tesseractWorker.recognize(preprocessedPath);

      const correctedText = await this.advancedPostProcessOCR(
        data.text,
        data.confidence
      );

      return {
        text: correctedText,
        originalText: data.text,
        confidence: data.confidence,
        source: "tesseract",
        wordConfidences: data.words
          ? data.words.map((w) => ({
              text: w.text,
              confidence: w.confidence,
            }))
          : [],
        warnings: this.generateWarnings(data.confidence, data.text),
      };
    } finally {
      if (preprocessedPath && preprocessedPath !== imagePath) {
        await fs.unlink(preprocessedPath).catch(() => {});
      }
    }
  }

  /**
   * Simple preprocessing for Tesseract
   */
  async simplePreprocessImage(inputPath, outputPath = null) {
    if (!outputPath) {
      outputPath = path.join(
        path.dirname(inputPath),
        `tesseract_preprocessed_${Date.now()}.png`
      );
    }

    await sharp(inputPath)
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toFile(outputPath);

    return outputPath;
  }

  /**
   * Advanced post-processing (common for both OCR engines)
   */
  async advancedPostProcessOCR(text, confidence) {
    if (!text || text.trim().length === 0) {
      return "No text could be extracted from the image.";
    }

    let correctedText = text;

    // Basic cleaning
    correctedText = this.cleanText(correctedText);

    // Handwriting-specific corrections
    correctedText = this.correctHandwritingErrors(correctedText);

    // Spell checking for low confidence
    if (confidence < 80) {
      correctedText = await this.contextAwareSpellCheck(correctedText);
    }

    // Structure fixes
    correctedText = this.fixTextStructure(correctedText);

    return correctedText.replace(/\s+/g, " ").trim();
  }

  /**
   * Generate warnings based on confidence and text quality
   */
  generateWarnings(confidence, text) {
    const warnings = [];

    if (confidence < 50) {
      warnings.push({
        type: "low_confidence",
        message: "Text extraction confidence is low.",
        severity: "high",
        suggestion: "Please ensure clear handwriting and good lighting.",
      });
    }

    if (text && text.trim().length < 100) {
      warnings.push({
        type: "short_text",
        message: "Limited text was extracted.",
        severity: "medium",
        suggestion: "Check if the entire essay is visible in the image.",
      });
    }

    return warnings;
  }

  /**
   * Handwriting-specific error corrections
   */
  correctHandwritingErrors(text) {
    const handwritingConfusions = [
      [/\b0(?=[a-z])/gi, "o"],
      [/\bO(?=[a-z])/g, "o"],
      [/\bl(?=\d)/gi, "1"],
      [/\bI(?=\d)/g, "1"],
      [/\b1(?=[a-z])/gi, "l"],
      [/rn/gi, "m"],
      [/cl/gi, "d"],
      [/vv/gi, "w"],
      [/uü/gi, "w"],
      [/ii/gi, "u"],
      [/tlie/gi, "the"],
      [/arid/gi, "and"],
      [/witli/gi, "with"],
      [/recieve/gi, "receive"],
      [/seperate/gi, "separate"],
      [/definately/gi, "definitely"],
      [/adn/gi, "and"],
      [/teh/gi, "the"],
      [/awya/gi, "away"],
    ];

    let corrected = text;
    handwritingConfusions.forEach(([pattern, replacement]) => {
      corrected = corrected.replace(pattern, replacement);
    });

    return corrected;
  }

  /**
   * OPTIMIZED Context-aware spell checking for handwriting
   */
  async contextAwareSpellCheck(text) {
    console.log("🔄 Starting optimized spell check...");

    if (!text || text.trim().length === 0) {
      return text;
    }

    // Limit the text length to prevent excessive processing
    const maxTextLength = 2000;
    if (text.length > maxTextLength) {
      console.log(
        `⚠️ Text too long (${text.length} chars), limiting spell check`
      );
      text = text.substring(0, maxTextLength);
    }

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    console.log(`📝 Processing ${sentences.length} sentences`);

    const correctedSentences = [];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      // Skip very long sentences to avoid processing issues
      if (sentence.length > 500) {
        console.log(`⚠️ Skipping long sentence (${sentence.length} chars)`);
        correctedSentences.push(sentence);
        continue;
      }

      const words = sentence.trim().split(/\s+/);

      // Skip spell checking for sentences with too many words
      if (words.length > 50) {
        console.log(
          `⚠️ Skipping spell check for long sentence (${words.length} words)`
        );
        correctedSentences.push(sentence);
        continue;
      }

      const correctedWords = [];

      for (let j = 0; j < words.length; j++) {
        const word = words[j];

        if (this.shouldSkipWord(word)) {
          correctedWords.push(word);
          continue;
        }

        try {
          const corrected = await this.safeWordCorrection(word);
          correctedWords.push(corrected);
        } catch (error) {
          console.warn(`Word correction failed for "${word}":`, error.message);
          correctedWords.push(word); // Use original word if correction fails
        }
      }

      correctedSentences.push(correctedWords.join(" "));
    }

    console.log("✅ Spell check completed");
    return correctedSentences.join(". ").trim();
  }

  /**
   * SAFE word correction with timeout protection
   */
  async safeWordCorrection(word) {
    // Add timeout protection for each word
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.warn(`⏰ Timeout for word: "${word}"`);
        resolve(word);
      }, 500); // 500ms timeout per word
    });

    const correctionPromise = (async () => {
      const cleanWord = word.replace(/[^\w]/g, "").toLowerCase();

      // Skip very short words
      if (cleanWord.length <= 2) {
        return word;
      }

      // Apply handwriting corrections first
      const handwritingCorrected = this.applyHandwritingCorrections(cleanWord);

      // Check if the word is already valid
      if (this.isValidWord(handwritingCorrected)) {
        return this.preserveFormat(word, handwritingCorrected);
      }

      // Get limited spelling suggestions
      try {
        const suggestions = this.spellChecker.getCorrections(
          handwritingCorrected,
          2
        );
        if (suggestions.length > 0 && suggestions[0] !== handwritingCorrected) {
          const bestSuggestion = suggestions[0];
          console.log(`🔤 Corrected: "${word}" → "${bestSuggestion}"`);
          return this.preserveFormat(word, bestSuggestion);
        }
      } catch (error) {
        console.warn(`Spell check error for "${word}":`, error.message);
      }

      return word;
    })();

    return Promise.race([correctionPromise, timeoutPromise]);
  }

  /**
   * Correct word using context information
   */
  async correctWordWithContext(word) {
    const cleanWord = word.replace(/[^\w]/g, "").toLowerCase();

    // Check common handwriting errors first
    const handwritingCorrected = this.applyHandwritingCorrections(cleanWord);

    if (this.isValidWord(handwritingCorrected)) {
      return this.preserveFormat(word, handwritingCorrected);
    }

    // Get spelling suggestions
    const suggestions = this.spellChecker.getCorrections(
      handwritingCorrected,
      3
    );
    if (suggestions.length > 0) {
      const bestSuggestion = suggestions[0];
      return this.preserveFormat(word, bestSuggestion);
    }

    return word;
  }

  /**
   * Fix text structure issues
   */
  fixTextStructure(text) {
    let fixed = text;

    // Fix missing spaces after punctuation
    fixed = fixed.replace(/([.!?])([A-Za-z])/g, "$1 $2");

    // Fix run-on sentences (basic)
    fixed = fixed.replace(/([^.!?])([A-Z])/g, "$1. $2");

    // Capitalize sentences
    fixed = fixed.replace(/(^|[.!?]\s+)([a-z])/g, (match, p1, p2) => {
      return p1 + p2.toUpperCase();
    });

    // Fix standalone 'i'
    fixed = fixed.replace(/\bi\b/g, "I");

    return fixed;
  }

  /**
   * Enhanced handwriting corrections
   */
  applyHandwritingCorrections(word) {
    const handwritingPatterns = {
      recieve: "receive",
      seperate: "separate",
      definately: "definitely",
      occured: "occurred",
      truely: "truly",
      goverment: "government",
      environement: "environment",
      arguement: "argument",
      judgement: "judgment",
      maintainance: "maintenance",
    };

    const lowerWord = word.toLowerCase();
    return handwritingPatterns[lowerWord] || word;
  }

  /**
   * Enhanced shouldSkipWord with more conditions
   */
  shouldSkipWord(word) {
    const cleanWord = word.replace(/[^\w]/g, "");

    return (
      cleanWord.length <= 1 ||
      /^\d+$/.test(cleanWord) ||
      /^[^\w]+$/.test(word) ||
      this.isProperNoun(word) ||
      this.isAcademicTerm(word) ||
      this.isURLorEmail(word) ||
      this.isSpecialFormat(word)
    );
  }

  /**
   * Check for URLs, emails, or special formats
   */
  isURLorEmail(word) {
    return /^(https?:\/\/|www\.|[\w\.-]+@[\w\.-]+\.\w+)/.test(word);
  }

  /**
   * Check for special formats like dates, numbers with symbols
   */
  isSpecialFormat(word) {
    return (
      /^(\$|\€|\£)?\d+([\.\,]\d+)?%?$/.test(word) || // Currency, percentages
      /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(word)
    ); // Dates
  }

  /**
   * Check if word is an academic term
   */
  isAcademicTerm(word) {
    const academicTerms = new Set([
      "essay",
      "thesis",
      "argument",
      "analysis",
      "conclusion",
      "introduction",
      "paragraph",
      "citation",
      "reference",
      "evidence",
      "research",
      "study",
      "data",
      "methodology",
    ]);
    return academicTerms.has(word.toLowerCase());
  }

  /**
   * Check if word is a proper noun
   */
  isProperNoun(word) {
    return /^[A-Z][a-z]+$/.test(word.replace(/[^\w]/g, ""));
  }

  /**
   * Enhanced word validation with better performance
   */
  isValidWord(word) {
    const cleanWord = word.replace(/[^\w]/g, "").toLowerCase();

    // Quick checks for very short words and numbers
    if (cleanWord.length <= 1 || /^\d+$/.test(cleanWord)) {
      return true;
    }

    // Check against common words first (fast)
    if (this.commonWords.has(cleanWord)) {
      return true;
    }

    // Use spell checker as fallback with error handling
    try {
      return this.spellChecker.isCorrect(cleanWord);
    } catch (error) {
      console.warn(
        `Spell check validation failed for "${word}":`,
        error.message
      );
      return false; // Assume invalid if check fails
    }
  }

  /**
   * Preserve original word formatting
   */
  preserveFormat(original, corrected) {
    if (original[0] === original[0].toUpperCase()) {
      corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
    }
    if (original === original.toUpperCase()) {
      corrected = corrected.toUpperCase();
    }
    const punctuation = original.match(/[^\w]+$/);
    if (punctuation) corrected += punctuation[0];
    return corrected;
  }

  /**
   * Clean text
   */
  cleanText(text) {
    return text
      .replace(/[^\x20-\x7E\n\r]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim();
  }

  /**
   * Load common words dictionary
   */
  loadCommonWords() {
    const words = new Set([
      "the",
      "be",
      "to",
      "of",
      "and",
      "a",
      "in",
      "that",
      "have",
      "i",
      "it",
      "for",
      "not",
      "on",
      "with",
      "he",
      "as",
      "you",
      "do",
      "at",
      "this",
      "but",
      "his",
      "by",
      "from",
      "they",
      "we",
      "say",
      "her",
      "she",
      "or",
      "an",
      "will",
      "my",
      "one",
      "all",
      "would",
      "there",
      "their",
      "what",
      "about",
      "out",
      "who",
      "get",
      "which",
      "go",
      "me",
      "when",
      "make",
      "can",
      "like",
      "time",
      "no",
      "just",
      "him",
      "know",
      "take",
      "people",
      "into",
      "year",
      "your",
      "good",
      "some",
      "could",
      "them",
      "see",
      "other",
      "than",
      "then",
      "now",
      "look",
      "only",
      "come",
      "its",
      "over",
      "think",
      "also",
      "back",
      "after",
      "use",
      "two",
      "how",
      "our",
      "work",
      "first",
      "well",
      "way",
      "even",
      "new",
      "want",
      "because",
      "any",
      "these",
      "give",
      "day",
      "most",
      "us",
      "is",
      "was",
      "are",
      "analysis",
      "argument",
      "conclusion",
      "evidence",
      "example",
      "explanation",
      "introduction",
      "paragraph",
      "research",
      "source",
      "summary",
      "thesis",
      "topic",
      "writing",
      "essay",
      "academic",
      "citation",
      "reference",
      "quote",
      "paraphrase",
      "summarize",
      "evaluate",
      "analyze",
      "discuss",
      "explain",
      "describe",
      "compare",
      "contrast",
      "critique",
      "interpret",
      "synthesize",
    ]);
    return words;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
  }
}

module.exports = new OCRService();
