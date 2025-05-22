// Setup type definitions for built-in Supabase Runtime APIs
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// API key for Resend
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

// Email template for user welcome email
const getUserWelcomeEmailTemplate = (email: string) => ({
  from: 'Andile <andile@notify.caseon.io>',
  to: [email],
  subject: 'Welcome to CaseOn',
  reply_to: 'caseonza@gmail.com',
  html: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to CaseOn</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+Pro:wght@400;600&display=swap');
          
          body { 
            font-family: 'Source Sans Pro', Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          }
          .header { 
            background-color: #1a365d; 
            padding: 30px 20px;
            text-align: center;
          }
          .logo { 
            width: 100px;
            margin-bottom: 15px;
          }
          .header h1 {
            font-family: 'Libre Baskerville', Georgia, serif;
            color: #ffffff;
            margin: 0;
            font-size: 28px;
            font-weight: 700;
          }
          .content {
            padding: 30px 40px;
          }
          .greeting {
            font-family: 'Libre Baskerville', Georgia, serif;
            font-size: 20px;
            color: #1a365d;
            margin-bottom: 20px;
          }
          p { 
            margin: 0 0 20px;
            color: #333;
            font-size: 16px;
          }
          .signature {
            font-family: 'Libre Baskerville', Georgia, serif;
            font-style: italic;
            margin-top: 30px;
            color: #1a365d;
          }
          .footer { 
            background-color: #f5f5f5;
            padding: 20px; 
            font-size: 14px; 
            color: #666; 
            text-align: center;
            border-top: 1px solid #e0e0e0;
          }
          .footer p {
            margin: 5px 0;
            font-size: 14px;
            color: #666;
          }
          .divider {
            height: 3px;
            background: linear-gradient(to right, #e9c46a, #1a365d);
            margin: 0;
          }
          @media only screen and (max-width: 480px) {
            .content {
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="https://caseon.io/icon.svg" alt="CaseOn Logo" class="logo">
            <h1>WELCOME TO CASEON</h1>
          </div>
          <div class="divider"></div>
          <div class="content">
            <p class="greeting">Dear Legal Professional,</p>
            <p>Thank you for joining CaseOn, the premier Legal Intelligence Platform designed specifically for legal practitioners.</p>
            <p>CaseOn provides you with powerful tools to manage your cases efficiently, streamline your workflow, and make data-driven decisions that benefit both your practice and your clients.</p>
            <p>As you begin your journey with us, we encourage you to explore the platform's features. Our commitment is to empower legal professionals like yourself with technology that enhances your practice.</p>
            <p>Should you have any questions or require assistance, please don't hesitate to reply to this email.</p>
            <div class="signature">
              <p>Kind Regards,</p>
              <p>Andile</p>
              <p><strong>CaseOn Legal Solutions</strong></p>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CaseOn. All rights reserved.</p>
            <p>This communication is confidential and intended solely for the addressee.</p>
          </div>
        </div>
      </body>
    </html>
  `
})

// Email template for admin notification
const getAdminNotificationEmailTemplate = (userEmail: string) => ({
  from: 'Andile <andile@notify.caseon.io>',
  to: ['caseonza@gmail.com'],
  subject: 'New User Signup',
  html: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New User Signup</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+Pro:wght@400;600&display=swap');
          
          body { 
            font-family: 'Source Sans Pro', Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          }
          .header { 
            background-color: #1a365d; 
            padding: 30px 20px;
            text-align: center;
          }
          .logo { 
            width: 100px;
            margin-bottom: 15px;
          }
          .header h1 {
            font-family: 'Libre Baskerville', Georgia, serif;
            color: #ffffff;
            margin: 0;
            font-size: 28px;
            font-weight: 700;
          }
          .content {
            padding: 30px 40px;
          }
          p { 
            margin: 0 0 20px;
            color: #333;
            font-size: 16px;
          }
          .highlight-box {
            background-color: #f5f7fa;
            border-left: 4px solid #1a365d;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 0 4px 4px 0;
          }
          .highlight-box p {
            margin: 0;
            font-weight: 600;
          }
          .highlight-box .label {
            color: #1a365d;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
          }
          .highlight-box .value {
            color: #333;
            font-size: 18px;
          }
          .footer { 
            background-color: #f5f5f5;
            padding: 20px; 
            font-size: 14px; 
            color: #666; 
            text-align: center;
            border-top: 1px solid #e0e0e0;
          }
          .footer p {
            margin: 5px 0;
            font-size: 14px;
            color: #666;
          }
          .divider {
            height: 3px;
            background: linear-gradient(to right, #e9c46a, #1a365d);
            margin: 0;
          }
          @media only screen and (max-width: 480px) {
            .content {
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="https://caseon.io/icon.svg" alt="CaseOn Logo" class="logo">
            <h1>NEW USER NOTIFICATION</h1>
          </div>
          <div class="divider"></div>
          <div class="content">
            <p>A new legal professional has registered on the CaseOn platform.</p>
            <div class="highlight-box">
              <p class="label">User Email Address</p>
              <p class="value">${userEmail}</p>
            </div>
            <p>This user has been sent a welcome email with information about CaseOn.</p>
            <p>You may want to follow up with this user to ensure they have all the resources needed to get started.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CaseOn. All rights reserved.</p>
            <p>This is an automated notification from the CaseOn platform.</p>
          </div>
        </div>
      </body>
    </html>
  `
})

// Function to send email using Resend HTTP API
async function sendEmail(emailData: any) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to send email: ${JSON.stringify(errorData)}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error sending email:', error);
    return { error };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the request body
    const { email } = await req.json()
    
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send welcome email to user
    const userEmailData = getUserWelcomeEmailTemplate(email)
    const userEmailResult = await sendEmail(userEmailData)

    if (userEmailResult.error) {
      console.error('Failed to send welcome email:', userEmailResult.error)
      return new Response(
        JSON.stringify({ error: 'Failed to send welcome email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send notification email to admin
    const adminEmailData = getAdminNotificationEmailTemplate(email)
    const adminEmailResult = await sendEmail(adminEmailData)

    if (adminEmailResult.error) {
      console.error('Failed to send admin notification email:', adminEmailResult.error)
      // Don't return error here as the user email was sent successfully
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Welcome email sent successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in user-signup function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
