export async function sendPasswordResetEmail(email: string, token: string) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  // TODO: wire up Resend or Nodemailer here
  console.log(`\n========================================`);
  console.log(`Password reset requested for: ${email}`);
  console.log(`Reset URL: ${resetUrl}`);
  console.log(`========================================\n`);
}
