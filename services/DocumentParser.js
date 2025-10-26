const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const fs = require('fs').promises;

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
   * ✅ NEW: Parse PDF with structure detection
   */
  async parsePDFWithStructure(filePath) {
    try {
      const text = await this.parsePDF(filePath);
      const structure = this.detectStructureFromText(text, 'pdf');
      
      return {
        text: text,
        structure: structure,
        metadata: {
          pages: this.extractPDFMetadata(text),
          wordCount: text.split(/\s+/).length
        },
        fileType: 'pdf'
      };
    } catch (error) {
      console.error("PDF structure parsing error:", error);
      return {
        text: await this.parsePDF(filePath),
        structure: this.getFallbackStructure('pdf')
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
        console.warn('Word parsing warnings:', result.messages);
      }
      
      return text;
    } catch (error) {
      throw new Error(`Word document parsing failed: ${error.message}`);
    }
  }

  /**
   * ✅ NEW: Parse Word document with structure detection
   */
  async parseWordWithStructure(filePath) {
    try {
      const text = await this.parseWord(filePath);
      const structure = this.detectStructureFromText(text, 'word');
      
      return {
        text: text,
        structure: structure,
        metadata: {
          hasHeadings: this.detectWordHeadings(text),
          wordCount: text.split(/\s+/).length
        },
        fileType: 'word'
      };
    } catch (error) {
      console.error("Word structure parsing error:", error);
      return {
        text: await this.parseWord(filePath),
        structure: this.getFallbackStructure('word')
      };
    }
  }

  /**
   * Parse plain text file
   */
  async parseText(filePath) {
    try {
      const text = await fs.readFile(filePath, 'utf-8');
      return this.cleanText(text);
    } catch (error) {
      throw new Error(`Text file parsing failed: ${error.message}`);
    }
  }

  /**
   * ✅ NEW: Parse text file with structure detection
   */
  async parseTextWithStructure(filePath) {
    try {
      const text = await this.parseText(filePath);
      const structure = this.detectStructureFromText(text, 'text');
      
      return {
        text: text,
        structure: structure,
        metadata: {
          lines: text.split('\n').length,
          wordCount: text.split(/\s+/).length
        },
        fileType: 'text'
      };
    } catch (error) {
      console.error("Text structure parsing error:", error);
      return {
        text: await this.parseText(filePath),
        structure: this.getFallbackStructure('text')
      };
    }
  }

  /**
   * ✅ IMPROVED: Universal structure detection for all file types
   */
  detectStructureFromText(text, fileType) {
    console.log(`🔍 Detecting structure from ${fileType}...`);
    
    const lines = text.split('\n').filter(line => line.trim());
    const structure = {
      title: null,
      sections: [],
      paragraphs: [],
      fileType: fileType,
      detectedAt: new Date()
    };

    if (lines.length === 0) {
      console.log('   ⚠️ No content found for structure detection');
      return structure;
    }

    // Detect title (first substantial line)
    const firstLine = lines[0].trim();
    if (this.isLikelyTitle(firstLine, fileType)) {
      structure.title = firstLine;
      lines.shift(); // Remove title from content lines
      console.log(`   ✅ Title: "${firstLine}"`);
    } else {
      console.log(`   ⚠️ No title detected. First line: "${firstLine.substring(0, 50)}..."`);
    }

    // Enhanced section detection for all file types
    let currentSection = 'Introduction'; // Default first section
    let currentParagraph = [];
    let paragraphOrder = 0;
    let sectionOrder = 0;

    // Add initial section if we have content
    if (lines.length > 0 && !structure.sections.includes(currentSection)) {
      structure.sections.push(currentSection);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) {
        // Save paragraph when encountering blank line
        if (currentParagraph.length > 0) {
          this.saveParagraph(structure, currentParagraph, currentSection, paragraphOrder);
          currentParagraph = [];
          paragraphOrder++;
        }
        continue;
      }

      // Check if line is a section header
      const sectionResult = this.isSectionHeader(line, i, lines.length, fileType);
      if (sectionResult.isHeader) {
        // Save previous paragraph
        if (currentParagraph.length > 0) {
          this.saveParagraph(structure, currentParagraph, currentSection, paragraphOrder);
          currentParagraph = [];
          paragraphOrder++;
        }

        // Set new section
        currentSection = sectionResult.cleanHeader;
        if (!structure.sections.includes(currentSection)) {
          structure.sections.push(currentSection);
          sectionOrder++;
          console.log(`   📌 Section ${sectionOrder}: "${currentSection}"`);
        }
        continue;
      }

      // Add to current paragraph
      currentParagraph.push(line);
    }

    // Save final paragraph
    if (currentParagraph.length > 0) {
      this.saveParagraph(structure, currentParagraph, currentSection, paragraphOrder);
    }

    // Final validation
    this.validateStructure(structure);
    
    console.log(`   ✅ Structure detected: ${structure.sections.length} sections, ${structure.paragraphs.length} paragraphs`);
    return structure;
  }

  /**
   * ✅ Helper: Save paragraph to structure
   */
  saveParagraph(structure, paragraphLines, section, order) {
    const paragraphText = paragraphLines.join(' ').trim();
    
    if (paragraphText && this.isSubstantialParagraph(paragraphText)) {
      structure.paragraphs.push({
        section: section || 'Body',
        text: paragraphText,
        order: order,
        wordCount: paragraphText.split(/\s+/).length,
        charCount: paragraphText.length
      });
    } else if (paragraphText) {
      console.log(`   ⚠️ Skipping short paragraph: "${paragraphText.substring(0, 30)}..."`);
    }
  }

  /**
   * ✅ Enhanced section header detection
   */
  isSectionHeader(line, lineIndex, totalLines, fileType) {
    const cleanLine = line.replace(/[^a-zA-Z0-9\s]/g, '').trim();
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
      'introduction', 'conclusion', 'summary', 'abstract', 
      'references', 'bibliography', 'body', 'discussion',
      'analysis', 'methodology', 'results', 'findings'
    ];

    const isPatternMatch = sectionPatterns.some(pattern => pattern.test(line));
    const isStandaloneHeader = standaloneHeaders.includes(cleanLine.toLowerCase());
    const isShortCapitalized = wordCount >= 1 && wordCount <= 8 && 
                              /^[A-Z][a-z]/.test(line) && 
                              !line.endsWith('.') && 
                              !line.endsWith(',');

    const isHeader = isPatternMatch || isStandaloneHeader || (isShortCapitalized && lineIndex < totalLines * 0.8);

    return {
      isHeader: isHeader,
      cleanHeader: this.cleanSectionHeader(line),
      type: isPatternMatch ? 'pattern' : (isStandaloneHeader ? 'standalone' : 'capitalized')
    };
  }

  /**
   * ✅ Enhanced title detection
   */
  isLikelyTitle(line, fileType) {
    const wordCount = line.split(/\s+/).length;
    const hasEndingPunctuation = /[.!?,;:]$/.test(line);
    
    // Title should not be a section header
    if (this.isSectionHeader(line, 0, 1, fileType).isHeader) {
      return false;
    }

    return (
      line.length >= 10 &&
      line.length <= 200 &&
      !hasEndingPunctuation &&
      /^[A-Z]/.test(line) &&
      wordCount >= 2 &&
      wordCount <= 15
    );
  }

  /**
   * ✅ Clean section headers
   */
  cleanSectionHeader(header) {
    return header.replace(/[.:;,-]+$/, '').trim();
  }

  /**
   * ✅ Check if paragraph is substantial
   */
  isSubstantialParagraph(text) {
    const wordCount = text.split(/\s+/).length;
    return wordCount >= 3 && text.length >= 20;
  }

  /**
   * ✅ Validate and clean up structure
   */
  validateStructure(structure) {
    // Ensure we have at least one section
    if (structure.sections.length === 0 && structure.paragraphs.length > 0) {
      structure.sections.push('Essay Body');
      console.log('   ⚠️ Added default section: "Essay Body"');
    }

    // Ensure all paragraphs have sections
    structure.paragraphs.forEach(para => {
      if (!para.section && structure.sections.length > 0) {
        para.section = structure.sections[0];
      }
    });

    // Remove empty sections
    structure.sections = structure.sections.filter(section => {
      const hasParagraphs = structure.paragraphs.some(para => para.section === section);
      return hasParagraphs || section === 'Introduction' || section === 'Conclusion';
    });
  }

  /**
   * ✅ Fallback structure when detection fails
   */
  getFallbackStructure(fileType) {
    return {
      title: null,
      sections: ['Essay Content'],
      paragraphs: [],
      fileType: fileType,
      fallback: true,
      detectedAt: new Date()
    };
  }

  /**
   * ✅ Extract basic PDF metadata
   */
  extractPDFMetadata(text) {
    const lines = text.split('\n');
    return {
      estimatedPages: Math.ceil(text.length / 2000), // Rough estimate
      lineCount: lines.length,
      hasPageNumbers: /\b\d+\s*\n/.test(text) // Check for page numbers
    };
  }

  /**
   * ✅ Detect Word heading patterns
   */
  detectWordHeadings(text) {
    const lines = text.split('\n');
    const headingPatterns = [
      /^[A-Z][A-Z\s]{10,}$/, // ALL CAPS lines
      /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*$/, // Title case alone on line
    ];

    return lines.some(line => headingPatterns.some(pattern => pattern.test(line.trim())));
  }

  /**
   * Clean and normalize text
   */
  cleanText(text) {
    if (!text) return '';

    // Remove control characters
    text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    
    // Normalize whitespace
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\r/g, '\n');
    
    // Remove excessive blank lines (keep max 2)
    text = text.replace(/\n{3,}/g, '\n\n');
    
    // Trim each line
    text = text.split('\n').map(line => line.trim()).join('\n');
    
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
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'pdf';
    }
    
    if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
      return 'docx';
    }
    
    // Try to parse as text
    try {
      const text = buffer.toString('utf-8');
      if (text.length > 0 && !/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(text.slice(0, 100))) {
        return 'text';
      }
    } catch (e) {}
    
    return 'unknown';
  }

  /**
   * ✅ NEW: Universal parse method that detects format and structure
   */
  async parseDocumentWithStructure(filePath) {
    const format = await this.detectFormat(filePath);
    
    switch (format) {
      case 'pdf':
        return await this.parsePDFWithStructure(filePath);
      case 'docx':
        return await this.parseWordWithStructure(filePath);
      case 'text':
        return await this.parseTextWithStructure(filePath);
      default:
        throw new Error(`Unsupported document format: ${format}`);
    }
  }
}

module.exports = new DocumentParser();