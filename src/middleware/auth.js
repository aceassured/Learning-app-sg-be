// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

export default (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ ok:false, message: 'Unauthorized' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ ok:false, message: 'Invalid token' });
  }
};
