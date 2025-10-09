const express = require("express");
const router = express.Router();
const multer = require("multer");
const EssayGradingService = require("../services/EssayGradingService");
const OCRService = require("../services/OCRService");
const DocumentParser = require("../services/DocumentParser");
const Essay = require("../models/Essay");
const path = require('path');
const fs = require('fs').promises;

// const upload = multer({ dest: "uploads/" });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image, PDF, Word, and text files are allowed'));
    }
  }
});

/**
 * POST /api/essays/grade
 * Grade an uploaded essay
 */
// router.post("/grade", upload.single("essay"), async (req, res) => {
//   try {
//     const { studentId } = req.body;
//     const file = req.file;

//     if (!file) {
//       return res.status(400).json({ error: "No file uploaded" });
//     }

//     let text = "";
//     let fileType = "";
//     let ocrConfidence = 1.0;

//     // Process based on file type
//     if (file.mimetype.includes("image")) {
//       // Handwritten essay - OCR
//       const ocrResult = await OCRService.processImage(file.path);
//       text = ocrResult.text;
//       fileType = "handwritten";
//       ocrConfidence = ocrResult.confidence;
//     } else if (file.mimetype.includes("pdf")) {
//       text = await DocumentParser.parsePDF(file.path);
//       fileType = "pdf";
//     } else if (file.mimetype.includes("word")) {
//       text = await DocumentParser.parseWord(file.path);
//       fileType = "word";
//     } else {
//       text = await DocumentParser.parseText(file.path);
//       fileType = "text";
//     }

//     // Grade the essay
//     const result = await EssayGradingService.gradeEssay({
//       studentId,
//       text,
//       fileType,
//       ocrConfidence,
//     });

//     res.json({
//       success: true,
//       essay: {
//         id: result.essay._id,
//         score: result.essay.grading.finalScore,
//         grade: result.essay.grading.grade, // Add grade
//         gradeDescription: result.essay.grading.gradeDescription, // Add description
//         maxScore: 100, // Update to 100-point scale
//         confidence: result.essay.grading.confidence,
//         qualityBreakdown: result.qualityBreakdown,
//       },
//       feedback: result.feedback,
//       studentLevel: result.studentLevel,
//       levelUpdate: result.levelUpdate,
//     });
//   } catch (error) {
//     console.error("Essay grading error:", error);
//     res.status(500).json({
//       error: "Failed to grade essay",
//       message: error.message,
//     });
//   }
// });

router.post('/grade', upload.single('essay'), async (req, res) => {
  let filePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    filePath = req.file.path;
    let fileType = req.file.mimetype;
    
    console.log(`Processing file: ${filePath}, Type: ${fileType}`);

    let extractedText = '';
    let confidence = 0;
    let warnings = [];

     // Set timeout for OCR processing (30 seconds max)
    const ocrTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OCR processing timeout')), 30000);
    });

    // Handle different file types
    if (fileType.startsWith('image/')) {
      console.log('Processing as handwritten image...');
      
      const ocrPromise = OCRService.processImage(filePath);
      const ocrResult = await Promise.race([ocrPromise, ocrTimeout]);
      
      extractedText = ocrResult.text;
      confidence = ocrResult.confidence;
      warnings = ocrResult.warnings;
      // if file type image/
      if (fileType.startsWith('image/')) {
        fileType = 'handwritten';
      }
      
      console.log(`OCR completed. Confidence: ${confidence}%`);
      console.log(`Extracted text length: ${extractedText.length} characters`);
      
    } else if (fileType === 'application/pdf') {
      extractedText = await DocumentParser.parsePDF(filePath);
      confidence = 95; // High confidence for digital PDF
      
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      extractedText = await DocumentParser.parseWord(filePath);
      confidence = 95; // High confidence for digital Word
      
    } else if (fileType === 'text/plain') {
      extractedText = await DocumentParser.parseText(filePath);
      confidence = 98; // Very high confidence for plain text
      
    } else {
      throw new Error('Unsupported file type');
    }

    // Check if text extraction was successful
    if (!extractedText || extractedText.trim().length < 10) {
      throw new Error('Text extraction failed or essay is too short. Please ensure the image is clear and contains readable text.');
    }

    // Continue with grading
    const gradingResult = await EssayGradingService.gradeEssay({
      text: extractedText,
      studentId: req.body.studentId,
      fileType: fileType,
      ocrConfidence: confidence
    });
    
    // Add OCR-specific information
    gradingResult.textExtraction = {
      method: fileType.startsWith('image/') ? 'ocr' : 'digital',
      confidence: confidence,
      wordCount: extractedText.split(/\s+/).length,
      warnings: warnings
    };

    res.json({
      success: true,
      ...gradingResult
    });

  } catch (error) {
    console.error('Essay grading error:', error);
    
    let errorMessage = error.message;
    let suggestion = 'Please try again with a clearer image or typed document.';

    if (error.message.includes('timeout')) {
      errorMessage = 'OCR processing took too long. The image might be too large or complex.';
      suggestion = 'Try using a smaller image or better lighting.';
    } else if (error.message.includes('Text extraction failed')) {
      suggestion = 'Ensure the handwriting is clear and the entire essay is visible in the image.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      suggestion: suggestion
    });
    
  } finally {
    // Cleanup uploaded file
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        console.warn('File cleanup error:', cleanupError);
      }
    }
  }
});

function getErrorSuggestion(errorMessage) {
  if (errorMessage.includes('OCR failed')) {
    return 'Please ensure your handwriting is clear and the image is well-lit. Try taking a clearer photo.';
  } else if (errorMessage.includes('file type')) {
    return 'Please upload only JPG, PNG, PDF, DOCX, or TXT files.';
  } else if (errorMessage.includes('Text extraction failed')) {
    return 'The essay appears to be too short or unreadable. Please check your file and try again.';
  } else {
    return 'Please try again with a different file or contact support if the problem persists.';
  }
}

// Add cleanup on process exit
process.on('SIGINT', async () => {
  await OCRService.cleanup();
  process.exit(0);
});

/**
 * GET /api/essays/student/:studentId
 * Get student's essay history
 */
router.get("/student/:studentId", async (req, res) => {
  try {
    const essays = await Essay.find({ studentId: req.params.studentId })
      .sort({ submittedAt: -1 })
      .limit(20);

    res.json({ success: true, essays });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
