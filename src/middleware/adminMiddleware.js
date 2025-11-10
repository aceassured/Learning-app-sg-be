import { body, validationResult } from "express-validator";

export const commonLoginValidation = [

    body('email').trim().isLength({ min: 1 }).withMessage('Username or Email is required'),
    body('password').trim().isLength({ min: 1 }).withMessage('Password is required'),

    async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ status: 'error', errors: errors.array() });
            }
            next();
        } catch (error) {
            console.error('Error in common login validation middleware:', error);
            res.status(500).json({ status: "error", message: "Internal server error" });
        }
    }
];