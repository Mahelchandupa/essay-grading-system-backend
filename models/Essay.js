const mongoose = require("mongoose");

const essaySchemaV2 = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    originalText: String,
    processedText: String,
    fullyCorrectedText: {
      type: String,
      default: "",
    },
    essayStructure: {
      title: {
        type: String,
        default: null,
      },
      sections: [String],
      paragraphs: [
        {
          section: {
            type: String,
            default: "",
          },
          text: {
            type: String,
            required: true,
          },
          correctedText: {
            type: String,
            default: "",
          },
          order: {
            type: Number,
            default: 0,
          },
        },
      ],
      // Store formatted version
      formattedText: {
        type: String,
        default: "",
      },
    },
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

      // Before/After examples
      beforeAfterExamples: [
        {
          type: mongoose.Schema.Types.Mixed,
        },
      ],

      contentFeedback: {
        strengths: [String],
        improvements: [String],
        examples: [{ type: mongoose.Schema.Types.Mixed }],
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

    detectedIssues: [{ type: mongoose.Schema.Types.Mixed }],

    submittedAt: { type: Date, default: Date.now },
    gradedAt: Date,
    status: {
      type: String,
      enum: ["pending", "processing", "graded", "error"],
      default: "pending",
    },

    plagiarism: {
      overallSimilarity: Number,
      isPlagiarized: Boolean,
      confidence: Number,
      checkedChunks: Number,
      citations: [mongoose.Schema.Types.Mixed],
      method: String,
      details: {
        previousSubmissions: [mongoose.Schema.Types.Mixed],
        suspiciousPatterns: [mongoose.Schema.Types.Mixed],
        statistics: mongoose.Schema.Types.Mixed,
        properCitations: Number,
      },
      detectedAt: Date,
    },

    achievementsUnlocked: [
      {
        badgeId: String,
        unlockedAt: {
          type: Date,
          default: Date.now,
        },
        points: Number,
      },
    ],
  },
  {
    timestamps: true,
    strict: false, // Disable strict mode temporarily
  }
);

// Force drop and recreate
essaySchemaV2.index({ studentId: 1, submittedAt: -1 });

module.exports = mongoose.model("EssayV2", essaySchemaV2, "essays"); // Still use 'essays' collection
