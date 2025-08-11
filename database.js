import pg from 'pg';
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const pool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME, 
  password: process.env.DB_PASSWORD, 
  port: process.env.DB_PORT, 
  ssl: {
    rejectUnauthorized: false, 
  }
});


pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

pool.connect((err, client, done) => {
  if (err) {
    console.error('Error acquiring client from pool', err);
    return;
  }

  console.log('Railway database is connected...🏹');

  done();
});

export default pool;