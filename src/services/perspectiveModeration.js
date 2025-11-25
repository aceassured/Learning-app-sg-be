// services/perspectiveModeration.js - FIXED VERSION
import dotenv from "dotenv"
dotenv.config({quiet:true});

class PerspectiveModeration {
  constructor() {
    this.apiKey = process.env.PERSPECTIVE_API_KEY;
    this.baseUrl = 'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze';
  }

  async analyzeText(text, options = {}) {
    try {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return this.createSafeResult();
      }

      // Clean the text
      const cleanText = text.trim().substring(0, 3000);

      const requestBody = {
        comment: {
          text: cleanText,
          type: 'PLAIN_TEXT'
        },
        requestedAttributes: {
          TOXICITY: {},
          SEVERE_TOXICITY: {},
          IDENTITY_ATTACK: {},
          INSULT: {},
          PROFANITY: {},
          THREAT: {}
        },
        languages: ['en'],
        doNotStore: true
      };

      console.log('Sending to Perspective API:', cleanText);

      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Perspective API HTTP Error:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('Perspective API Success - Raw data:', JSON.stringify(data, null, 2));
      
      return this.processResponse(data);

    } catch (error) {
      console.error('Perspective API Catch Error:', error.message);
      return this.createErrorResult(error.message);
    }
  }

  processResponse(data) {
    // Check if attributeScores exists
    if (!data.attributeScores) {
      console.error('No attributeScores in response:', data);
      return this.createErrorResult('Invalid response from Perspective API');
    }

    const attributes = data.attributeScores;
    const scores = {};

    // Extract scores for each attribute safely
    Object.keys(attributes).forEach(attr => {
      if (attributes[attr] && attributes[attr].summaryScore) {
        scores[attr] = attributes[attr].summaryScore.value;
      } else {
        scores[attr] = 0; // Default to 0 if missing
      }
    });

    console.log('Processed scores:', scores);

    // Determine if content is safe (adjust thresholds as needed)
    const toxic = scores.TOXICITY > 0.7;
    const severeToxic = scores.SEVERE_TOXICITY > 0.7;
    const insult = scores.INSULT > 0.7;
    const profanity = scores.PROFANITY > 0.7;
    const threat = scores.THREAT > 0.7;
    const identityAttack = scores.IDENTITY_ATTACK > 0.7;

    const flagged = toxic || severeToxic || insult || profanity || threat || identityAttack;

    const result = {
      safe: !flagged,
      flagged: flagged,
      scores: scores,
      method: 'perspective',
      confidence: 'high',
      attributes: {
        toxic: toxic,
        severeToxic: severeToxic,
        insult: insult,
        profanity: profanity,
        threat: threat,
        identityAttack: identityAttack
      },
      summary: this.generateSummary(scores)
    };

    console.log('Final moderation result:', result);
    return result;
  }

  generateSummary(scores) {
    const issues = [];
    if (scores.TOXICITY > 0.7) issues.push('toxicity');
    if (scores.SEVERE_TOXICITY > 0.7) issues.push('severe toxicity');
    if (scores.INSULT > 0.7) issues.push('insults');
    if (scores.PROFANITY > 0.7) issues.push('profanity');
    if (scores.THREAT > 0.7) issues.push('threats');
    if (scores.IDENTITY_ATTACK > 0.7) issues.push('identity attack');

    return issues.length > 0 ? `Detected: ${issues.join(', ')}` : 'No issues detected';
  }

  createSafeResult() {
    return {
      safe: true,
      flagged: false,
      scores: {},
      method: 'perspective',
      confidence: 'high'
    };
  }

  createErrorResult(errorMessage) {
    return {
      safe: false,
      flagged: true,
      error: true,
      errorMessage: errorMessage,
      method: 'perspective-error',
      confidence: 'low',
      needsHumanReview: true
    };
  }

  async moderateContent(text) {
    return this.analyzeText(text);
  }
}

export default new PerspectiveModeration();