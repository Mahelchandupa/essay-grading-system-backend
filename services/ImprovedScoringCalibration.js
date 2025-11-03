class ImprovedScoringCalibration {
  constructor() {
    this.baseCalibration = -0.01; // Minimal base adjustment
  }

  /**
   * Context-aware score calibration
   */
  calculateFinalScore(
    qualityScores,
    rawScore,
    ocrConfidence,
    feedback,
    wordCount,
    essayStructure,
    studentLevel
  ) {
    const grammarErrorCount = feedback.grammarErrors?.length || 0;
    const spellingErrorCount = feedback.spellingErrors?.length || 0;

    console.log(
      `📊 SEPARATED Error Analysis: Grammar=${grammarErrorCount}, Spelling=${spellingErrorCount}`
    );

    // ✅ MORE ACCURATE QUALITY SCORE ADJUSTMENT
    let adjustedScores = { ...qualityScores };

    // Calculate error density separately
    const grammarDensity = grammarErrorCount / (wordCount / 100);
    const spellingDensity = spellingErrorCount / (wordCount / 100);

    // Grammar penalties (more impactful)
    if (grammarDensity > 5) {
      adjustedScores.grammar = Math.max(0.4, adjustedScores.grammar - 0.2);
    } else if (grammarDensity > 3) {
      adjustedScores.grammar = Math.max(0.5, adjustedScores.grammar - 0.1);
    } else if (grammarDensity > 1) {
      adjustedScores.grammar = Math.max(0.6, adjustedScores.grammar - 0.05);
    }

    // Spelling penalties (less impactful)
    if (spellingDensity > 5) {
      adjustedScores.mechanics = Math.max(0.5, adjustedScores.mechanics - 0.1);
    } else if (spellingDensity > 3) {
      adjustedScores.mechanics = Math.max(0.6, adjustedScores.mechanics - 0.05);
    }

    // Calculate average from ADJUSTED scores
    const avgQuality =
      (adjustedScores.grammar +
        adjustedScores.content +
        adjustedScores.organization +
        adjustedScores.style +
        adjustedScores.mechanics) /
      5;

    let finalScore = this.mapQualityToScore(avgQuality);

    // ✅ SEPARATED PENALTIES
    let penalty = 0;

    // Grammar penalties (more severe)
    if (grammarErrorCount > 10) penalty += 15;
    else if (grammarErrorCount > 5) penalty += 8;
    else if (grammarErrorCount > 2) penalty += 3;

    // Spelling penalties (less severe)
    if (spellingErrorCount > 8) penalty += 6;
    else if (spellingErrorCount > 5) penalty += 4;
    else if (spellingErrorCount > 2) penalty += 2;

    // Structure bonus for having clear sections
    if (
      essayStructure &&
      essayStructure.sections &&
      essayStructure.sections.length >= 2
    ) {
      penalty -= 3; // Reward good structure
    }

    // Word count consideration
    if (wordCount > 250) {
      penalty -= 2; // Reward adequate length
    }

    finalScore = Math.max(45, finalScore - penalty);

    console.log(
      `🎯 Final Score: ${finalScore}/100 (Quality: ${avgQuality.toFixed(
        2
      )}, Penalty: -${penalty})`
    );

    return {
      score: Math.round(finalScore),
      uncertaintyRange: this.calculateUncertainty(ocrConfidence),
      adjustedQualityScores: adjustedScores,
    };
  }

  /**
   * Filter out false positive grammar errors (works with old SpellingChecker format)
   */
  filterRealGrammarErrors(errors) {
    if (!errors || errors.length === 0) return [];

    return errors.filter((error) => {
      // Remove low confidence errors
      if (error.confidence && error.confidence < 0.75) return false;

      // ✅ NEW: Filter nonsensical corrections
      if (error.word && error.correction) {
        const word = error.word.toLowerCase();
        const correction = error.correction.toLowerCase();

        // Filter garbage corrections like "many → student", "media → was"
        const nonsensicalPairs = [
          ["many", "student"],
          ["many", "teen"],
          ["media", "was"],
          ["several", "problem"],
          ["many", "opportunitie"],
        ];

        for (const [w, c] of nonsensicalPairs) {
          if (word === w && correction === c) {
            console.log(
              `   ✅ Filtered nonsensical: "${word}" → "${correction}"`
            );
            return false;
          }
        }
      }

      // Remove obvious false positives
      const falsePositivePatterns = [
        /pictures? are/i, // "pictures are" is correct
        /others? argue/i, // "others argue" is correct
        /them are/i, // "of them are" is correct
        /media (has|have)/i, // "social media has" variations
      ];

      if (error.original) {
        for (const pattern of falsePositivePatterns) {
          if (pattern.test(error.original)) {
            console.log(`   ✅ Filtered false positive: "${error.original}"`);
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Filter out false positive spelling errors
   */
  filterRealSpellingErrors(errors) {
    return errors.filter((error) => {
      // Keep only high confidence
      if (error.confidence && error.confidence < 0.7) return false;

      // Skip very short words
      if (error.word && error.word.length < 4) return false;

      // Skip proper nouns
      if (error.word && error.word[0] === error.word[0].toUpperCase()) {
        return false;
      }

      return true;
    });
  }

  /**
   * Grammar calibration
   */
  calibrateGrammar(score, errorCount, wordCount) {
    console.log(
      `📝 Grammar calibration: score=${score}, errors=${errorCount}, words=${wordCount}`
    );

    // MAJOR BOOST for zero grammar errors
    if (errorCount === 0) {
      console.log(`   ✅ PERFECT GRAMMAR - Major boost applied`);
      return Math.min(0.95, score + 0.35); // Big boost for perfect grammar
    }

    // Minimal penalty for few errors
    const errorRate = errorCount / (wordCount / 100);

    if (errorRate <= 0.5) {
      return Math.max(0.7, score - 0.05); // Tiny penalty
    } else if (errorRate <= 1.0) {
      return Math.max(0.65, score - 0.1); // Small penalty
    }

    return Math.max(0.5, score - 0.15);
  }

  /**
   * Content calibration
   */
  calibrateContent(score) {
    // Very minimal adjustment
    return Math.max(0.55, Math.min(0.95, score - 0.01));
  }

  /**
   * Organization calibration
   */
  calibrateOrganization(
    score,
    wordCount,
    ocrConfidence,
    essayStructure = null
  ) {
    let calibrated = score;

    // Use structure if available
    if (
      essayStructure &&
      essayStructure.sections &&
      essayStructure.sections.length > 0
    ) {
      const hasProperSections = essayStructure.sections.length >= 2;
      const hasParagraphs =
        essayStructure.paragraphs && essayStructure.paragraphs.length >= 3;

      if (hasProperSections && hasParagraphs) {
        console.log("✅ Good structure detected - minimal penalty");
        calibrated -= 0.01; // Minimal penalty for good structure
        return Math.max(0.6, Math.min(0.95, calibrated));
      }
    }

    // Only penalize if actually poor
    if (score < 0.5) {
      if (wordCount < 200) {
        calibrated -= 0.03;
      } else if (wordCount < 300) {
        calibrated -= 0.05;
      } else {
        calibrated -= 0.08;
      }
    } else {
      calibrated -= 0.01;
    }

    // OCR PROTECTION
    if (ocrConfidence < 95) {
      calibrated += 0.02;
    }

    return Math.max(0.5, Math.min(0.95, calibrated));
  }

  /**
   * Style calibration
   */
  calibrateStyle(score, spellingErrors) {
    let calibrated = score;

    // Minimal base penalty
    if (spellingErrors === 0) {
      return Math.max(0.55, Math.min(0.95, calibrated)); // No penalty
    }

    calibrated -= 0.01;

    // Minor penalty for many spelling errors (affects style)
    if (spellingErrors > 10) {
      calibrated -= 0.03;
    }

    return Math.max(0.5, Math.min(0.95, calibrated));
  }

  /**
   * Mechanics calibration
   */
  calibrateMechanics(score, spellingErrors, wordCount) {
    let calibrated = score;

    // NO penalty if no errors
    if (spellingErrors === 0) {
      return Math.max(0.6, Math.min(0.95, calibrated));
    }

    // Error rate per 100 words
    const errorRate = spellingErrors / (wordCount / 100);

    if (errorRate > 5) {
      calibrated -= 0.06;
    } else if (errorRate > 2) {
      calibrated -= 0.03;
    } else if (errorRate > 1) {
      calibrated -= 0.01;
    }

    return Math.max(0.5, Math.min(0.95, calibrated));
  }

  /**
   * More generous quality-to-score mapping
   */
  // mapQualityToScore(avgQuality) {
  //   // MORE GENEROUS mapping
  //   if (avgQuality >= 0.85) {
  //     return 92 + (avgQuality - 0.85) * 40; // 92-98 range
  //   } else if (avgQuality >= 0.75) {
  //     return 85 + (avgQuality - 0.75) * 70; // 85-92 range
  //   } else if (avgQuality >= 0.65) {
  //     return 78 + (avgQuality - 0.65) * 70; // 78-85 range (was 72-82)
  //   } else if (avgQuality >= 0.55) {
  //     return 68 + (avgQuality - 0.55) * 100; // 68-78 range
  //   } else if (avgQuality >= 0.45) {
  //     return 55 + (avgQuality - 0.45) * 130; // 55-68 range
  //   } else {
  //     return 40 + avgQuality * 40; // 40-55 range
  //   }
  // }

  // mapQualityToScore(avgQuality) {
  //   // More generous mapping that reflects actual writing quality
  //   if (avgQuality >= 0.85) return 90;
  //   if (avgQuality >= 0.8) return 85;
  //   if (avgQuality >= 0.75) return 80;
  //   if (avgQuality >= 0.7) return 75;
  //   if (avgQuality >= 0.65) return 70;
  //   if (avgQuality >= 0.6) return 65;
  //   if (avgQuality >= 0.55) return 60;
  //   if (avgQuality >= 0.5) return 55;
  //   if (avgQuality >= 0.45) return 50;
  //   return 45;
  // }

  /**
 * Proper score mapping from Python raw score (0-12) to final score (0-100)
 */
mapQualityToScore(avgQuality, rawScoreFromPython = null) {
  // If we have a Python raw score, use it directly with proper mapping
  if (rawScoreFromPython !== null) {
    // Python raw score is typically 3.5-12.0, map to 0-100
    const mappedScore = ((rawScoreFromPython - 3.5) / (12.0 - 3.5)) * 100;
    return Math.max(0, Math.min(100, mappedScore));
  }

  // Fallback to quality-based mapping
  if (avgQuality >= 0.85) return 90;
  if (avgQuality >= 0.8) return 85;
  if (avgQuality >= 0.75) return 80;
  if (avgQuality >= 0.7) return 75;
  if (avgQuality >= 0.65) return 70;
  if (avgQuality >= 0.6) return 65;
  if (avgQuality >= 0.55) return 60;
  if (avgQuality >= 0.5) return 55;
  if (avgQuality >= 0.45) return 50;
  return 45;
}

  /**
   * VERY GENTLE penalties
   */
  calculatePenalties(
    grammarErrors,
    spellingErrors,
    orgScore,
    wordCount,
    ocrConfidence
  ) {
    let penalty = 0;
    const ocrMultiplier = ocrConfidence < 95 ? 0.5 : 1.0;

    // NO penalties if no errors!
    if (grammarErrors === 0 && spellingErrors === 0) {
      return 0; // Perfect!
    }

    // Grammar penalty (scaled)
    if (grammarErrors > 8) {
      penalty += 2; // Reduced from 3
    } else if (grammarErrors > 4) {
      penalty += 1; // Reduced from 2
    }
    // NO penalty for <= 4 errors

    // Spelling penalty (very gentle)
    if (spellingErrors > 15) {
      penalty += 1 * ocrMultiplier; // Reduced from 2
    }
    // NO penalty for <= 15 spelling errors

    // Organization penalty (context-aware)
    if (orgScore < 0.5 && wordCount >= 300) {
      penalty += 2; // Reduced from 3
    } else if (orgScore < 0.6 && wordCount >= 250) {
      penalty += 1; // Reduced from 2
    }

    return penalty;
  }

  /**
   * Calculate uncertainty range
   */
  calculateUncertainty(ocrConfidence) {
    if (ocrConfidence >= 95) return 2;
    if (ocrConfidence >= 90) return 3;
    if (ocrConfidence >= 85) return 5;
    return Math.ceil(((100 - ocrConfidence) / 100) * 10);
  }

  /**
   * Calculate grade based on the provided grading scale
   */
  // calculateGrade(score) {
  //   if (score >= 85) return "A+";
  //   if (score >= 75) return "A";
  //   if (score >= 70) return "A-";
  //   if (score >= 65) return "B+";
  //   if (score >= 60) return "B";
  //   if (score >= 55) return "B-";
  //   if (score >= 50) return "C+";
  //   if (score >= 45) return "C";
  //   if (score >= 40) return "C-";
  //   if (score >= 35) return "D+";
  //   return "F";
  // }

  calculateGrade(score) {
    if (score >= 93) return "A";
    if (score >= 90) return "A-";
    if (score >= 87) return "B+";
    if (score >= 83) return "B";
    if (score >= 80) return "B-";
    if (score >= 77) return "C+";
    if (score >= 73) return "C";
    if (score >= 70) return "C-";
    if (score >= 67) return "D+";
    if (score >= 63) return "D";
    if (score >= 60) return "D-";
    return "F";
  }
}

module.exports = ImprovedScoringCalibration;
