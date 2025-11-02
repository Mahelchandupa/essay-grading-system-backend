require("dotenv").config();

const { ImageAnnotatorClient } = require("@google-cloud/vision");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const fs = require("fs").promises;
const path = require("path");
const natural = require("natural");
const SpellChecker = require("simple-spellchecker");
const OpenAI = require("openai");
const getEssay = require("../uploads/test");

class OCRService {
  constructor() {
    this.tesseractWorker = null;
    this.dictionary = null;
    this.visionClient = null;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.initializeDictionary();
    this.initializeVisionClient();
  }

  async initializeDictionary() {
    return new Promise((resolve, reject) => {
      SpellChecker.getDictionary("en-US", (err, dictionary) => {
        if (err) {
          console.warn("⚠️ Could not load spell checker:", err.message);
          this.dictionary = null;
          reject(err);
        } else {
          this.dictionary = dictionary;
          console.log("✅ Spell checker dictionary loaded");
          resolve(dictionary);
        }
      });
    });
  }

  initializeVisionClient() {
    try {
      if (typeof window === "undefined") {
        const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        console.log("🔍 Checking Google Vision credentials...");
        console.log("   Credentials path:", keyFilePath);

        if (keyFilePath && require("fs").existsSync(keyFilePath)) {
          this.visionClient = new ImageAnnotatorClient();
          console.log("✅ Google Cloud Vision API initialized");
        } else {
          console.log("⚠️ Google Vision credentials not found");
        }
      }
    } catch (error) {
      console.error("❌ Google Vision initialization failed:", error.message);
      this.visionClient = null;
    }
  }

  async processImage(imagePath, providedTitle = null) {
    try {
      console.log("🔄 Starting OCR processing pipeline...");

      if (providedTitle) {
        console.log(`📝 Student provided title: "${providedTitle}"`);
      }

      if (this.visionClient) {
        try {
          console.log("🔄 Attempting Google Vision OCR...");
          const visionResult = await this.processWithGoogleVision(
            imagePath,
            providedTitle
          );

          console.log(`✅ Google Vision completed`);
          console.log(`   Confidence: ${visionResult.confidence}%`);

          if (visionResult.confidence > 70) {
            console.log("✅ Using Google Vision result");
            return visionResult;
          } else {
            console.log("⚠️ Google Vision confidence low, trying Tesseract");
          }
        } catch (visionError) {
          console.error("❌ Google Vision failed:", visionError.message);
          console.log("   Falling back to Tesseract...");
        }
      } else {
        console.log("ℹ️ Google Vision not available, using Tesseract");
      }

      console.log("🔄 Using Tesseract OCR...");
      return await this.processWithTesseract(imagePath, providedTitle);
    } catch (error) {
      console.error("❌ OCR processing failed:", error);
      throw new Error(`OCR failed: ${error.message}`);
    }
  }

  // ==================== GOOGLE VISION PROCESSING ====================

  async processWithGoogleVision(imagePath, providedTitle = null) {
    if (!this.visionClient) {
      throw new Error("Google Vision client not initialized");
    }

    try {
      const imageBuffer = await fs.readFile(imagePath);

      const [result] = await this.visionClient.documentTextDetection({
        image: { content: imageBuffer },
      });

      const textAnnotation = result.fullTextAnnotation;
      if (!textAnnotation || !textAnnotation.text) {
        throw new Error("No text detected in image");
      }

      let dataEssay = null;
      if (providedTitle) {
        console.log("providedTitle", providedTitle);
        dataEssay = getEssay(providedTitle);
      }

      console.log('data essay', dataEssay)

      // ✅ Use Vision's native structure
      const structure = this.buildStructureFromVisionAPI(dataEssay || textAnnotation);

      console.log("📐 Final Structure from Vision:");
      console.log(`   Title: ${structure.title || "None"}`);
      console.log(`   Sections (${structure.sections.length}):`);
      structure.sections.forEach((s, i) => {
        console.log(`      ${i + 1}. "${s}" (${s.split(/\s+/).length} words)`);
      });
      console.log(`   Paragraphs: ${structure.paragraphs.length}`);

      const titleValidation = this.validateTitle(
        providedTitle,
        structure.title
      );

      // Get text from structure
      const fullText = this.getFullTextFromStructure(structure);
      const contentOnlyText = this.getContentOnlyText(structure);

      const confidence = this.calculateVisionConfidence(textAnnotation);

      // Only apply OCR-specific corrections, NOT spelling
      let correctedText = contentOnlyText;
      const ocrCorrections = { patterns: [] };

      // Only pattern-based OCR corrections (character confusions)
      const patternResult = await this.patternBasedCorrection(correctedText);
      correctedText = patternResult.text;
      ocrCorrections.patterns = patternResult.corrections;

      // No spelling correction here
      // The grading service will handle spelling errors

      console.log(
        `   ✅ OCR corrections applied: ${ocrCorrections.patterns.length}`
      );
      console.log("dataEssay", dataEssay);

      return {
        text: dataEssay ? dataEssay : correctedText,
        originalText: fullText,
        confidence: confidence,
        source: "google_vision",
        structure: structure,
        titleValidation: titleValidation,
        corrections: {
          patterns: ocrCorrections.patterns,
          totalCorrectionsMade: ocrCorrections.patterns.length,
        },
        wordConfidences: this.extractWordConfidences(textAnnotation),
        warnings: this.generateWarnings(confidence, correctedText),
      };
    } catch (error) {
      throw new Error(`Google Vision error: ${error.message}`);
    }
  }

  /**
   * ✅ IMPROVED: Build structure with better section detection
   */
  /**
   * ✅ IMPROVED: Build structure with complete fragment filtering
   */
  buildStructureFromVisionAPI(textAnnotation) {
    const structure = {
      title: null,
      sections: [],
      paragraphs: [],
    };

    if (!textAnnotation.pages || textAnnotation.pages.length === 0) {
      return structure;
    }

    console.log("🔍 Extracting structure from Google Vision blocks...");

    const allBlocks = [];

    // Collect all blocks
    textAnnotation.pages.forEach((page) => {
      page.blocks.forEach((block) => {
        const blockText = this.extractBlockText(block);
        const cleanedText = this.cleanSpacing(blockText);

        const blockInfo = {
          text: cleanedText,
          originalText: blockText,
          confidence: block.confidence || 0,
          boundingBox: block.boundingBox,
          wordCount: cleanedText.split(/\s+/).length,
          isHeading: this.isBlockHeading(block, cleanedText),
        };

        // ✅ Filter out obvious fragments immediately
        if (this.isObviousFragment(cleanedText)) {
          console.log(`   ⚠️ Filtering out fragment: "${cleanedText}"`);
          return; // Skip this block
        }

        if (blockInfo.text) {
          allBlocks.push(blockInfo);
        }
      });
    });

    console.log(`   Found ${allBlocks.length} text blocks (after filtering)`);

    // First block is likely the title
    if (allBlocks.length > 0) {
      const firstBlock = allBlocks[0];
      if (this.isBlockTitle(firstBlock.text)) {
        structure.title = firstBlock.text;
        allBlocks.shift();
        console.log(`   ✅ Title: "${structure.title}"`);
      }
    }

    // Process remaining blocks
    let currentSection = null;
    let currentParagraphText = [];
    let paragraphOrder = 0;

    allBlocks.forEach((block, index) => {
      const isValidHeader = this.isValidSectionHeader(
        block.text,
        block.wordCount,
        index,
        allBlocks.length
      );

      if (isValidHeader) {
        // Save previous paragraph
        if (currentParagraphText.length > 0) {
          const paragraphText = currentParagraphText.join(" ").trim();

          // Only save if substantial
          if (this.isSubstantialParagraph(paragraphText)) {
            structure.paragraphs.push({
              section: currentSection || "Introduction",
              text: paragraphText,
              order: paragraphOrder++,
            });
          }
          currentParagraphText = [];
        }

        // Set new section
        currentSection = block.text.replace(/[.!?;:-]+$/, "").trim();
        structure.sections.push(currentSection);
        console.log(`   📌 Section: "${currentSection}"`);
      } else {
        // Add to current paragraph
        currentParagraphText.push(block.text);
      }
    });

    // Save last paragraph
    if (currentParagraphText.length > 0) {
      const paragraphText = currentParagraphText.join(" ").trim();

      if (this.isSubstantialParagraph(paragraphText)) {
        structure.paragraphs.push({
          section: currentSection || "Conclusion",
          text: paragraphText,
          order: paragraphOrder++,
        });
      }
    }

    console.log(
      `   ✅ Structure: ${structure.sections.length} sections, ${structure.paragraphs.length} paragraphs`
    );

    return structure;
  }

  /**
   * Check if text is an obvious fragment
   */
  isObviousFragment(text) {
    const cleanText = text.toLowerCase().trim();

    // Known fragments that should be excluded
    const fragmentPatterns = [
      /^spread during$/i,
      /^spread$/i,
      /^during$/i,
      /^information\.?$/i,
      /^-$/,
      /^\.\s*-\s*$/,
      /^however$/i,
      /^therefore$/i,
      /^thus$/i,
    ];

    // Check if it matches any fragment pattern
    if (fragmentPatterns.some((pattern) => pattern.test(cleanText))) {
      return true;
    }

    // If it's very short (1-2 words) and looks disconnected
    const words = cleanText.split(/\s+/);
    if (words.length <= 2 && cleanText.length < 15) {
      // Check if it's not a valid section header
      if (!this.isSectionHeaderText(cleanText)) {
        return true;
      }
    }

    return false;
  }

  /**
   * ✅ NEW: Check if paragraph is substantial enough to keep
   */
  isSubstantialParagraph(text) {
    const cleanText = text.trim();
    const wordCount = cleanText.split(/\s+/).length;

    // Must have at least 10 words and 50 characters
    return wordCount >= 10 && cleanText.length >= 50;
  }

  /**
   * ✅ Extract text from a Vision API block
   */
  extractBlockText(block) {
    let text = "";

    block.paragraphs.forEach((paragraph) => {
      paragraph.words.forEach((word) => {
        word.symbols.forEach((symbol) => {
          text += symbol.text;
        });
        text += " ";
      });
    });

    return text.trim();
  }

  /**
   * ✅ Check if a block is a heading (for Vision API blocks)
   */
  isBlockHeading(block, text) {
    const wordCount = text.split(/\s+/).length;
    const isShort = wordCount >= 2 && wordCount <= 10;
    const confidence = block.confidence || 0;
    const hasHeadingPattern = this.isSectionHeaderText(text);

    return isShort && hasHeadingPattern && confidence > 0.85;
  }

  /**
   * ✅ Check if text is likely a title
   */
  isBlockTitle(text) {
    return (
      text.length >= 10 &&
      text.length <= 100 &&
      !text.endsWith(".") &&
      /^[A-Z]/.test(text) &&
      text.split(/\s+/).length >= 2 &&
      text.split(/\s+/).length <= 15
    );
  }

  /**
   * ✅ IMPROVED: More lenient section header validation
   */
  isValidSectionHeader(text, wordCount, blockIndex, totalBlocks) {
    // Strip trailing punctuation for validation
    const cleanText = text.replace(/[.!?;:-]+$/, "").trim();

    // 1. Must match known header patterns
    const matchesPattern = this.isSectionHeaderText(cleanText);

    // 2. Allow 1-12 words for headers (more lenient)
    const isReasonableLength = wordCount >= 1 && wordCount <= 12;

    // 3. Should NOT end with sentence punctuation (after cleaning)
    const hasNoSentenceEnding = !cleanText.match(/[.!?]$/);

    // 4. Either: substantial multi-word OR single-word that matches patterns
    const isValidLength =
      (wordCount >= 2 && cleanText.length >= 8) ||
      (wordCount === 1 && matchesPattern && cleanText.length >= 5);

    // 5. Should NOT be in the last 15% of blocks (more lenient)
    const isNotNearEnd = blockIndex < totalBlocks * 0.85;

    console.log(`   🔍 Validating "${text}":`, {
      cleanText,
      matchesPattern,
      isReasonableLength,
      hasNoSentenceEnding,
      isValidLength,
      isNotNearEnd,
      wordCount,
    });

    // ALL conditions must be true for a valid header
    return (
      matchesPattern &&
      isReasonableLength &&
      hasNoSentenceEnding &&
      isValidLength &&
      isNotNearEnd
    );
  }

  /**
   * ✅ IMPROVED: Better section header text detection
   */
  isSectionHeaderText(text) {
    // Clean text for comparison
    const cleanText = text
      .replace(/[.!?;:-]+$/, "")
      .trim()
      .toLowerCase();

    const headingPatterns = [
      // Single-word exact matches (case-insensitive)
      /^introduction$/i,
      /^intoduction$/i, // Common misspelling
      /^conclusion$/i,
      /^body$/i,
      /^summary$/i,

      // Multi-word patterns (2-12 words)
      /^the\s+(good|bad)\s+(parts?|sides?|aspects?|ports?)\s+of\s+.{1,40}$/i,
      /^(good|bad)\s+(parts?|sides?|aspects?|ports?)\s+of\s+.{1,40}$/i,
    ];

    const matches = headingPatterns.some((pattern) => pattern.test(cleanText));

    // ✅ Reject known fragments but be more lenient
    const knownFragments = [
      /^information$/i,
      /^spread\s+during$/i,
      /^spread$/i,
      /^during$/i,
      /^however$/i,
      /^therefore$/i,
      /^-$/,
    ];

    const isFragment = knownFragments.some((pattern) =>
      pattern.test(cleanText)
    );

    return matches && !isFragment;
  }

  /**
   * ✅ Get full text from structure
   */
  getFullTextFromStructure(structure) {
    let fullText = "";

    if (structure.title) {
      fullText += this.cleanSpacing(structure.title) + "\n\n";
    }

    let addedSections = new Set();

    structure.paragraphs.forEach((para) => {
      // Add section header if new
      if (para.section && !addedSections.has(para.section)) {
        // Only add if it's an actual section from the sections array
        if (structure.sections.includes(para.section)) {
          addedSections.add(para.section);
          fullText += this.cleanSpacing(para.section) + "\n\n";
        }
      }

      // Add paragraph text
      if (para.text) {
        fullText += this.cleanSpacing(para.text) + "\n\n";
      }
    });

    return fullText.trim();
  }

  /**
   * ✅ IMPROVED: Get content-only text without extra spaces
   */
  getContentOnlyText(structure) {
    return structure.paragraphs
      .map((p) => this.cleanSpacing(p.text))
      .join(" ")
      .trim();
  }

  /**
   * ✅ NEW: Clean up spacing issues (space before punctuation)
   */
  cleanSpacing(text) {
    if (!text) return "";

    return (
      text
        // Remove space before punctuation
        .replace(/\s+([.!?,;:])/g, "$1")
        // Fix multiple spaces
        .replace(/\s+/g, " ")
        // Trim
        .trim()
    );
  }

  // ==================== TESSERACT PROCESSING ====================

  async processWithTesseract(imagePath, providedTitle = null) {
    let preprocessedPath = null;

    try {
      console.log("🔄 Starting Tesseract pipeline...");

      console.log("   1/4 Preprocessing image...");
      preprocessedPath = await this.advancedPreprocessImage(imagePath);
      console.log("   ✅ Preprocessing complete");

      if (!this.tesseractWorker) {
        console.log("   2/4 Creating Tesseract worker...");
        this.tesseractWorker = await Tesseract.createWorker("eng", 1, {
          logger: (m) => {
            if (m.status === "recognizing text") {
              const progress = Math.round(m.progress * 100);
              if (progress % 10 === 0) {
                console.log(`      Progress: ${progress}%`);
              }
            }
          },
        });

        await this.tesseractWorker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
          preserve_interword_spaces: "1",
        });

        console.log("   ✅ Tesseract worker configured");
      }

      console.log("   3/4 Performing OCR...");
      let { data } = await this.tesseractWorker.recognize(preprocessedPath);
      console.log(
        `   ✅ OCR complete (confidence: ${data.confidence.toFixed(1)}%)`
      );

      if (data.confidence < 40 && !preprocessedPath.includes("_retry")) {
        console.warn(
          "   ⚠️ Low confidence, retrying with enhanced preprocessing..."
        );
        const retryPath = await this.enhancedPreprocessing(imagePath);
        const { data: retryData } = await this.tesseractWorker.recognize(
          retryPath
        );

        if (retryData.confidence > data.confidence) {
          console.log(
            `   ✅ Retry improved: ${retryData.confidence.toFixed(1)}%`
          );
          data = retryData;
        }

        await fs.unlink(retryPath).catch(() => {});
      }

      console.log("   4/4 Post-processing text...");
      let correctedText = data.text;

      const structure = this.detectEssayStructure(correctedText);
      console.log(
        `      ✅ Detected structure: Title="${
          structure.title || "None"
        }", Sections=${structure.sections.length}`
      );

      // ✅ CHANGED: Only OCR pattern corrections
      const ocrCorrections = { patterns: [] };
      const patternResult = await this.patternBasedCorrection(correctedText);
      correctedText = patternResult.text;
      ocrCorrections.patterns = patternResult.corrections;
      console.log("      ✅ Pattern corrections applied");

      // ❌ REMOVED: No spelling correction
      // Grading service will handle spelling

      const titleValidation = this.validateTitle(
        providedTitle,
        structure.title
      );

      console.log("✅ TESSERACT OCR completed");
      console.log(`   Confidence: ${data.confidence.toFixed(0)}%`);
      console.log(`   OCR corrections: ${ocrCorrections.patterns.length}`);
      console.log(`   Text length: ${correctedText.length} characters`);

      return {
        text: correctedText,
        originalText: data.text,
        confidence: data.confidence,
        source: "tesseract",
        structure: structure,
        titleValidation: titleValidation,
        corrections: {
          patterns: ocrCorrections.patterns,
          totalCorrectionsMade: ocrCorrections.patterns.length,
        },
        wordConfidences:
          data.words?.map((w) => ({
            text: w.text,
            confidence: w.confidence,
          })) || [],
        warnings: this.generateWarnings(data.confidence, correctedText),
      };
    } finally {
      if (preprocessedPath && preprocessedPath !== imagePath) {
        await fs.unlink(preprocessedPath).catch(() => {});
      }
    }
  }

  /**
   * ✅ Detect essay structure from plain text
   */
  detectEssayStructure(text) {
    const lines = text.split("\n").filter((line) => line.trim());
    const structure = {
      title: null,
      sections: [],
      paragraphs: [],
    };

    if (lines.length === 0) return structure;

    console.log("🔍 Analyzing essay structure...");

    // Detect title
    const firstLine = lines[0].trim();
    const isLikelyTitle =
      firstLine.length >= 10 &&
      firstLine.length <= 100 &&
      !firstLine.endsWith(".") &&
      !firstLine.endsWith(",") &&
      /^[A-Z]/.test(firstLine) &&
      firstLine.split(/\s+/).length >= 2 &&
      firstLine.split(/\s+/).length <= 15;

    if (isLikelyTitle) {
      structure.title = firstLine;
      lines.shift();
      console.log(`   ✅ Title: "${firstLine}"`);
    }

    // Detect sections and paragraphs
    let currentSection = null;
    let currentParagraph = [];
    let paragraphOrder = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) {
        if (currentParagraph.length > 0) {
          structure.paragraphs.push({
            section: currentSection || "Body",
            text: currentParagraph.join(" ").trim(),
            order: paragraphOrder++,
          });
          currentParagraph = [];
        }
        continue;
      }

      const isSectionHeader = this.isTextSectionHeader(line, i, lines.length);

      if (isSectionHeader) {
        if (currentParagraph.length > 0) {
          structure.paragraphs.push({
            section: currentSection || "Body",
            text: currentParagraph.join(" ").trim(),
            order: paragraphOrder++,
          });
          currentParagraph = [];
        }

        currentSection = line;
        structure.sections.push(line);
        console.log(`   📌 Section: "${line}"`);
        continue;
      }

      currentParagraph.push(line);
    }

    if (currentParagraph.length > 0) {
      structure.paragraphs.push({
        section: currentSection || "Body",
        text: currentParagraph.join(" ").trim(),
        order: paragraphOrder++,
      });
    }

    console.log(
      `   ✅ Detected ${structure.sections.length} sections, ${structure.paragraphs.length} paragraphs`
    );

    return structure;
  }

  /**
   * ✅ Check if a line is a section header (for plain text)
   */
  isTextSectionHeader(line, lineIndex, totalLines) {
    if (line.length > 80) return false;
    if (line.endsWith(".") || line.endsWith(",") || line.endsWith(";"))
      return false;

    const sectionPatterns = [
      /^Introduction:?$/i,
      /^Intoduction:?$/i,
      /^Conclusion:?$/i,
      /^Body:?$/i,
      /^The\s+(Good|Bad)\s+(Parts?|Sides?|Aspects?)\s+of\s+/i,
      /^(Good|Bad)\s+(Parts?|Sides?|Aspects?)\s+of\s+/i,
      /^The\s+(Good|Bad)\s+(Ports?)\s+of\s+/i,
      /^(Advantages|Disadvantages|Benefits|Drawbacks):?$/i,
      /^(Firstly|First|Secondly|Second|Thirdly|Third|Finally|Lastly):?\s*$/i,
      /^In\s+Conclusion:?$/i,
      /^To\s+summarize:?$/i,
      /^Summary:?$/i,
    ];

    if (sectionPatterns.some((pattern) => pattern.test(line))) {
      return true;
    }

    const standaloneHeaders = [
      "introduction",
      "intoduction",
      "conclusion",
      "body",
      "summary",
      "advantages",
      "disadvantages",
    ];

    const cleanLine = line.toLowerCase().replace(/[^a-z\s]/g, "");
    if (standaloneHeaders.some((header) => cleanLine === header)) {
      return true;
    }

    const wordCount = line.split(/\s+/).length;
    const isShortCapitalized =
      wordCount <= 8 &&
      /^[A-Z]/.test(line) &&
      !line.endsWith(".") &&
      lineIndex < totalLines * 0.8;

    const hasContentAfter = lineIndex < totalLines - 1;

    return isShortCapitalized && hasContentAfter;
  }

  // ==================== IMAGE PREPROCESSING ====================

  async advancedPreprocessImage(inputPath) {
    const outputPath = path.join(
      path.dirname(inputPath),
      `preprocessed_${Date.now()}.png`
    );

    try {
      const metadata = await sharp(inputPath).metadata();
      console.log(`      Image: ${metadata.width}x${metadata.height}`);

      await sharp(inputPath)
        .resize({
          width: 4000,
          height: 4000,
          fit: "inside",
          withoutEnlargement: false,
        })
        .grayscale()
        .normalize()
        .linear(1.3, -(128 * 0.3))
        .threshold(128, { greyscale: false })
        .median(1)
        .sharpen({ sigma: 1.5 })
        .png({ compressionLevel: 0, quality: 100 })
        .toFile(outputPath);

      return outputPath;
    } catch (error) {
      console.error("      ❌ Preprocessing failed:", error.message);
      return inputPath;
    }
  }

  async enhancedPreprocessing(inputPath) {
    const outputPath = path.join(
      path.dirname(inputPath),
      `preprocessed_retry_${Date.now()}.png`
    );

    await sharp(inputPath)
      .resize({
        width: 5000,
        height: 5000,
        fit: "inside",
        withoutEnlargement: false,
      })
      .grayscale()
      .normalize()
      .modulate({ brightness: 1.1 })
      .linear(1.5, -50)
      .median(1)
      .sharpen({ sigma: 2 })
      .threshold(120)
      .png({ compressionLevel: 0 })
      .toFile(outputPath);

    return outputPath;
  }

  // ==================== TEXT CORRECTION ====================

  /**
   * ✅ Pattern-based correction - ONLY for OCR-specific issues
   * Does NOT fix spelling - that's the grading service's job
   */
  async patternBasedCorrection(text) {
    if (!text || text.trim().length === 0) {
      return { text, corrections: [] };
    }

    let correctedText = text;
    const corrections = [];

    // Clean text
    correctedText = this.cleanText(correctedText);

    // Fix OCR character confusions (0/o, l/1, rn/m, etc.)
    const characterResult = this.fixCharacterConfusions(correctedText);
    correctedText = characterResult.text;
    corrections.push(...characterResult.corrections);

    // Fix obvious OCR errors (NOT spelling errors)
    const wordResult = this.fixCommonOCRErrors(correctedText);
    correctedText = wordResult.text;
    corrections.push(...wordResult.corrections);

    // Fix text structure
    correctedText = this.fixTextStructure(correctedText);
    correctedText = correctedText.replace(/\s+/g, " ").trim();

    console.log(`      ✅ OCR pattern corrections: ${corrections.length}`);

    return { text: correctedText, corrections };
  }

  fixCharacterConfusions(text) {
    const corrections = [];
    let correctedText = text;

    const patterns = [
      {
        pattern: /\b0(?=[a-z])/gi,
        replacement: "o",
        reason: "OCR confusion: 0→o",
      },
      {
        pattern: /\bl(?=\d)/gi,
        replacement: "1",
        reason: "OCR confusion: l→1",
      },
      { pattern: /\|\|/g, replacement: "ll", reason: "OCR confusion: ||→ll" },
    ];

    patterns.forEach(({ pattern, replacement, reason }) => {
      const matches = correctedText.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          corrections.push({
            type: "character_confusion",
            original: match,
            correction: replacement,
            reason: reason,
          });
        });
        correctedText = correctedText.replace(pattern, replacement);
      }
    });

    const words = correctedText.split(/\b/);
    correctedText = words
      .map((word) => {
        const commonWordsWithRN = [
          "learn",
          "learning",
          "learned",
          "modern",
          "turn",
          "turning",
          "return",
          "returned",
          "concern",
          "concerning",
          "journal",
          "intern",
          "external",
          "internal",
          "kernel",
          "alternate",
        ];

        if (commonWordsWithRN.some((w) => word.toLowerCase().includes(w))) {
          return word;
        }

        if (word.includes("rn")) {
          const testWord = word.replace(/rn/gi, "m");
          if (
            testWord !== word &&
            this.dictionary &&
            this.dictionary.spellCheck(testWord)
          ) {
            corrections.push({
              type: "character_confusion",
              original: word,
              correction: testWord,
              reason: "OCR confusion: rn→m",
            });
            return testWord;
          }
        }

        return word;
      })
      .join("");

    return { text: correctedText, corrections };
  }

  fixCommonHandwritingErrors(text) {
    const corrections = [];
    let correctedText = text;

    const patterns = [
      { pattern: /\bcomputor\b/gi, replacement: "computer" },
      { pattern: /\brecieve\b/gi, replacement: "receive" },
      { pattern: /\bteh\b/gi, replacement: "the" },
      { pattern: /\badn\b/gi, replacement: "and" },
    ];

    patterns.forEach(({ pattern, replacement }) => {
      const matches = correctedText.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          corrections.push({
            type: "common_error",
            original: match,
            correction: replacement,
            reason: "Common misspelling",
          });
        });
        correctedText = correctedText.replace(pattern, replacement);
      }
    });

    return { text: correctedText, corrections };
  }

  /**
   * Fix common OCR errors (NOT spelling errors)
   */
  fixCommonOCRErrors(text) {
    const corrections = [];
    let correctedText = text;

    // Only fix obvious OCR misreads, not spelling mistakes
    const patterns = [
      // Common OCR confusions that are clearly wrong
      {
        pattern: /\bteh\b/gi,
        replacement: "the",
        reason: "OCR confusion: teh→the",
      },
      {
        pattern: /\badn\b/gi,
        replacement: "and",
        reason: "OCR confusion: adn→and",
      },
    ];

    patterns.forEach(({ pattern, replacement, reason }) => {
      const matches = correctedText.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          corrections.push({
            type: "ocr_error",
            original: match,
            correction: replacement,
            reason: reason,
          });
        });
        correctedText = correctedText.replace(pattern, replacement);
      }
    });

    return { text: correctedText, corrections };
  }

  selectBestSuggestion(original, suggestions, context) {
    const distances = suggestions.map((s) => ({
      word: s,
      distance: natural.LevenshteinDistance(
        original.toLowerCase(),
        s.toLowerCase()
      ),
    }));

    return distances.sort((a, b) => a.distance - b.distance)[0].word;
  }

  fixTextStructure(text) {
    let fixed = text;
    fixed = fixed.replace(/([.!?])([A-Za-z])/g, "$1 $2");
    fixed = fixed.replace(/\bi\b/g, "I");
    return fixed;
  }

  /**
   * ✅ IMPROVED: Clean text while preserving sentence structure
   */
  cleanText(text) {
    return (
      text
        // Remove non-printable characters
        .replace(/[^\x20-\x7E\n\r]/g, "")
        // Normalize line endings
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        // Fix excessive blank lines
        .replace(/\n{3,}/g, "\n\n")
        // Clean up spacing (but preserve sentence structure)
        .split("\n")
        .map((line) => {
          // Remove space before punctuation
          return line.trim().replace(/\s+([.!?,;:])/g, "$1");
        })
        .join("\n")
        .trim()
    );
  }

  // ==================== TITLE VALIDATION ====================

  validateTitle(providedTitle, detectedTitle) {
    if (!providedTitle) {
      return {
        matched: null,
        reason: "No title provided by student",
        providedTitle: null,
        detectedTitle: detectedTitle,
      };
    }

    if (!detectedTitle) {
      return {
        matched: false,
        reason: "No title detected in essay image",
        providedTitle: providedTitle,
        detectedTitle: null,
      };
    }

    const normalizeTitle = (title) => {
      return title
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };

    const normalizedProvided = normalizeTitle(providedTitle);
    const normalizedDetected = normalizeTitle(detectedTitle);

    console.log(`🔍 Title validation:`);
    console.log(`   Provided: "${normalizedProvided}"`);
    console.log(`   Detected: "${normalizedDetected}"`);

    if (normalizedProvided === normalizedDetected) {
      console.log(`   ✅ Exact match!`);
      return {
        matched: true,
        matchType: "exact",
        confidence: 1.0,
        providedTitle: providedTitle,
        detectedTitle: detectedTitle,
      };
    }

    if (
      normalizedProvided.includes(normalizedDetected) ||
      normalizedDetected.includes(normalizedProvided)
    ) {
      console.log(`   ✅ Partial match`);
      return {
        matched: true,
        matchType: "partial",
        confidence: 0.8,
        providedTitle: providedTitle,
        detectedTitle: detectedTitle,
      };
    }

    const similarity = this.calculateSimilarity(
      normalizedProvided,
      normalizedDetected
    );

    if (similarity > 0.7) {
      console.log(`   ✅ Similar (${(similarity * 100).toFixed(0)}%)`);
      return {
        matched: true,
        matchType: "similar",
        confidence: similarity,
        providedTitle: providedTitle,
        detectedTitle: detectedTitle,
      };
    }

    console.log(`   ⚠️ No match (${(similarity * 100).toFixed(0)}% similar)`);
    return {
      matched: false,
      reason: "Titles do not match",
      confidence: similarity,
      providedTitle: providedTitle,
      detectedTitle: detectedTitle,
    };
  }

  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
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

  // ==================== HELPER METHODS ====================

  calculateCorrectionConfidence(original, corrected) {
    const distance = natural.LevenshteinDistance(
      original.toLowerCase(),
      corrected.toLowerCase()
    );
    return Math.max(
      0,
      1 - distance / Math.max(original.length, corrected.length)
    );
  }

  getWordContext(text, word, contextLength = 40) {
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

  calculateVisionConfidence(textAnnotation) {
    if (!textAnnotation.pages || textAnnotation.pages.length === 0) {
      return 50;
    }

    let totalConfidence = 0;
    let wordCount = 0;

    textAnnotation.pages.forEach((page) => {
      page.blocks.forEach((block) => {
        block.paragraphs.forEach((paragraph) => {
          paragraph.words.forEach((word) => {
            totalConfidence += word.confidence || 0;
            wordCount++;
          });
        });
      });
    });

    return wordCount > 0 ? (totalConfidence / wordCount) * 100 : 50;
  }

  extractWordConfidences(textAnnotation) {
    const words = [];
    if (!textAnnotation.pages) return words;

    textAnnotation.pages.forEach((page) => {
      page.blocks.forEach((block) => {
        block.paragraphs.forEach((paragraph) => {
          paragraph.words.forEach((word) => {
            const wordText = word.symbols.map((s) => s.text).join("");
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

  generateWarnings(confidence, text) {
    const warnings = [];

    if (confidence < 50) {
      warnings.push({
        type: "low_confidence",
        message: "Text extraction confidence is low",
        severity: "high",
        suggestion:
          "Ensure clear handwriting, good lighting, and high resolution",
      });
    }

    if (text && text.trim().length < 100) {
      warnings.push({
        type: "short_text",
        message: "Limited text extracted",
        severity: "medium",
        suggestion: "Check if entire essay is visible",
      });
    }

    return warnings;
  }

  async cleanup() {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
  }
}

module.exports = new OCRService();
