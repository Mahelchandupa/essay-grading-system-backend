const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const fs = require("fs").promises;

class DocumentParser {
  /**
   * Parse PDF file with structure detection
   */
  async parsePDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);

      // Clean up text
      let text = data.text;
      text = this.cleanText(text);

      return text;
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse PDF with structure detection
   */
  async parsePDFWithStructure(filePath) {
    try {
      const text = await this.parsePDF(filePath);
      const structure = this.detectStructureFromText(text, "pdf");

      return {
        text: text,
        structure: structure,
        metadata: {
          pages: this.extractPDFMetadata(text),
          wordCount: text.split(/\s+/).length,
        },
        fileType: "pdf",
      };
    } catch (error) {
      console.error("PDF structure parsing error:", error);
      return {
        text: await this.parsePDF(filePath),
        structure: this.getFallbackStructure("pdf"),
      };
    }
  }

  /**
   * Parse Word document (.docx)
   */
  async parseWord(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });

      let text = result.value;
      text = this.cleanText(text);

      // Check for warnings
      if (result.messages.length > 0) {
        console.warn("Word parsing warnings:", result.messages);
      }

      return text;
    } catch (error) {
      throw new Error(`Word document parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse Word document with structure detection
   */
  async parseWordWithStructure(filePath) {
    try {
      const text = await this.parseWord(filePath);
      const structure = this.detectStructureFromText(text, "word");

      return {
        text: text,
        structure: structure,
        metadata: {
          hasHeadings: this.detectWordHeadings(text),
          wordCount: text.split(/\s+/).length,
        },
        fileType: "word",
      };
    } catch (error) {
      console.error("Word structure parsing error:", error);
      return {
        text: await this.parseWord(filePath),
        structure: this.getFallbackStructure("word"),
      };
    }
  }

  /**
   * Parse plain text file
   */
  async parseText(filePath) {
    try {
      const text = await fs.readFile(filePath, "utf-8");
      return this.cleanText(text);
    } catch (error) {
      throw new Error(`Text file parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse text file with structure detection
   */
  async parseTextWithStructure(filePath) {
    try {
      const text = await this.parseText(filePath);
      const structure = this.detectStructureFromText(text, "text");

      return {
        text: text,
        structure: structure,
        metadata: {
          lines: text.split("\n").length,
          wordCount: text.split(/\s+/).length,
        },
        fileType: "text",
      };
    } catch (error) {
      console.error("Text structure parsing error:", error);
      return {
        text: await this.parseText(filePath),
        structure: this.getFallbackStructure("text"),
      };
    }
  }

  /**
   * Universal structure detection for all file types
   */
  detectStructureFromText(text, fileType) {
    console.log(`🔍 Detecting structure from ${fileType}...`);
    console.log(`   Raw text length: ${text.length} chars`);

    this.debugParagraphSplitting(text);

    // First, split into paragraphs based on actual paragraph breaks
    const rawParagraphs = this.splitIntoParagraphs(text);
    console.log(`   Found ${rawParagraphs.length} raw paragraphs`);

    const structure = {
      title: null,
      sections: [],
      paragraphs: [],
      fileType: fileType,
      detectedAt: new Date(),
    };

    if (rawParagraphs.length === 0) {
      console.log("   ⚠️ No content found for structure detection");
      return structure;
    }

    // ✅ IMPROVED: Detect title from first paragraph if it's short and title-like
    const firstParagraph = rawParagraphs[0].trim();
    if (this.isLikelyTitle(firstParagraph, fileType)) {
      structure.title = firstParagraph;
      rawParagraphs.shift(); // Remove title from content
      console.log(`   ✅ Title: "${structure.title}"`);
    } else {
      console.log(
        `   ⚠️ No title detected. First paragraph: "${firstParagraph.substring(
          0,
          50
        )}..."`
      );
    }

    // ✅ IMPROVED: Process each paragraph and assign sections
    let currentSection = "Introduction";
    let paragraphOrder = 0;

    // Always start with Introduction section
    if (!structure.sections.includes(currentSection)) {
      structure.sections.push(currentSection);
    }

    for (let i = 0; i < rawParagraphs.length; i++) {
      const paragraph = rawParagraphs[i].trim();

      if (!paragraph || !this.isSubstantialParagraph(paragraph)) {
        console.log(`   ⚠️ Skipping empty/short paragraph ${i}`);
        continue;
      }

      // ✅ IMPROVED: Check if this paragraph indicates a section change
      const sectionCheck = this.detectSectionFromParagraph(
        paragraph,
        i,
        rawParagraphs.length
      );
      if (sectionCheck.isSection) {
        currentSection = sectionCheck.sectionName;
        if (!structure.sections.includes(currentSection)) {
          structure.sections.push(currentSection);
          console.log(`   📌 New section: "${currentSection}"`);
        }

        // If this paragraph was a section header, skip adding it as content
        if (sectionCheck.isHeaderOnly) {
          continue;
        }
      }

      // ✅ IMPROVED: Check for conclusion indicators in the paragraph content
      if (this.isConclusionParagraph(paragraph, i, rawParagraphs.length)) {
        currentSection = "Conclusion";
        if (!structure.sections.includes(currentSection)) {
          structure.sections.push(currentSection);
          console.log(
            `   📌 Conclusion detected: "${paragraph.substring(0, 50)}..."`
          );
        }
      }

      // Add the paragraph to structure
      structure.paragraphs.push({
        section: currentSection,
        text: paragraph,
        order: paragraphOrder,
        wordCount: paragraph.split(/\s+/).length,
        charCount: paragraph.length,
        paragraphIndex: i,
      });

      paragraphOrder++;
      console.log(
        `   📝 Paragraph ${paragraphOrder} -> "${currentSection}": "${paragraph.substring(
          0,
          40
        )}..."`
      );
    }

    // ✅ IMPROVED: Final validation and cleanup
    this.validateAndCleanStructure(structure);

    console.log(
      `   ✅ FINAL Structure: ${structure.sections.length} sections, ${structure.paragraphs.length} paragraphs`
    );
    structure.sections.forEach((section, idx) => {
      const parasInSection = structure.paragraphs.filter(
        (p) => p.section === section
      ).length;
      console.log(
        `      ${idx + 1}. "${section}": ${parasInSection} paragraphs`
      );
    });

    return structure;
  }

  /**
   * Better structure validation
   */
  validateAndCleanStructure(structure) {
    // Ensure we have sections
    if (structure.sections.length === 0) {
      structure.sections.push("Essay");
    }

    // Ensure all paragraphs have valid sections
    structure.paragraphs.forEach((para) => {
      if (!para.section || !structure.sections.includes(para.section)) {
        // Assign to most appropriate section
        if (para.order === 0) para.section = "Introduction";
        else if (para.order === structure.paragraphs.length - 1)
          para.section = "Conclusion";
        else para.section = structure.sections[0] || "Body";
      }
    });

    // Remove sections with no paragraphs
    structure.sections = structure.sections.filter((section) =>
      structure.paragraphs.some((para) => para.section === section)
    );

    // Ensure we have at least Introduction and Conclusion if we have multiple paragraphs
    if (structure.paragraphs.length >= 3) {
      if (!structure.sections.includes("Introduction")) {
        structure.sections.unshift("Introduction");
      }
      if (!structure.sections.includes("Conclusion")) {
        structure.sections.push("Conclusion");
      }
    }
  }

  // Temporary debug function
  debugParagraphSplitting(text) {
    console.log("=== DEBUG PARAGRAPH SPLITTING ===");
    const paragraphs = this.splitIntoParagraphs(text);
    paragraphs.forEach((p, i) => {
      console.log(`Paragraph ${i + 1}:`);
      console.log(`  Words: ${p.split(/\s+/).length}`);
      console.log(`  Content: "${p.substring(0, 60)}..."`);
      console.log(`  Full: "${p}"`);
      console.log("---");
    });
  }

  /**
   * ✅ NEW: Detect conclusion paragraphs
   */
  isConclusionParagraph(paragraph, paragraphIndex, totalParagraphs) {
    // Last paragraph is often conclusion
    if (paragraphIndex === totalParagraphs - 1 && totalParagraphs > 2) {
      return true;
    }

    // Look for conclusion keywords
    const conclusionIndicators = [
      /in conclusion/i,
      /to conclude/i,
      /in summary/i,
      /to sum up/i,
      /overall,/i,
      /finally,/i,
      /therefore,/i,
      /thus,/i,
      /double-edged sword/i,
      /in.*closing/i,
    ];

    return conclusionIndicators.some((pattern) =>
      pattern.test(paragraph.toLowerCase())
    );
  }

  /**
   * ✅ NEW: Improved section detection from paragraph content
   */
  detectSectionFromParagraph(paragraph, paragraphIndex, totalParagraphs) {
    const firstSentence = paragraph
      .split(/[.!?]+/)[0]
      .trim()
      .toLowerCase();
    const words = paragraph.split(/\s+/);

    // Common section starters
    const sectionIndicators = {
      Introduction: [
        /social media has changed/i,
        /in today['']s society/i,
        /nowadays/i,
        /in the modern world/i,
      ],
      Body: [
        /firstly|first of all|to begin with/i,
        /one major problem|another issue|moreover|furthermore/i,
        /additionally|also|another point/i,
      ],
      "Negative Effects": [
        /negative effects|problems? with|drawbacks|disadvantages/i,
        /cyberbullying|online harassment|addiction/i,
        /low self-esteem|anxiety|depression/i,
      ],
      "Positive Effects": [
        /however.*not entirely bad|positive aspects|benefits/i,
        /helps people connect|learn new skills/i,
        /on the other hand|despite.*problems/i,
      ],
      Conclusion: [
        /in conclusion|to conclude|in summary/i,
        /overall|finally|to sum up/i,
        /double-edged sword|in summary/i,
      ],
    };

    // Check for explicit section headers (short paragraphs that are likely headers)
    if (words.length <= 8 && words.length >= 1) {
      const cleanPara = paragraph
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .trim()
        .toLowerCase();

      const explicitSections = {
        introduction: "Introduction",
        conclusion: "Conclusion",
        summary: "Conclusion",
        "the negative effects": "Negative Effects",
        "the positive effects": "Positive Effects",
        "negative effects": "Negative Effects",
        "positive effects": "Positive Effects",
        advantages: "Positive Effects",
        disadvantages: "Negative Effects",
      };

      if (explicitSections[cleanPara]) {
        return {
          isSection: true,
          sectionName: explicitSections[cleanPara],
          isHeaderOnly: true,
        };
      }
    }

    // Check for section indicators in content
    for (const [sectionName, patterns] of Object.entries(sectionIndicators)) {
      for (const pattern of patterns) {
        if (pattern.test(paragraph)) {
          return {
            isSection: true,
            sectionName: sectionName,
            isHeaderOnly: false,
          };
        }
      }
    }

    // Default: first paragraph is Introduction, last is Conclusion
    if (paragraphIndex === 0) {
      return {
        isSection: true,
        sectionName: "Introduction",
        isHeaderOnly: false,
      };
    }

    if (paragraphIndex === totalParagraphs - 1 && totalParagraphs > 2) {
      return {
        isSection: true,
        sectionName: "Conclusion",
        isHeaderOnly: false,
      };
    }

    return { isSection: false, sectionName: null, isHeaderOnly: false };
  }

  /**
   * Better paragraph splitting that handles various formats
   */
  splitIntoParagraphs(text) {
    if (!text) return [];

    // Normalize line endings and clean up
    text = text.replace(/\r\n/g, "\n");
    text = text.replace(/\r/g, "\n");

    // Split by multiple newlines (paragraph breaks)
    let paragraphs = text.split(/\n\s*\n/);

    // Clean each paragraph
    paragraphs = paragraphs.map((p) => p.trim()).filter((p) => p.length > 0);

    // If we didn't find proper paragraph breaks, try splitting by single newlines
    // but only if the text is long enough to warrant multiple paragraphs
    if (paragraphs.length <= 1 && text.length > 200) {
      console.log(
        "   ⚠️ No paragraph breaks found, trying line-based splitting"
      );
      paragraphs = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line.length > 10);
    }

    console.log(`   📄 Split into ${paragraphs.length} paragraphs`);
    paragraphs.forEach((p, i) => {
      console.log(
        `      ${i + 1}. [${p.split(/\s+/).length} words] "${p.substring(
          0,
          40
        )}..."`
      );
    });

    return paragraphs;
  }

  /**
   * ✅ Helper: Save paragraph to structure
   */
  saveParagraph(structure, paragraphLines, section, order) {
    const paragraphText = paragraphLines.join(" ").trim();

    if (paragraphText && this.isSubstantialParagraph(paragraphText)) {
      structure.paragraphs.push({
        section: section || "Body",
        text: paragraphText,
        order: order,
        wordCount: paragraphText.split(/\s+/).length,
        charCount: paragraphText.length,
      });
    } else if (paragraphText) {
      console.log(
        `   ⚠️ Skipping short paragraph: "${paragraphText.substring(0, 30)}..."`
      );
    }
  }

  /**
   * Enhanced section header detection
   */
  isSectionHeader(line, lineIndex, totalLines, fileType) {
    const cleanLine = line.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    const wordCount = cleanLine.split(/\s+/).length;

    // Skip if too long for a header
    if (line.length > 100 || wordCount > 10) {
      return { isHeader: false };
    }

    // Common section patterns across all file types
    const sectionPatterns = [
      /^Introduction:?$/i,
      /^Conclusion:?$/i,
      /^Summary:?$/i,
      /^Abstract:?$/i,
      /^References:?$/i,
      /^Bibliography:?$/i,
      /^The Good Parts of /i,
      /^The Bad Parts of /i,
      /^Good Parts of /i,
      /^Bad Parts of /i,
      /^Advantages:?$/i,
      /^Disadvantages:?$/i,
      /^Benefits:?$/i,
      /^Drawbacks:?$/i,
      /^Pros:?$/i,
      /^Cons:?$/i,
      /^[IVX]+\.\s+[A-Z]/i, // Roman numerals
      /^[0-9]+\.\s+[A-Z]/i, // Numbered sections
      /^Chapter\s+[0-9IVX]+/i, // Chapter headings
      /^Part\s+[0-9IVX]+/i, // Part headings
    ];

    const standaloneHeaders = [
      "introduction",
      "conclusion",
      "summary",
      "abstract",
      "references",
      "bibliography",
      "body",
      "discussion",
      "analysis",
      "methodology",
      "results",
      "findings",
    ];

    const isPatternMatch = sectionPatterns.some((pattern) =>
      pattern.test(line)
    );
    const isStandaloneHeader = standaloneHeaders.includes(
      cleanLine.toLowerCase()
    );
    const isShortCapitalized =
      wordCount >= 1 &&
      wordCount <= 8 &&
      /^[A-Z][a-z]/.test(line) &&
      !line.endsWith(".") &&
      !line.endsWith(",");

    const isHeader =
      isPatternMatch ||
      isStandaloneHeader ||
      (isShortCapitalized && lineIndex < totalLines * 0.8);

    return {
      isHeader: isHeader,
      cleanHeader: this.cleanSectionHeader(line),
      type: isPatternMatch
        ? "pattern"
        : isStandaloneHeader
        ? "standalone"
        : "capitalized",
    };
  }

  /**
   * Enhanced title detection
   */
  isLikelyTitle(paragraph, fileType) {
    const words = paragraph.split(/\s+/);
    const wordCount = words.length;

    // Title characteristics
    return (
      wordCount >= 2 &&
      wordCount <= 12 &&
      paragraph.length <= 120 &&
      !paragraph.endsWith(".") &&
      !paragraph.endsWith(",") &&
      !paragraph.endsWith(";") &&
      /^[A-Z]/.test(paragraph) &&
      // Not a section header
      !this.detectSectionFromParagraph(paragraph, 0, 1).isSection
    );
  }

  /**
   * Clean section headers
   */
  cleanSectionHeader(header) {
    return header.replace(/[.:;,-]+$/, "").trim();
  }

  /**
   * Check if paragraph is substantial
   */
  isSubstantialParagraph(text) {
    const wordCount = text.split(/\s+/).length;
    return wordCount >= 8 && text.length >= 30; // More lenient threshold
  }

  /**
   * Validate and clean up structure
   */
  validateStructure(structure) {
    // Ensure we have at least one section
    if (structure.sections.length === 0 && structure.paragraphs.length > 0) {
      structure.sections.push("Essay Body");
      console.log('   ⚠️ Added default section: "Essay Body"');
    }

    // Ensure all paragraphs have sections
    structure.paragraphs.forEach((para) => {
      if (!para.section && structure.sections.length > 0) {
        para.section = structure.sections[0];
      }
    });

    // Remove empty sections
    structure.sections = structure.sections.filter((section) => {
      const hasParagraphs = structure.paragraphs.some(
        (para) => para.section === section
      );
      return (
        hasParagraphs || section === "Introduction" || section === "Conclusion"
      );
    });
  }

  /**
   * Fallback structure when detection fails
   */
  getFallbackStructure(fileType) {
    return {
      title: null,
      sections: ["Essay Content"],
      paragraphs: [],
      fileType: fileType,
      fallback: true,
      detectedAt: new Date(),
    };
  }

  /**
   * Extract basic PDF metadata
   */
  extractPDFMetadata(text) {
    const lines = text.split("\n");
    return {
      estimatedPages: Math.ceil(text.length / 2000), // Rough estimate
      lineCount: lines.length,
      hasPageNumbers: /\b\d+\s*\n/.test(text), // Check for page numbers
    };
  }

  /**
   * Detect Word heading patterns
   */
  detectWordHeadings(text) {
    const lines = text.split("\n");
    const headingPatterns = [
      /^[A-Z][A-Z\s]{10,}$/, // ALL CAPS lines
      /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*$/, // Title case alone on line
    ];

    return lines.some((line) =>
      headingPatterns.some((pattern) => pattern.test(line.trim()))
    );
  }

  /**
   * Clean and normalize text
   */
  cleanText(text) {
    if (!text) return "";

    // Remove control characters
    text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

    // Normalize whitespace
    text = text.replace(/\r\n/g, "\n");
    text = text.replace(/\r/g, "\n");

    // Remove excessive blank lines (keep max 2)
    text = text.replace(/\n{3,}/g, "\n\n");

    // Trim each line
    text = text
      .split("\n")
      .map((line) => line.trim())
      .join("\n");

    // Remove leading/trailing whitespace
    text = text.trim();

    return text;
  }

  /**
   * Detect document format
   */
  async detectFormat(filePath) {
    const buffer = await fs.readFile(filePath);

    // Check magic numbers
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      return "pdf";
    }

    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      return "docx";
    }

    // Try to parse as text
    try {
      const text = buffer.toString("utf-8");
      if (
        text.length > 0 &&
        !/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(text.slice(0, 100))
      ) {
        return "text";
      }
    } catch (e) {}

    return "unknown";
  }

  /**
   * Universal parse method that detects format and structure
   */
  async parseDocumentWithStructure(filePath) {
    const format = await this.detectFormat(filePath);

    switch (format) {
      case "pdf":
        return await this.parsePDFWithStructure(filePath);
      case "docx":
        return await this.parseWordWithStructure(filePath);
      case "text":
        return await this.parseTextWithStructure(filePath);
      default:
        throw new Error(`Unsupported document format: ${format}`);
    }
  }
}

module.exports = new DocumentParser();