require("dotenv").config();
const OpenAI = require("openai");

class AdaptiveExplanationGenerator {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.cache = new Map();
  }

  /**
   * ✅ Generate explanation tailored to student level
   */
  async generateLeveledExplanation(error, studentLevel, essayContext = "") {
    // Validate inputs
    if (!error || !error.original || !error.correction) {
      console.warn("⚠️ Invalid error object provided to explanation generator");
      return this.getFallbackExplanation(error, studentLevel);
    }

    const cacheKey = `${error.original}-${error.correction}-${studentLevel}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const prompt = this.buildPromptForLevel(
        error,
        studentLevel,
        essayContext
      );

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: this.getSystemPrompt(studentLevel),
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens:
          studentLevel === "beginner"
            ? 300
            : studentLevel === "intermediate"
            ? 150
            : 100,
      });

      const explanation = completion.choices[0].message.content;

      // Cache the result
      this.cache.set(cacheKey, explanation);
      if (this.cache.size > 500) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      return explanation;
    } catch (error) {
      console.error(
        "❌ Adaptive explanation generation failed:",
        error.message
      );
      return this.getFallbackExplanation(error, studentLevel);
    }
  }

  /**
   * ✅ Build prompt based on student level
   */
  buildPromptForLevel(error, studentLevel, essayContext) {
    const base = `Original: "${error.original}"\nCorrected: "${
      error.correction
    }"\nError Type: ${error.type || "grammar"}\nReason: ${
      error.reason || "grammar improvement"
    }`;

    if (studentLevel === "beginner") {
      return `${base}

Please explain this grammar error to a beginner student. Include:
1. What the error is (simple terms)
2. Why it's wrong (explain the rule clearly)
3. How to remember this rule (memory tip)
4. How to avoid this mistake in future essays
5. 2-3 simple examples

Keep language simple and encouraging.`;
    }

    if (studentLevel === "intermediate") {
      return `${base}

Explain this grammar error to an intermediate student. Include:
1. The grammatical issue
2. The rule briefly
3. 1-2 examples

Be concise but clear.`;
    }

    // Advanced
    return `${base}

Provide a brief explanation for an advanced student:
1. The grammatical principle
2. One example if needed

Be very concise - they understand grammar well.`;
  }

  /**
   * ✅ System prompts for each level
   */
  getSystemPrompt(studentLevel) {
    const prompts = {
      beginner: `You are a patient, encouraging English tutor for beginner students. 
Explain grammar errors clearly and simply. Use:
- Simple vocabulary
- Step-by-step explanations
- Encouraging tone
- Practical memory tips
- Clear examples

Format:
**What's Wrong:** [Simple explanation]

**Why This Matters:** [Easy-to-understand reason]

**The Rule:** [Clear rule in simple terms]

**Memory Tip:** [Something to help remember]

**How to Avoid:** [Practical advice for future writing]

**Examples:**
1. ❌ [wrong] → ✅ [correct]
2. ❌ [wrong] → ✅ [correct]

Remember: Be encouraging! Learning takes time.`,

      intermediate: `You are an English tutor for intermediate students.
Provide clear, focused explanations without being too basic.

Format:
**Issue:** [Clear explanation]

**Rule:** [The grammatical rule]

**Examples:**
1. ❌ [wrong] → ✅ [correct]
2. ❌ [wrong] → ✅ [correct]`,

      advanced: `You are an English tutor for advanced students.
Provide concise, technical explanations.

Format:
**Issue:** [Brief, precise explanation]

**Example:** ❌ [wrong] → ✅ [correct] (if needed)

Keep it short - they understand grammar.`,
    };

    return prompts[studentLevel] || prompts.intermediate;
  }

  /**
   * ✅ Fallback explanations (if OpenAI fails)
   */
  getFallbackExplanation(error, studentLevel) {
    const templates = {
      beginner: `**What's Wrong:** ${
        error.reason || "Grammar improvement needed"
      }

**The Rule:** This is a common grammar rule that helps make your writing clearer.

**In Your Essay:**
❌ "${error.original}"
✅ "${error.correction}"

**Memory Tip:** Practice this correction in your next essay!

**How to Avoid:** Read your sentence out loud. Does it sound right?`,

      intermediate: `**Issue:** ${error.reason || "Grammar improvement needed"}

**In Your Essay:**
❌ "${error.original}"
✅ "${error.correction}"

**Rule:** ${(error.type || "grammar").replace(
        /_/g,
        " "
      )} - pay attention to this in your writing.`,

      advanced: `**Issue:** ${error.reason || "Grammar improvement needed"}

❌ "${error.original}" → ✅ "${error.correction}"`,
    };

    return templates[studentLevel] || templates.intermediate;
  }

  /**
   * ✅ Batch generate explanations for multiple errors
   */
  async generateBatchExplanations(errors, studentLevel, essayContext = "") {
    if (!errors || !Array.isArray(errors) || errors.length === 0) {
      return [];
    }

    const explanations = [];

    // Process in parallel but limit concurrency
    const batchSize = 3; // Reduced for stability
    for (let i = 0; i < errors.length; i += batchSize) {
      const batch = errors.slice(i, i + batchSize);
      const batchPromises = batch.map((error) =>
        this.generateLeveledExplanation(
          error,
          studentLevel,
          essayContext
        ).catch((err) => {
          console.error("❌ Error generating explanation:", err.message);
          return this.getFallbackExplanation(error, studentLevel);
        })
      );

      const batchResults = await Promise.all(batchPromises);
      explanations.push(...batchResults);
    }

    return explanations;
  }
}

module.exports = AdaptiveExplanationGenerator;
