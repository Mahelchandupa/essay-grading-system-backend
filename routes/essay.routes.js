const express = require("express");
const router = express.Router();
const multer = require("multer");
const { catchAsync } = require("../utils/catchAsync");
const { createError } = require("../utils/errorResponse");
const EssayGradingService = require("../services/EssayGradingService");
const PlagiarismDetector = require("../services/PlagiarismDetector");
const OCRService = require("../services/OCRService");
const DocumentParser = require("../services/DocumentParser");
const Essay = require("../models/Essay");
const path = require("path");
const { authenticateUser } = require("../middleware/authMiddleware");
const AchievementService = require("../services/AchievementService");
const fs = require("fs").promises;

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|docx|word|txt/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(
        createError(
          "BAD_REQUEST",
          "Only image, PDF, Word, and text files are allowed"
        )
      );
    }
  },
});

/**
 * POST /api/essays/grade
 * Grade an uploaded essay with title
 */
router.post(
  "/grade",
  authenticateUser,
  upload.single("essay"),
  catchAsync(async (req, res) => {
    let filePath = null;

    try {
      if (!req.file) {
        throw createError("BAD_REQUEST", "No file uploaded");
      }

      filePath = req.file.path;
      let fileType = req.file.mimetype;

      console.log(`Processing file: ${filePath}, Type: ${fileType}`);
      console.log(`Essay title: ${req.body.title || "Untitled"}`);

      let extractedText = "";
      let confidence = 95; // Default for non-image files
      let warnings = [];
      let ocrSource = "document_parser";
      let ocrCorrections = null;
      let essayStructure = null;
      let originalText = null;
      let titleValidation = null;

      // ===== TEXT EXTRACTION =====
      if (fileType.startsWith("image/")) {
        console.log("Processing as handwritten image...");

        const ocrResult = await OCRService.processImage(
          filePath,
          req.body.title
        );

        extractedText = ocrResult.text; // Content-only text
        originalText = ocrResult.originalText; // Full text with structure
        confidence = ocrResult.confidence;
        warnings = ocrResult.warnings;
        ocrSource = ocrResult.source;
        ocrCorrections = ocrResult.corrections;
        essayStructure = ocrResult?.structure || {
          title: null,
          sections: [],
          paragraphs: [],
        };
        titleValidation = ocrResult.titleValidation;

        fileType = "handwritten";

        console.log(`${ocrSource.toUpperCase()} OCR completed`);
        console.log(`   Confidence: ${confidence}%`);
        console.log(`   Content length: ${extractedText.length} characters`);
        console.log(`   Original length: ${originalText.length} characters`);

        // Log title validation
        if (titleValidation) {
          console.log(
            `   Title validation: ${
              titleValidation.matched ? "✅ MATCH" : "⚠️ MISMATCH"
            }`
          );
          if (!titleValidation.matched && titleValidation.reason) {
            console.log(`   Reason: ${titleValidation.reason}`);
          }
        }
      } else {
        console.log(`Processing as ${fileType} with structure detection...`);

        // Use the universal document parser for all non-image files
        const documentResult = await DocumentParser.parseDocumentWithStructure(
          filePath
        );
        extractedText = documentResult.text;
        essayStructure = documentResult.structure;
        originalText = documentResult.text;
        documentMetadata = documentResult.metadata;
        fileType = fileType.includes('pdf') ? 'pdf' : 
             fileType.includes('word') ? 'word' : 'text';

        console.log(`${fileType.toUpperCase()} structure detection complete`);
        console.log(`   Title: ${essayStructure.title || "None"}`);
        console.log(`   Sections: ${essayStructure.sections.length}`);
        console.log(`   Paragraphs: ${essayStructure.paragraphs.length}`);
      }

      // else if (fileType === "application/pdf") {
      //   extractedText = await DocumentParser.parsePDF(filePath);
      //   confidence = 95;
      //   extractedText = result.text;
      //   essayStructure = result.structure;
      //   originalText = result.text;
      //   fileType = "pdf";
      // } else if (
      //   fileType ===
      //   "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      // ) {
      //   extractedText = await DocumentParser.parseWord(filePath);
      //   confidence = 95;
      //   extractedText = result.text;
      //   essayStructure = result.structure;
      //   originalText = result.text;
      //   fileType = "word";
      // } else if (fileType === "text/plain") {
      //   extractedText = await DocumentParser.parseText(filePath);
      //   confidence = 98;
      //   extractedText = result.text;
      //   essayStructure = result.structure;
      //   originalText = result.text;
      //   fileType = "text";
      // } else {
      //   throw createError("BAD_REQUEST", "Unsupported file type");
      // }

      if (!extractedText || extractedText.trim().length < 20) {
        throw createError(
          "BAD_REQUEST",
          "Insufficient text extracted. Please ensure clear handwriting and a readable image.",
          { minLength: 20, extractedLength: extractedText?.length || 0 }
        );
      }

      // Determine final title with validation info
      let finalTitle =
        req.body.title || essayStructure?.title || "Untitled Essay";

      // If title validation failed but we detected a title, add warning
      if (fileType.startsWith("image/")) {
        if (
          titleValidation &&
          !titleValidation.matched &&
          essayStructure?.title
        ) {
          warnings.push({
            type: "title_mismatch",
            message: "Uploaded essay title doesn't match provided title",
            severity: "medium",
            providedTitle: req.body.title,
            detectedTitle: essayStructure.title,
            suggestion: "Please verify you uploaded the correct essay",
          });
        }
      }

      console.log("🔄 Starting essay grading...");

      // First grade the essay
      const gradingResult = await EssayGradingService.gradeEssay({
        text: extractedText, // Content-only for analysis
        originalText: originalText, // Full text for display
        studentId: req.student._id,
        title: req.body.title || essayStructure.title || "Untitled Essay",
        fileType: fileType,
        ocrConfidence: confidence,
        ocrCorrections: ocrCorrections,
        structure: essayStructure,
      });

      console.log("✅ Essay grading completed");

      const studentMongoId = req.student._id;

      // Run plagiarism detection
      const plagiarismResults = await PlagiarismDetector.detectPlagiarism(
        extractedText,
        req.userId || null
      );

      res.json({
        success: true,
        // Essay object with all data
        essay: {
          ...gradingResult.essay,
          // Add these for convenience (but they're already in essay object)
          textExtraction: {
            method: ocrSource,
            confidence: confidence,
            wordCount: extractedText.split(/\s+/).length,
            corrections: ocrCorrections,
            warnings: warnings,
            titleValidation: titleValidation,
            engine:
              ocrSource === "google_vision"
                ? "Google Cloud Vision"
                : "Tesseract",
          },
          plagiarism: plagiarismResults,
        },
        // Student and level info
        studentLevel: gradingResult.studentLevel,
        levelUpdate: gradingResult.levelUpdate,
        // Achievement data
        achievements: gradingResult.achievements,
        // Quality breakdown for quick access
        qualityBreakdown: gradingResult.qualityBreakdown,
      });
    } catch (error) {
      console.error("Essay grading error:", error);
      throw error; // Let the global error handler catch it
    } finally {
      if (filePath) {
        try {
          await fs.unlink(filePath);
          console.log("✅ Uploaded file cleaned up");
        } catch (cleanupError) {
          console.warn("File cleanup error:", cleanupError);
        }
      }
    }
  })
);

/**
 * GET /api/essays/student/:studentId
 * Get student essays (Protected - user can only access their own essays)
 */
router.get(
  "/student",
  authenticateUser,
  catchAsync(async (req, res) => {
    const requestedStudentId = req.studentId;
    const authenticatedStudent = req.student;

    // Check if user is requesting their own data
    if (requestedStudentId !== authenticatedStudent.studentId) {
      throw createError(
        "FORBIDDEN",
        "Access denied. You can only view your own essays."
      );
    }

    const essays = await Essay.find({ studentId: authenticatedStudent._id })
      .sort({ submittedAt: -1 })
      .limit(20)
      .populate("studentId", "name email studentId");

    res.json({ success: true, essays });
  })
);

/**
 * GET /api/essays/:essayId
 * Get specific essay with achievements (Protected - user can only access their own essays)
 */
router.get(
  "/:essayId",
  authenticateUser,
  catchAsync(async (req, res) => {
    const essay = await Essay.findOne({
      _id: req.params.essayId,
      studentId: req.student._id,
    }).populate("studentId", "name email studentId");

    if (!essay) {
      throw createError("NOT_FOUND", "Essay not found");
    }

    // Get all student achievements
    const achievements = await AchievementService.getStudentAchievements(
      req.userId
    );

    // Get achievements specifically unlocked for this essay
    const essayAchievements = await AchievementService.getEssayAchievements(
      req.params.essayId,
      req.userId
    );

    res.json({ 
      success: true, 
      essay: {
        ...essay.toObject(),
        // Add achievements specifically unlocked for this essay
        achievementsUnlocked: essayAchievements
      },
      // Include all student achievements for the achievements tab
      achievements: achievements
    });
  })
);

process.on("SIGINT", async () => {
  await OCRService.cleanup();
  process.exit(0);
});

module.exports = router;
