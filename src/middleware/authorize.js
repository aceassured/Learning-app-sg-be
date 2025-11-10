// middlewares/authorize.js
export const authorize = (action, subjectType) => (req, res, next) => {
  if (req.ability?.can(action, subjectType)) return next();
  return res.status(403).json({ status: false, message: 'Forbidden' });
};
