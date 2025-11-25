// services/hybridModeration.js - FIXED
import perspectiveModeration from './perspectiveModeration.js';

class HybridModeration {
  async moderateContent(content, options = {}) {
    const {
      usePerspective = true,
      strictMode = true
    } = options;

    console.log('=== MODERATION START ===');
    console.log('Content:', content);

    if (usePerspective) {
      try {
        console.log('Calling Perspective API...');
        const perspectiveResult = await perspectiveModeration.moderateContent(content);
        
        console.log('Perspective API Raw Result:', perspectiveResult);

        // If Perspective API worked (even with error), use its result
        if (perspectiveResult.method !== 'perspective-error') {
          console.log('Using Perspective API result');
          return {
            safe: perspectiveResult.safe,
            method: 'perspective',
            confidence: 'high',
            scores: perspectiveResult.scores,
            attributes: perspectiveResult.attributes,
            summary: perspectiveResult.summary,
            needsHumanReview: perspectiveResult.flagged
          };
        } else {
          console.log('Perspective API returned error, using fallback');
        }
        
      } catch (error) {
        console.error('Perspective moderation completely failed:', error.message);
      }
    }

    // Fallback: For debugging, let's see what happens
    console.log('Using fallback moderation');
    const fallbackResult = {
      safe: false, // Be strict in fallback
      method: 'fallback',
      confidence: 'low',
      needsHumanReview: true,
      message: 'Content requires manual review - moderation system issue'
    };
    
    console.log('Fallback result:', fallbackResult);
    return fallbackResult;
  }
}

export default new HybridModeration();