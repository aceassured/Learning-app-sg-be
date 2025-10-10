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


--new updates

-- Enum for challenge purpose
CREATE TYPE challenge_purpose AS ENUM ('register', 'login');


-- Table to store WebAuthn credentials per user
CREATE TABLE webauthn_credentials (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  credential_id TEXT UNIQUE NOT NULL,   -- base64url from client
  public_key TEXT NOT NULL,            -- COSE-encoded public key
  counter INT DEFAULT 0,
  transports TEXT[] DEFAULT '{}',       -- e.g. ["internal"]
  backup_eligible BOOLEAN DEFAULT FALSE,
  backup_state BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Index for faster lookup by user
CREATE INDEX idx_webauthn_credentials_user ON webauthn_credentials(user_id);


-- Table to store short-lived challenges
CREATE TABLE webauthn_challenges (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,

  purpose challenge_purpose NOT NULL,   -- enum instead of text
  challenge TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,

  created_at TIMESTAMP DEFAULT now()
);

-- new updates
-- Indexes for fast lookups
CREATE INDEX idx_webauthn_challenges_user_purpose 
    ON webauthn_challenges(user_id, purpose);

CREATE INDEX idx_webauthn_challenges_expires 
    ON webauthn_challenges(expires_at);




CREATE TABLE user_question_status (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  question_id INT REFERENCES questions(id) ON DELETE CASCADE,
  status question_status DEFAULT 'not_visited'
);

CREATE TYPE question_status AS ENUM (
  'not_visited',
  'not_answered',
  'answered',
  'marked_for_review',
  'answered_and_marked_for_review'
);



-- quizzes: store quiz definitions per day or question bank
CREATE TABLE questions (
  id SERIAL PRIMARY KEY,
  subject TEXT,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- e.g. [{id:1,text:'A'},{id:2,text:'B'}]
  correct_option_id INT,
  question_type TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- quiz sessions (each time user starts quiz)
CREATE TABLE user_quiz_sessions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  started_at TIMESTAMP DEFAULT now(),
  finished_at TIMESTAMP,
  allowed_duration_seconds INT DEFAULT 300,wa
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



CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    subject TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE topics (
    id SERIAL PRIMARY KEY,
    grade_level TEXT,
    subject_id INT NOT NULL,
    topic TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_subject
      FOREIGN KEY (subject_id)
      REFERENCES subjects(id)
      ON DELETE CASCADE
);


CREATE TABLE polls (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  allow_multiple BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE poll_options (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL
);

CREATE TABLE poll_votes (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
  option_id INTEGER REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(poll_id, user_id, option_id) -- prevents duplicate same option votes
);

CREATE TABLE announcements (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  active BOOLEAN DEFAULT TRUE
);


CREATE INDEX idx_posts_created_at ON forum_posts(created_at DESC);
CREATE INDEX idx_polls_post_id ON polls(post_id);
CREATE INDEX idx_poll_options_poll_id ON poll_options(poll_id);
CREATE INDEX idx_votes_poll_user ON poll_votes(poll_id, user_id);