const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const fs = require('fs').promises;

class DocumentParser {
  /**
   * Parse PDF file
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
   * Clean and normalize text
   */
  cleanText(text) {
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
}

module.exports = new DocumentParser();