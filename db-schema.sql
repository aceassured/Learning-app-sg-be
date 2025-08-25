-- users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  name TEXT,
  school_name TEXT,
  grade_level INT,
  questions_per_day INT,
  daily_reminder_time TIME,
  selected_subjects TEXT[], -- array of subject codes/names
  profile_photo_url TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- quizzes: store quiz definitions per day or question bank
CREATE TABLE questions (
  id SERIAL PRIMARY KEY,
  subject TEXT,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- e.g. [{id:1,text:'A'},{id:2,text:'B'}]
  correct_option_id INT,
  created_at TIMESTAMP DEFAULT now()
);

-- quiz sessions (each time user starts quiz)
CREATE TABLE user_quiz_sessions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  started_at TIMESTAMP DEFAULT now(),
  finished_at TIMESTAMP,
  allowed_duration_seconds INT DEFAULT 300,
  total_questions INT,
  score INT DEFAULT 0
);

-- user answers per session
CREATE TABLE user_answers (
  id SERIAL PRIMARY KEY,
  session_id INT REFERENCES user_quiz_sessions(id) ON DELETE CASCADE,
  question_id INT REFERENCES questions(id),
  selected_option_id INT,
  is_correct BOOLEAN,
  answered_at TIMESTAMP DEFAULT now()
);

-- forum posts
CREATE TABLE forum_posts (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  grade_level TEXT,
  content TEXT,
  subject_tag TEXT,
  type_of_upload TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- uploaded files for forum posts
CREATE TABLE forum_files (
  id SERIAL PRIMARY KEY,
  post_id INT REFERENCES forum_posts(id) ON DELETE CASCADE,
  url TEXT,
  filename TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- activity tracking for progress graphs
CREATE TABLE user_activity (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  activity_date DATE,
  correct_count INT DEFAULT 0,
  incorrect_count INT DEFAULT 0
);

-- settings (per user)
CREATE TABLE user_settings (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) UNIQUE,
  questions_per_day INT,
  quiz_time_seconds INT,
  daily_reminder_time TIME,
  reminder_enabled BOOLEAN DEFAULT true,
  dark_mode BOOLEAN DEFAULT false,
  sound_enabled BOOLEAN DEFAULT true
);


-- forum likes........

CREATE TABLE forum_likes (
  id SERIAL PRIMARY KEY,
  post_id INT REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (post_id, user_id) -- prevent duplicate likes
);

-- forum comments....

CREATE TABLE forum_comments (
  id SERIAL PRIMARY KEY,
  post_id INT REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
