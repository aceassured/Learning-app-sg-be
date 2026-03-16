import { SendMailClient } from "zeptomail";
import dotenv from "dotenv";

dotenv.config();

const url = "https://api.zeptomail.in/v1.1/email";

const client = new SendMailClient({
  url,
  token: process.env.ZEPTO_MAIL_TOKEN
});

export const sendMail = async ({ to, subject, html }) => {
  try {

    const response = await client.sendMail({
      from: {
        address: process.env.ZEPTO_FROM_EMAIL,
        name: "AceHive"
      },
      to: [
        {
          email_address: {
            address: to
          }
        }
      ],
      subject: subject,
      htmlbody: html
    });

    console.log("Email sent successfully");

    return response;

  } catch (error) {

    console.error("Email sending failed:", error);
    throw error;

  }
};