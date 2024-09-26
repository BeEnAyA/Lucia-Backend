import sgMail from '@sendgrid/mail';
import 'dotenv/config';

// Define an interface for the email options
export interface EmailOptions {
    to: string;            // Recipient's email address
    subject: string;       // Email subject line
    content: string;       // Email body content
    from?: string;         // Optional sender's email address, defaults to a configured value
}

const DEFAULT_FROM_EMAIL = 'bt.binaya@gmail.com'; // Replace with your default sender email

// Initialize SendGrid with the API key from environment variables
sgMail.setApiKey(process.env.SENDGRID_API_KEY as string);

export const sendEmail = async (emailOptions: EmailOptions): Promise<void> => {
    try {
        const { to, subject, content, from = DEFAULT_FROM_EMAIL } = emailOptions;

        const msg = {
            to,
            from,
            subject,
            text: content,
        };

        await sgMail.send(msg);
        console.log(`Email sent successfully to ${to}`);
    } catch (error: any) {
        console.error('Error sending email:', error);
        throw new Error(`Failed to send email to ${emailOptions.to}: ${error.message}`);
    }
};