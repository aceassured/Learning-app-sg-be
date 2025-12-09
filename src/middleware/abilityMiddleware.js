// middlewares/abilityMiddleware.js
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { defineAbilitiesFor } from '../auth/abilities.js';

dotenv.config({ quiet: true });

const JWT_SECRET = process.env.JWT_SECRET

export const attachUserAndAbility = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ status: false, message: 'Unauthorized' });
    }
    const decoded = jwt.verify(token, JWT_SECRET); 
    req.user = decoded;
    req.ability = defineAbilitiesFor(decoded);
    next();
  } catch (e) {
    return res.status(401).json({ status: false, message: 'Invalid token' });
  }
};
