import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: '98147c001@smtp-brevo.com', // SMTP login
    pass: 'k7MSaTgdtFz41GL9',        // SMTP key / master password
  },
});

const mailOptions = {
  from: '"Jayaprakash" <jayaprakash@aceassured.com>',
  to: 'kalimuthu@aceassured.com',
  subject: 'Test Email via SMTP',
  html: '<p>Hello! This is a test email via SMTP.</p>',
};

transporter.sendMail(mailOptions, (err, info) => {
  if (err) return console.error(err);
  console.log('Email sent:', info.response);
});
