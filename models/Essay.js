// const mongoose = require('mongoose');

// const essaySchema = new mongoose.Schema({
//   studentId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Student',
//     required: true,
//     index: true
//   },

//   // Essay content
//   originalText: String,  // Extracted from handwritten/PDF/Word
//   processedText: String,  // Cleaned text for analysis

//   // File information
//   fileType: {
//     type: String,
//     enum: ['handwritten', 'pdf', 'word', 'text']
//   },
//   originalFileName: String,
//   filePath: String,  // S3 or local storage path

//   // OCR information (for handwritten)
//   ocrConfidence: Number,  // 0-1
//   ocrProcessedText: String,
//   ocrCorrected: Boolean,

//   // Grading results
//   grading: {
//     rawScore: Number,  // Model output
//     normalizedScore: Number,  // 0-29
//     finalScore: Number,  // Mapped to original scale
//     maxScore: Number,

//     confidence: Number,  // Model confidence 0-1

//     // Quality breakdown
//     qualityScores: {
//       grammar: Number,      // 0-1
//       content: Number,      // 0-1
//       organization: Number, // 0-1
//       style: Number,        // 0-1
//       mechanics: Number     // 0-1
//     }
//   },

//   // Detailed feedback
//   feedback: {
//     // Level-adapted feedback
//     studentLevel: String,

//     // Grammar issues
//     grammarErrors: [{
//       sentence: String,
//       error: String,
//       correction: String,
//       explanation: String,
//       position: { start: Number, end: Number },
//       severity: String  // 'minor', 'moderate', 'severe'
//     }],

//     // Spelling issues
//     spellingErrors: [{
//       word: String,
//       correction: String,
//       context: String,
//       position: { start: Number, end: Number }
//     }],

//     // Content feedback
//     contentFeedback: {
//       strengths: [String],
//       improvements: [String],
//       examples: [{
//         type: String,  // 'before', 'after', 'suggestion'
//         text: String,
//         explanation: String
//       }]
//     },

//     // Organization feedback
//     organizationFeedback: {
//       structure: String,
//       suggestions: [String]
//     },

//     // Overall summary
//     summary: {
//       overallComment: String,
//       motivationalMessage: String,  // Personalized based on student context
//       keyTakeaways: [String],
//       nextSteps: [String]
//     }
//   },

//   // Detected issues for tracking
//   detectedIssues: [{
//     type: String,
//     severity: Number,
//     description: String
//   }],

//   // Metadata
//   submittedAt: {
//     type: Date,
//     default: Date.now
//   },
//   gradedAt: Date,
//   processingTime: Number,  // milliseconds

//   // Status
//   status: {
//     type: String,
//     enum: ['pending', 'processing', 'graded', 'error'],
//     default: 'pending'
//   },
//   errorMessage: String
// }, {
//   timestamps: true
// });

// // Index for efficient queries
// essaySchema.index({ studentId: 1, submittedAt: -1 });
// essaySchema.index({ status: 1 });

// module.exports = mongoose.model('Essay', essaySchema);

// const mongoose = require('mongoose');

// const essaySchema = new mongoose.Schema({
//   studentId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Student',
//     required: true,
//     index: true
//   },

//   originalText: String,
//   processedText: String,

//   fileType: {
//     type: String,
//     enum: ['handwritten', 'pdf', 'word', 'text']
//   },
//   originalFileName: String,
//   filePath: String,

//   ocrConfidence: Number,
//   ocrProcessedText: String,
//   ocrCorrected: Boolean,

//   grading: {
//     rawScore: Number,
//     normalizedScore: Number,
//     finalScore: Number,
//     maxScore: Number,
//     confidence: Number,

//     qualityScores: {
//       grammar: Number,
//       content: Number,
//       organization: Number,
//       style: Number,
//       mechanics: Number
//     }
//   },

//   feedback: {
//     studentLevel: String,

//     grammarErrors: [{
//       sentence: String,
//       error: String,
//       correction: String,
//       explanation: String,
//       position: { start: Number, end: Number },
//       severity: String
//     }],

//     spellingErrors: [{
//       word: String,
//       correction: String,
//       context: String,
//       position: { start: Number, end: Number }
//     }],

//     contentFeedback: {
//       strengths: [String],
//       improvements: [String],
//       examples: [{  // ✅ This must be array of objects
//         type: String,
//         text: String,
//         explanation: String
//       }]
//     },

//     organizationFeedback: {
//       structure: String,
//       suggestions: [String]
//     },

//     summary: {
//       overallComment: String,
//       motivationalMessage: String,
//       keyTakeaways: [String],
//       nextSteps: [String]
//     }
//   },

//   detectedIssues: [{  // ✅ This must be array of objects
//     type: String,
//     severity: Number,
//     description: String
//   }],

//   submittedAt: {
//     type: Date,
//     default: Date.now
//   },
//   gradedAt: Date,
//   processingTime: Number,

//   status: {
//     type: String,
//     enum: ['pending', 'processing', 'graded', 'error'],
//     default: 'pending'
//   },
//   errorMessage: String
// }, {
//   timestamps: true
// });

// essaySchema.index({ studentId: 1, submittedAt: -1 });
// essaySchema.index({ status: 1 });

// module.exports = mongoose.model('Essay', essaySchema);

const mongoose = require("mongoose");

const essaySchemaV2 = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    originalText: String,
    processedText: String,
    fileType: {
      type: String,
      enum: ["handwritten", "pdf", "word", "text"],
    },
    ocrConfidence: Number,

    grading: {
      rawScore: Number,
      normalizedScore: Number,
      finalScore: Number,
      grade: String, // A, B, C, D, F
      gradeDescription: String,
      confidence: Number,
      qualityScores: {
        grammar: Number,
        content: Number,
        organization: Number,
        style: Number,
        mechanics: Number,
      },
    },

    feedback: {
      studentLevel: String,
      grammarErrors: [{ type: mongoose.Schema.Types.Mixed }],
      spellingErrors: [{ type: mongoose.Schema.Types.Mixed }],
      styleIssues: [{ type: mongoose.Schema.Types.Mixed }], // NEW
      vocabularyEnhancements: [{ type: mongoose.Schema.Types.Mixed }], // NEW
      sentenceStructure: { type: mongoose.Schema.Types.Mixed }, // NEW

      contentFeedback: {
        strengths: [String],
        improvements: [String],
        examples: [{ type: mongoose.Schema.Types.Mixed }], // ✅ Use Mixed to bypass strict validation
      },

      organizationFeedback: {
        structure: String,
        suggestions: [String],
        positives: [String], // NEW
      },

      summary: {
        overallComment: String,
        motivationalMessage: String,
        keyTakeaways: [String],
        nextSteps: [String],
        wordsAnalyzed: Number, // NEW
        sentencesAnalyzed: Number, // NEW
      },
    },

    detectedIssues: [{ type: mongoose.Schema.Types.Mixed }], // ✅ Use Mixed

    submittedAt: { type: Date, default: Date.now },
    gradedAt: Date,
    status: {
      type: String,
      enum: ["pending", "processing", "graded", "error"],
      default: "pending",
    },
  },
  {
    timestamps: true,
    strict: false, // ✅ Disable strict mode temporarily
  }
);

// Force drop and recreate
essaySchemaV2.index({ studentId: 1, submittedAt: -1 });

module.exports = mongoose.model("EssayV2", essaySchemaV2, "essays"); // Still use 'essays' collection
