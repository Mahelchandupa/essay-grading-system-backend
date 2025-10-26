const express = require("express");
const router = express.Router();
const Essay = require("../models/Essay");
const { authenticateUser } = require("../middleware/authMiddleware");

/**
 * GET /api/analytics/student/:studentId
 * Get detailed analytics for a student
 */
router.get("/student", authenticateUser, async (req, res) => {
  try {
    const requestedStudentId = req.studentId;
    const authenticatedStudent = req.student;

    // Check if user is requesting their own data
    if (requestedStudentId !== authenticatedStudent.studentId) {
      return res.status(403).json({ 
        success: false, 
        error: "Access denied" 
      });
    }

    const essays = await Essay.find({ studentId: authenticatedStudent._id })
      .sort({ submittedAt: -1 })
      .limit(50);

    if (essays.length === 0) {
      return res.json({
        success: true,
        analytics: {
          scoreDistribution: [],
          qualityTrends: [],
          errorCategories: [],
          improvementAreas: [],
          timeAnalysis: [],
          categoryBreakdown: {},
          summary: {
            totalEssays: 0,
            averageScore: 0,
            bestScore: 0,
            worstScore: 0,
            totalWords: 0,
            averageWords: 0
          }
        }
      });
    }

    // Score Distribution (for bar chart)
    const scoreRanges = {
      '90-100': { count: 0, label: 'A (90-100)', color: '#10b981' },
      '80-89': { count: 0, label: 'B (80-89)', color: '#3b82f6' },
      '70-79': { count: 0, label: 'C (70-79)', color: '#f59e0b' },
      '60-69': { count: 0, label: 'D (60-69)', color: '#f97316' },
      '0-59': { count: 0, label: 'F (0-59)', color: '#ef4444' }
    };

    essays.forEach(essay => {
      const score = essay.grading.finalScore;
      if (score >= 90) scoreRanges['90-100'].count++;
      else if (score >= 80) scoreRanges['80-89'].count++;
      else if (score >= 70) scoreRanges['70-79'].count++;
      else if (score >= 60) scoreRanges['60-69'].count++;
      else scoreRanges['0-59'].count++;
    });

    // Quality Trends Over Time
    const qualityTrends = essays.slice(0, 20).reverse().map((essay, idx) => ({
      essayNumber: idx + 1,
      date: essay.submittedAt,
      grammar: Math.round(essay.grading.qualityScores.grammar * 100),
      content: Math.round(essay.grading.qualityScores.content * 100),
      organization: Math.round(essay.grading.qualityScores.organization * 100),
      style: Math.round(essay.grading.qualityScores.style * 100),
      mechanics: Math.round(essay.grading.qualityScores.mechanics * 100),
      overallScore: essay.grading.finalScore
    }));

    // Error Categories (for tree map)
    const errorCategories = {};
    essays.forEach(essay => {
      // Grammar errors
      essay.feedback?.grammarErrors?.forEach(error => {
        const category = error.type || 'other';
        errorCategories[category] = (errorCategories[category] || 0) + 1;
      });

      // Spelling errors
      if (essay.feedback?.spellingErrors?.length > 0) {
        errorCategories['spelling'] = (errorCategories['spelling'] || 0) + essay.feedback.spellingErrors.length;
      }

      // Style issues
      essay.feedback?.styleIssues?.forEach(issue => {
        const category = `style_${issue.type}`;
        errorCategories[category] = (errorCategories[category] || 0) + 1;
      });
    });

    // Convert to tree map format
    const errorTree = Object.entries(errorCategories)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, value]) => ({
        name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value,
        percentage: ((value / essays.length) * 100).toFixed(1)
      }));

    // Improvement Areas
    const improvementAreas = [
      {
        category: 'Grammar',
        currentScore: Math.round(essays[0].grading.qualityScores.grammar * 100),
        averageScore: Math.round(
          essays.reduce((sum, e) => sum + e.grading.qualityScores.grammar, 0) / essays.length * 100
        ),
        trend: 'improving'
      },
      {
        category: 'Content',
        currentScore: Math.round(essays[0].grading.qualityScores.content * 100),
        averageScore: Math.round(
          essays.reduce((sum, e) => sum + e.grading.qualityScores.content, 0) / essays.length * 100
        ),
        trend: 'stable'
      },
      {
        category: 'Organization',
        currentScore: Math.round(essays[0].grading.qualityScores.organization * 100),
        averageScore: Math.round(
          essays.reduce((sum, e) => sum + e.grading.qualityScores.organization, 0) / essays.length * 100
        ),
        trend: 'improving'
      },
      {
        category: 'Style',
        currentScore: Math.round(essays[0].grading.qualityScores.style * 100),
        averageScore: Math.round(
          essays.reduce((sum, e) => sum + e.grading.qualityScores.style, 0) / essays.length * 100
        ),
        trend: 'declining'
      }
    ];

    // Time Analysis
    const timeAnalysis = essays.slice(0, 12).reverse().map(essay => ({
      month: new Date(essay.submittedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      essaysSubmitted: 1,
      averageScore: essay.grading.finalScore,
      totalWords: essay.originalText.split(' ').length
    }));

    // Aggregate by month
    const monthlyData = {};
    timeAnalysis.forEach(item => {
      if (!monthlyData[item.month]) {
        monthlyData[item.month] = { essaysSubmitted: 0, totalScore: 0, totalWords: 0 };
      }
      monthlyData[item.month].essaysSubmitted++;
      monthlyData[item.month].totalScore += item.averageScore;
      monthlyData[item.month].totalWords += item.totalWords;
    });

    const monthlyAnalysis = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      essaysSubmitted: data.essaysSubmitted,
      averageScore: Math.round(data.totalScore / data.essaysSubmitted),
      totalWords: data.totalWords
    }));

    // Summary Statistics
    const scores = essays.map(e => e.grading.finalScore);
    const wordCounts = essays.map(e => e.originalText.split(' ').length);

    const summary = {
      totalEssays: essays.length,
      averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      bestScore: Math.max(...scores),
      worstScore: Math.min(...scores),
      totalWords: wordCounts.reduce((a, b) => a + b, 0),
      averageWords: Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length),
      improvementRate: essays.length > 1 
        ? ((essays[0].grading.finalScore - essays[essays.length - 1].grading.finalScore) / essays[essays.length - 1].grading.finalScore * 100).toFixed(1)
        : 0
    };

    res.json({
      success: true,
      analytics: {
        scoreDistribution: Object.entries(scoreRanges).map(([range, data]) => ({
          range,
          ...data
        })),
        qualityTrends,
        errorCategories: errorTree,
        improvementAreas,
        timeAnalysis: monthlyAnalysis,
        categoryBreakdown: errorCategories,
        summary
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /api/analytics/writing-tips/:studentId
 * Get personalized writing tips based on student level and common errors
 */
router.get("/writing-tips", authenticateUser, async (req, res) => {
  try {
    const requestedStudentId = req.studentId;
    const authenticatedStudent = req.student;

    if (requestedStudentId !== authenticatedStudent.studentId) {
      return res.status(403).json({ 
        success: false, 
        error: "Access denied" 
      });
    }

    const student = authenticatedStudent;
    const essays = await Essay.find({ studentId: student._id })
      .sort({ submittedAt: -1 })
      .limit(10);

    // Analyze common issues
    const commonIssues = {};
    essays.forEach(essay => {
      essay.feedback?.grammarErrors?.forEach(error => {
        commonIssues[error.type] = (commonIssues[error.type] || 0) + 1;
      });
    });

    // Get top 3 issues
    const topIssues = Object.entries(commonIssues)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([type]) => type);

    // Level-based tips
    const levelTips = {
      beginner: {
        title: "Getting Started with Strong Writing",
        icon: "🌱",
        color: "blue",
        tips: [
          {
            category: "Sentence Structure",
            title: "Start with Simple Sentences",
            description: "Focus on clear subject-verb-object structure. Example: 'The student writes essays.'",
            examples: [
              "✓ The cat sat on the mat.",
              "✓ I enjoy reading books.",
              "✗ Reading books by me is enjoyed."
            ],
            difficulty: "beginner"
          },
          {
            category: "Paragraphs",
            title: "One Idea Per Paragraph",
            description: "Each paragraph should focus on a single main idea with supporting details.",
            examples: [
              "Start with a topic sentence",
              "Add 2-3 supporting details",
              "End with a concluding sentence"
            ],
            difficulty: "beginner"
          },
          {
            category: "Vocabulary",
            title: "Use Common Words Correctly",
            description: "Master everyday vocabulary before trying advanced words.",
            examples: [
              "Use: important → Critical",
              "Use: help → Assist",
              "Use: show → Demonstrate"
            ],
            difficulty: "beginner"
          }
        ]
      },
      intermediate: {
        title: "Advancing Your Writing Skills",
        icon: "🚀",
        color: "purple",
        tips: [
          {
            category: "Transitions",
            title: "Connect Your Ideas Smoothly",
            description: "Use transitional phrases to link paragraphs and sentences.",
            examples: [
              "However, Furthermore, Therefore",
              "In addition, On the other hand",
              "As a result, Consequently"
            ],
            difficulty: "intermediate"
          },
          {
            category: "Variety",
            title: "Vary Your Sentence Structure",
            description: "Mix simple, compound, and complex sentences for better flow.",
            examples: [
              "✓ Although it rained, we went hiking.",
              "✓ The meeting ended, and we left.",
              "✗ It rained. We went hiking. It was fun."
            ],
            difficulty: "intermediate"
          },
          {
            category: "Evidence",
            title: "Support Claims with Evidence",
            description: "Back up your arguments with examples, statistics, or quotes.",
            examples: [
              "According to research...",
              "For example, studies show...",
              "Evidence suggests that..."
            ],
            difficulty: "intermediate"
          }
        ]
      },
      advanced: {
        title: "Mastering Advanced Writing",
        icon: "⭐",
        color: "emerald",
        tips: [
          {
            category: "Argumentation",
            title: "Craft Compelling Arguments",
            description: "Present nuanced arguments with counterarguments and rebuttals.",
            examples: [
              "While critics argue X, evidence shows Y",
              "Although Z has merit, it overlooks...",
              "This position is strengthened by..."
            ],
            difficulty: "advanced"
          },
          {
            category: "Style",
            title: "Develop Your Voice",
            description: "Balance formal academic tone with engaging writing.",
            examples: [
              "Use active voice strategically",
              "Vary sentence rhythm",
              "Choose precise vocabulary"
            ],
            difficulty: "advanced"
          },
          {
            category: "Analysis",
            title: "Go Beyond Surface Level",
            description: "Analyze implications, causes, and broader significance.",
            examples: [
              "This suggests that...",
              "The implications extend to...",
              "At a deeper level, this reveals..."
            ],
            difficulty: "advanced"
          }
        ]
      }
    };

    // Issue-specific tips
    const issueTips = {
      subject_verb_agreement: {
        title: "Subject-Verb Agreement",
        description: "The subject and verb must agree in number (singular/plural).",
        rules: [
          "Singular subjects take singular verbs: 'The student writes'",
          "Plural subjects take plural verbs: 'The students write'",
          "Watch out for phrases between subject and verb"
        ],
        examples: [
          "✓ The book on the tables is mine.",
          "✗ The book on the tables are mine.",
          "✓ Everyone has their own opinion.",
          "✗ Everyone have their own opinion."
        ],
        practice: "Identify the main subject before choosing the verb form."
      },
      pronoun_confusion: {
        title: "Pronoun Usage",
        description: "Use the correct pronoun form and ensure clear antecedents.",
        rules: [
          "Your (possessive) vs You're (you are)",
          "Their (possessive) vs There (location) vs They're (they are)",
          "Its (possessive) vs It's (it is)"
        ],
        examples: [
          "✓ You're going to love your new book.",
          "✗ Your going to love you're new book.",
          "✓ The dog wagged its tail.",
          "✗ The dog wagged it's tail."
        ],
        practice: "Can you replace it with 'it is' or 'you are'? If not, don't use an apostrophe."
      },
      spelling: {
        title: "Spelling Accuracy",
        description: "Improve spelling through reading and practice.",
        rules: [
          "Read regularly to internalize correct spelling",
          "Use spell-check but don't rely on it completely",
          "Keep a list of commonly misspelled words"
        ],
        examples: [
          "Commonly misspelled: definitely, separate, occurred",
          "Double letters: necessary, accommodation, committee",
          "Silent letters: Wednesday, knowledge, knight"
        ],
        practice: "Write out difficult words multiple times to build muscle memory."
      }
    };

    // Build personalized tips
    const personalizedTips = [];
    
    // Add level-appropriate tips
    const levelData = levelTips[student.currentLevel] || levelTips.beginner;
    personalizedTips.push(...levelData.tips);

    // Add issue-specific tips
    topIssues.forEach(issue => {
      if (issueTips[issue]) {
        personalizedTips.push({
          category: "Common Issue",
          ...issueTips[issue],
          difficulty: "personalized",
          priority: "high"
        });
      }
    });

    // General writing tips (always included)
    const generalTips = [
      {
        category: "Planning",
        title: "Outline Before Writing",
        description: "Spend 5-10 minutes planning your essay structure before writing.",
        examples: [
          "1. Introduction with thesis",
          "2. Main points (3-5 paragraphs)",
          "3. Conclusion that restates thesis"
        ],
        difficulty: "all"
      },
      {
        category: "Revision",
        title: "Always Revise Your Work",
        description: "Take a break, then re-read your essay with fresh eyes.",
        examples: [
          "Check for clarity and coherence",
          "Remove unnecessary words",
          "Verify all grammar and spelling"
        ],
        difficulty: "all"
      },
      {
        category: "Reading",
        title: "Read More to Write Better",
        description: "Reading good writing helps you internalize proper style and grammar.",
        examples: [
          "Read articles from quality sources",
          "Notice how authors structure arguments",
          "Pay attention to vocabulary usage"
        ],
        difficulty: "all"
      }
    ];

    personalizedTips.push(...generalTips);

    res.json({
      success: true,
      writingTips: {
        studentLevel: student.currentLevel,
        levelInfo: {
          title: levelData.title,
          icon: levelData.icon,
          color: levelData.color
        },
        commonIssues: topIssues.map(issue => ({
          type: issue,
          frequency: commonIssues[issue],
          tip: issueTips[issue]
        })),
        tips: personalizedTips,
        resources: [
          {
            title: "Purdue OWL",
            description: "Comprehensive writing resources",
            url: "https://owl.purdue.edu/",
            category: "General"
          },
          {
            title: "Grammarly Blog",
            description: "Grammar tips and writing advice",
            url: "https://www.grammarly.com/blog/",
            category: "Grammar"
          },
          {
            title: "Hemingway Editor",
            description: "Make your writing bold and clear",
            url: "https://hemingwayapp.com/",
            category: "Style"
          }
        ],
        dailyPractice: {
          title: "Daily Writing Exercise",
          exercise: "Write a 200-word paragraph about your day, focusing on clear sentence structure.",
          timeEstimate: "10-15 minutes",
          goal: "Practice makes perfect!"
        }
      }
    });

  } catch (error) {
    console.error('Writing tips error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;