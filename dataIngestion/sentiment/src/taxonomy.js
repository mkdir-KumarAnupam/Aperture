/**
 * ============================================================================
 * JEV TAXONOMY & CLASSIFICATION SCHEMAS
 * ============================================================================
 *
 * This module defines the evaluation categories and semantic descriptions 
 * consumed by the TypeSafe AI (JEV SystemOne) decision model.
 *
 * Architecture Notes:
 * -------------------
 * - In JEV SystemOne, discrete question options can either be plain strings
 *   or maps of { "label": "description" }. Providing concise, distinct
 *   descriptions significantly improves classification accuracy and eliminates
 *   semantic ambiguity.
 * - Continuous affect/emotion attributes use binary "noul" questions which
 *   return calibrated probabilities between 0.0 and 1.0.
 *
 * ============================================================================
 */

export const TAXONOMY = {
  /**
   * Overall Sentiment Taxonomy
   * 
   * Passed into JEV's `choice()` question to classify the dominant tone 
   * of the entire batch of social posts.
   */
  sentiment: {
    "positive": "Displays a positive, optimistic, enthusiastic, or approving emotional tone",
    "negative": "Displays a negative, critical, pessimistic, or disapproving emotional tone",
    "neutral": "Displays an objective, factual, journalistic, or informative tone without personal emotional charge, even if reporting on conflicts or regulatory matters",
    "mixed": "Displays conflicting emotional tones, containing substantial amounts of both positive and negative sentiment"
  },

  /**
   * Narrative Stance Taxonomy
   * 
   * Evaluates the collective posture or stance of the discussion batch 
   * toward a specific narrative statement.
   */
  stance: {
    "support": "Advocates for, praises, endorses, or promotes the narrative claim or policy",
    "oppose": "Criticizes, condemns, rejects, or argues against the narrative claim or policy",
    "neutral": "Expresses an explicitly balanced, detached, or non-committal observation",
    "discussing": "Reports on, shares information, or debates the topic without personally endorsing or condemning it"
  },

  /**
   * Continuous Affect & Emotional Dimensions
   * 
   * Looped through in Phase 1 to construct individual `noul()` questions:
   * e.g., questions[`affect_${emotion}`] = noul(`Is there a tone of ${emotion}?`)
   *
   * Each returns a raw floating-point score (0.0 to 1.0) representing intensity.
   */
  affect: [
    "anger",       // Frustration, hostility, resentment, or rage
    "fear",        // Trepidation, dread, concern for safety, or vulnerability
    "joy",         // Happiness, celebration, amusement, or satisfaction
    "sadness",     // Sorrow, disappointment, melancholy, or grief
    "anxiety",     // Unease, nervous anticipation, worry, or distress
    "excitement",  // Anticipation, eagerness, thrill, or high-energy engagement
    "outrage",     // Moral indignation, severe condemnation, or righteous anger
    "hope"         // Optimism, aspiration, faith in future improvement, or relief
  ]
};
