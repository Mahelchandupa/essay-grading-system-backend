require("dotenv").config();
const OpenAI = require("openai");

class EnhancedOpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.explanationCache = new Map();
  }

  /**
   * Generate specific, actionable feedback for scores
   */
  async generateScoreExplanation(score, qualityScores, essayText, studentLevel) {
    const prompt = `
As an experienced writing tutor, analyze this essay and provide SPECIFIC feedback explaining the ${score}% grade.

ESSAY:
"${essayText.substring(0, 1500)}"

QUALITY SCORES:
- Grammar: ${Math.round(qualityScores.grammar * 100)}%
- Content: ${Math.round(qualityScores.content * 100)}%
- Organization: ${Math.round(qualityScores.organization * 100)}%
- Style: ${Math.round(qualityScores.style * 100)}%
- Mechanics: ${Math.round(qualityScores.mechanics * 100)}%

STUDENT LEVEL: ${studentLevel}

Provide feedback in this EXACT JSON format:
{
  "scoreExplanation": {
    "overallReason": "Brief explanation of why this score was given",
    "strengths": ["Specific strength 1 from THEIR essay", "Specific strength 2"],
    "improvementAreas": ["Specific area 1 needing work", "Specific area 2"],
    "specificExamples": [
      {
        "type": "strength|weakness",
        "quote": "EXACT text from their essay",
        "explanation": "Why this is good/needs improvement",
        "suggestion": "Specific improvement suggestion"
      }
    ],
    "nextSteps": ["Actionable step 1", "Actionable step 2"]
  }
}

Be SPECIFIC - quote their actual text and explain WHY.
`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a detailed, specific writing tutor. Always quote the student's actual text and provide concrete examples."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error("Score explanation error:", error);
      return this.getFallbackExplanation(score, qualityScores, studentLevel);
    }
  }

  /**
   * Analyze argument structure with specific examples
   */
  async analyzeArgumentStructure(essayText, essayStructure) {
    const prompt = `
Analyze the argument structure of this essay and provide specific feedback.

ESSAY:
"${essayText.substring(0, 2000)}"

${essayStructure ? `DETECTED STRUCTURE: ${JSON.stringify(essayStructure)}` : ''}

Return EXACT JSON:
{
  "argumentAnalysis": {
    "thesisClarity": "clear|unclear|missing",
    "thesisStatement": "The actual thesis text or 'Not detected'",
    "evidenceQuality": "strong|moderate|weak",
    "logicalFlow": "smooth|uneven|confusing",
    "specificIssues": [
      {
        "type": "missing_evidence|weak_argument|logical_gap|repetition",
        "location": "Paragraph X or section Y",
        "quote": "The problematic text",
        "explanation": "Why this is an issue",
        "suggestion": "How to fix it"
      }
    ],
    "strengths": ["Specific strength 1", "Specific strength 2"]
  }
}
`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      return { argumentAnalysis: null };
    }
  }

  /**
   * Generate before/after examples using THEIR content
   */
  async generateContextualExamples(grammarErrors, essayText, studentLevel) {
    if (!grammarErrors.length) return [];

    const examples = grammarErrors.slice(0, 3).map(error => ({
      original: error.original,
      correction: error.correction,
      context: this.findContext(essayText, error.original)
    }));

    const prompt = `
Create helpful before/after examples for these grammar errors. Use the student's ACTUAL context.

ERRORS:
${examples.map((e, i) => `
${i + 1}. Original: "${e.original}"
    Correction: "${e.correction}"
    Context: "${e.context}"
`).join('\n')}

STUDENT LEVEL: ${studentLevel}

Return EXACT JSON:
{
  "contextualExamples": [
    {
      "original": "The exact original text",
      "corrected": "The corrected version",
      "explanation": "Level-appropriate explanation for why this change improves the writing",
      "learningTip": "A practical tip to remember this rule"
    }
  ]
}
`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(completion.choices[0].message.content);
      return result.contextualExamples || [];
    } catch (error) {
      return this.getFallbackExamples(grammarErrors, studentLevel);
    }
  }

  /**
   * Provide writing pattern analysis
   */
  async analyzeWritingPatterns(essayText) {
    const prompt = `
Analyze writing patterns in this essay and identify specific areas for improvement.

ESSAY:
"${essayText.substring(0, 1500)}"

Return EXACT JSON:
{
  "patternAnalysis": {
    "sentenceVariety": {
      "assessment": "good|needs_improvement",
      "examples": ["Repeated pattern 1", "Repeated pattern 2"],
      "suggestion": "Specific suggestion for improvement"
    },
    "wordChoice": {
      "overusedWords": ["word1:count", "word2:count"],
      "suggestions": ["Alternative 1", "Alternative 2"]
    },
    "transitionUsage": {
      "assessment": "good|needs_improvement", 
      "missingTransitions": ["transition1", "transition2"],
      "examples": ["Where to add them"]
    }
  }
}
`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      return { patternAnalysis: null };
    }
  }

  // Helper methods
  findContext(text, target, wordsAround = 10) {
    const index = text.indexOf(target);
    if (index === -1) return target;
    
    const words = text.split(/\s+/);
    const targetWords = target.split(/\s+/);
    const targetIndex = words.findIndex((w, i) => 
      words.slice(i, i + targetWords.length).join(' ') === target
    );

    if (targetIndex === -1) return target;

    const start = Math.max(0, targetIndex - wordsAround);
    const end = Math.min(words.length, targetIndex + targetWords.length + wordsAround);
    
    return words.slice(start, end).join(' ');
  }

  getFallbackExplanation(score, qualityScores, studentLevel) {
    return {
      scoreExplanation: {
        overallReason: `Your essay scored ${score}% based on writing quality assessment.`,
        strengths: ["Good effort in completing the essay"],
        improvementAreas: ["Review grammar and organization"],
        specificExamples: [],
        nextSteps: ["Practice the highlighted areas", "Read your essay aloud to catch errors"]
      }
    };
  }

  getFallbackExamples(grammarErrors, studentLevel) {
    return grammarErrors.slice(0, 3).map(error => ({
      original: error.original,
      corrected: error.correction,
      explanation: "This correction improves grammatical accuracy.",
      learningTip: "Practice this grammar rule in your writing."
    }));
  }
}

module.exports = new EnhancedOpenAIService();