// src/controller/usercontroller.js
import { findUserByEmail, findUserByPhone, createUser, updateUser, getUserById } from "../models/usermodels.js"
import dotenv from 'dotenv';
import jwt from "jsonwebtoken"

dotenv.config({ quiet: true });

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

export const login = async (req, res) => {
  try {
    const { email, phone } = req.body;
    let user = null;
    if (email) user = await findUserByEmail(email);
    if (!user && phone) user = await findUserByPhone(phone);

    if (user) {
      // existing user: return token + user data
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ ok: true, user, token, redirect: 'home' });
    }

    // not found => redirect to register
    return res.json({ ok: false, message: 'Not found', redirect: 'register' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};

export const register = async (req, res) => {
  try {
    const { email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day } = req.body;

    if (!grade_level || !selected_subjects || selected_subjects.length < 3 || !questions_per_day) {
      return res.status(400).json({ ok: false, message: 'Missing or invalid fields. Select minimum 3 subjects.' });
    }

    const user = await createUser({
      email: email,
      phone: phone,
      name: name,
      grade_level,
      selected_subjects,
      daily_reminder_time,
      questions_per_day,
      profile_photo_url: null
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({ status: true, message: 'Registered Successfully', user, token, redirect: 'home' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};

export const editProfile = async (req, res) => {
  try {
    const updates = {...req.body};
    // handle file upload -> req.fileUrl if uploaded via router middleware
    if (req.fileUrl) updates.profile_photo_url = req.fileUrl;
    const updated = await updateUser(req.userId, updates);
    res.json({ ok: true, user: updated });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};
