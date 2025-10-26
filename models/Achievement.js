const mongoose = require("mongoose");

/**
 * Achievement Schema - Stores badge definitions and student progress
 */
const achievementSchema = new mongoose.Schema(
  {
    // Badge Definition (static data)
    badgeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    category: {
      type: String,
      enum: [
        "Learning & Progression",
        "Grammar & Language Mastery",
        "Creativity & Originality",
        "Consistency & Effort",
        "Feedback & Engagement",
        "Special & Cumulative",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    criteria: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced", "Expert"],
      required: true,
    },
    icon: {
      type: String,
      required: true,
    },
    // Points awarded for this achievement
    points: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
achievementSchema.index({ category: 1, difficulty: 1 });
achievementSchema.index({ badgeId: 1 });

module.exports = mongoose.model("Achievement", achievementSchema);