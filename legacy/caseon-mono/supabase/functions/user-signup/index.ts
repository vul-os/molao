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
  from: 'C-h-ase <noreply@notify.caseon.co.za>',
  to: [email],
  subject: 'Welcome to CaseOn Legal Intelligence',
  reply_to: 'caseonza@gmail.com',
  html: `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="x-apple-disable-message-reformatting">
        <title>Welcome to CaseOn</title>
        <!--[if mso]>
        <noscript>
          <xml>
            <o:OfficeDocumentSettings>
              <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
          </xml>
        </noscript>
        <![endif]-->
        <style>
          /* Reset styles */
          * { box-sizing: border-box; }
          body, table, td, p, h1, h2, h3 { margin: 0; padding: 0; }
          img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
          table { border-collapse: collapse !important; }
          
          /* Base styles */
          body {
            font-family: Georgia, 'Times New Roman', Times, serif;
            line-height: 1.6;
            color: #1e293b;
            background-color: #f8fafc;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
          }
          
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
          }
          
          .header {
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            padding: 40px 32px;
            text-align: center;
            border-radius: 12px 12px 0 0;
          }
          
          .logo-container {
            margin-bottom: 24px;
          }
          
          .logo-svg {
            width: 48px;
            height: 48px;
            border-radius: 8px;
            background-color: #ffffff;
            padding: 8px;
            display: inline-block;
            vertical-align: middle;
          }
          
          .logo-fallback {
            display: inline-block;
            width: 48px;
            height: 48px;
            background-color: #ffffff;
            border-radius: 8px;
            line-height: 48px;
            text-align: center;
            font-weight: bold;
            color: #1e293b;
            font-size: 20px;
            font-family: Georgia, serif;
          }
          
          .header-title {
            color: #ffffff;
            font-size: 28px;
            font-weight: 400;
            margin: 0;
            font-family: Georgia, 'Times New Roman', Times, serif;
          }
          
          .header-subtitle {
            color: #cbd5e1;
            font-size: 16px;
            margin: 8px 0 0 0;
            font-weight: normal;
          }
          
          .content {
            padding: 48px 32px;
          }
          
          .greeting {
            font-size: 18px;
            color: #1e293b;
            margin-bottom: 24px;
            font-family: Georgia, serif;
            font-weight: 500;
          }
          
          .welcome-card {
            background-color: #f8fafc;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 32px;
            margin: 32px 0;
            text-align: center;
          }
          
          .welcome-title {
            font-size: 24px;
            font-weight: 500;
            color: #1e293b;
            margin-bottom: 16px;
            font-family: Georgia, serif;
          }
          
          .welcome-text {
            font-size: 16px;
            color: #64748b;
            margin-bottom: 24px;
            line-height: 1.6;
          }
          
          .platform-badge {
            display: inline-block;
            background-color: #1e293b;
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 24px;
          }
          
          p {
            font-size: 16px;
            color: #475569;
            margin-bottom: 20px;
            line-height: 1.6;
          }
          
          .features {
            margin: 40px 0;
          }
          
          .feature-list {
            list-style: none;
            padding: 0;
            margin: 24px 0;
          }
          
          .feature-item {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            font-size: 15px;
            color: #475569;
          }
          
          .feature-icon {
            width: 20px;
            height: 20px;
            background-color: #22c55e;
            border-radius: 50%;
            margin-right: 12px;
            flex-shrink: 0;
            position: relative;
          }
          
          .feature-icon::after {
            content: "✓";
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 12px;
            font-weight: bold;
          }
          
          .signature {
            background-color: #f1f5f9;
            border-left: 4px solid #1e293b;
            padding: 24px;
            margin: 32px 0;
            border-radius: 0 8px 8px 0;
          }
          
          .signature p {
            margin: 0 0 8px 0;
            font-size: 16px;
            color: #334155;
          }
          
          .signature .name {
            font-family: Georgia, serif;
            font-style: italic;
            font-weight: 500;
            color: #1e293b;
          }
          
          .signature .title {
            font-size: 14px;
            color: #64748b;
            font-weight: 500;
          }
          
          .next-steps {
            background-color: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 20px;
            margin: 24px 0;
            font-size: 14px;
            color: #92400e;
          }
          
          .next-steps h4 {
            margin: 0 0 12px 0;
            color: #92400e;
            font-size: 16px;
            font-family: Georgia, serif;
          }
          
          .footer {
            background-color: #f8fafc;
            padding: 32px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
          }
          
          .footer-text {
            font-size: 13px;
            color: #64748b;
            margin-bottom: 16px;
            line-height: 1.5;
          }
          
          .footer-branding {
            font-size: 13px;
            color: #94a3b8;
            font-weight: 500;
          }
          
          /* Mobile responsive */
          @media only screen and (max-width: 600px) {
            .email-container { width: 100% !important; }
            .header, .content, .footer { padding: 24px 20px !important; }
            .header-title { font-size: 24px !important; }
            .welcome-title { font-size: 20px !important; }
            .welcome-card, .signature { padding: 24px 20px !important; margin: 24px 0 !important; }
          }
          
          /* Dark mode support */
          @media (prefers-color-scheme: dark) {
            .email-container { background-color: #0f172a !important; }
            .content { background-color: #0f172a !important; }
            .greeting, .welcome-title { color: #f1f5f9 !important; }
            .welcome-text, .feature-item, p { color: #cbd5e1 !important; }
            .welcome-card { background-color: #1e293b !important; border-color: #334155 !important; }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <!-- Header -->
          <div class="header">
            <div class="logo-container">
              <!--[if !mso]><!-->
              <div class="logo-svg">
                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
                  <!-- Simplified magnifying glass - positioned to fill more space but keeping original look -->
                  <g transform="translate(30, 0) scale(0.8)">
                    <!-- Magnifying glass handle -->
                    <path d="M 160,160 L 110,110" stroke="#333333" stroke-width="12" stroke-linecap="round"/>
                    <!-- Magnifying glass circle -->
                    <circle cx="70" cy="70" r="50" fill="none" stroke="#333333" stroke-width="12"/>
                  </g>
                  
                  <!-- Improved document icon with better alignment and no bottom line - positioned to fill more space -->
                  <g transform="translate(95, 70) scale(1.5)">
                    <!-- Document outline using just left, top, and right lines - no bottom line -->
                    <path d="M 0,-20 L 50,-20 L 50,40" fill="none" stroke="#333333" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
                    <line x1="0" y1="-20" x2="0" y2="40" stroke="#333333" stroke-width="5" stroke-linecap="round"/>
                    
                    <!-- Document fold aligned with document edge -->
                    <path d="M 50,-20 L 35,-20 L 50,-5 Z" fill="#333333" stroke="#333333" stroke-width="5" stroke-linejoin="round"/>
                  </g>
                </svg>
              </div>
              <!--<![endif]-->
              <!--[if mso]>
              <div class="logo-fallback">Ch</div>
              <![endif]-->
            </div>
            <h1 class="header-title">Welcome to CaseOn</h1>
            <p class="header-subtitle">Legal Intelligence Platform</p>
          </div>
          
          <!-- Main Content -->
          <div class="content">
            <p class="greeting">Dear Legal Professional,</p>
            
            <div class="welcome-card">
              <h2 class="welcome-title">Your Journey Begins</h2>
              <p class="welcome-text">
                Thank you for joining CaseOn, the premier Legal Intelligence Platform 
                designed specifically for forward-thinking legal practitioners.
              </p>
              <div class="platform-badge">
                Legal Intelligence Platform
              </div>
            </div>
            
            <p>
              CaseOn provides you with powerful tools to manage your cases efficiently, 
              streamline your workflow, and make data-driven decisions that benefit both 
              your practice and your clients.
            </p>
            
            <div class="features">
              <p style="font-size: 16px; color: #334155; margin-bottom: 20px; font-weight: 500;">
                What you can accomplish with CaseOn:
              </p>
              <ul class="feature-list">
                <li class="feature-item">
                  <span class="feature-icon"></span>
                  Streamlined case management and workflow automation
                </li>
                <li class="feature-item">
                  <span class="feature-icon"></span>
                  Advanced legal research and intelligence tools
                </li>
                <li class="feature-item">
                  <span class="feature-icon"></span>
                  Secure collaboration with your legal team
                </li>
                <li class="feature-item">
                  <span class="feature-icon"></span>
                  Data-driven insights for strategic decision making
                </li>
                <li class="feature-item">
                  <span class="feature-icon"></span>
                  Professional client communication and reporting
                </li>
              </ul>
            </div>
            
            <div class="next-steps">
              <h4>Next Steps</h4>
              <p style="margin: 0; line-height: 1.5;">
                Begin exploring the platform's features at your own pace. Our commitment 
                is to empower legal professionals like yourself with technology that enhances 
                your practice and delivers exceptional client outcomes.
              </p>
            </div>
            
            <p>
              Should you have any questions or require assistance getting started, 
              please don't hesitate to reply to this email. We're here to support your success.
            </p>
            
            <div class="signature">
              <p>Kind Regards,</p>
              <p class="name">C-h-ase</p>
              <p class="title">CaseOn Legal Solutions</p>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="footer">
            <p class="footer-text">
              This communication is confidential and intended solely for the addressee.<br>
              Welcome to the future of legal intelligence.
            </p>
            <p class="footer-branding">
              © ${new Date().getFullYear()} CaseOn. All rights reserved.
            </p>
          </div>
        </div>
      </body>
    </html>
  `
})

// Email template for admin notification
const getAdminNotificationEmailTemplate = (userEmail: string) => ({
  from: 'CaseOn System <system@notify.caseon.co.za>',
  to: ['caseonza@gmail.com'],
  subject: 'New Legal Professional Registration - CaseOn',
  html: `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="x-apple-disable-message-reformatting">
        <title>New User Registration</title>
        <style>
          /* Reset styles */
          * { box-sizing: border-box; }
          body, table, td, p, h1, h2, h3 { margin: 0; padding: 0; }
          img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
          table { border-collapse: collapse !important; }
          
          /* Base styles */
          body {
            font-family: Georgia, 'Times New Roman', Times, serif;
            line-height: 1.6;
            color: #1e293b;
            background-color: #f8fafc;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
          }
          
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
          }
          
          .header {
            background: linear-gradient(135deg, #059669 0%, #047857 100%);
            padding: 40px 32px;
            text-align: center;
            border-radius: 12px 12px 0 0;
          }
          
          .logo-container {
            margin-bottom: 24px;
          }
          
          .logo-svg {
            width: 48px;
            height: 48px;
            border-radius: 8px;
            background-color: #ffffff;
            padding: 8px;
            display: inline-block;
            vertical-align: middle;
          }
          
          .logo-fallback {
            display: inline-block;
            width: 48px;
            height: 48px;
            background-color: #ffffff;
            border-radius: 8px;
            line-height: 48px;
            text-align: center;
            font-weight: bold;
            color: #1e293b;
            font-size: 20px;
            font-family: Georgia, serif;
          }
          
          .header-title {
            color: #ffffff;
            font-size: 24px;
            font-weight: 400;
            margin: 0;
            font-family: Georgia, 'Times New Roman', Times, serif;
          }
          
          .header-subtitle {
            color: #d1fae5;
            font-size: 14px;
            margin: 8px 0 0 0;
            font-weight: normal;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          
          .content {
            padding: 48px 32px;
          }
          
          .notification-card {
            background-color: #f0fdf4;
            border: 2px solid #bbf7d0;
            border-radius: 12px;
            padding: 32px;
            margin: 32px 0;
            text-align: center;
          }
          
          .user-email {
            font-size: 20px;
            font-weight: 500;
            color: #1e293b;
            margin-bottom: 16px;
            font-family: 'Courier New', monospace;
            background-color: #ffffff;
            padding: 12px 20px;
            border-radius: 8px;
            border: 1px solid #d1d5db;
          }
          
          .status-badge {
            display: inline-block;
            background-color: #059669;
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 24px;
          }
          
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 32px 0;
          }
          
          .info-item {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
          }
          
          .info-label {
            font-size: 12px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            font-weight: 600;
          }
          
          .info-value {
            font-size: 16px;
            color: #1e293b;
            font-weight: 500;
            font-family: Georgia, serif;
          }
          
          .action-needed {
            background-color: #fffbeb;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 20px;
            margin: 24px 0;
            font-size: 14px;
            color: #92400e;
          }
          
          .action-needed h4 {
            margin: 0 0 12px 0;
            color: #92400e;
            font-size: 16px;
            font-family: Georgia, serif;
          }
          
          p {
            font-size: 16px;
            color: #475569;
            margin-bottom: 20px;
            line-height: 1.6;
          }
          
          .footer {
            background-color: #f8fafc;
            padding: 32px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
          }
          
          .footer-text {
            font-size: 13px;
            color: #64748b;
            margin-bottom: 16px;
            line-height: 1.5;
          }
          
          .footer-branding {
            font-size: 13px;
            color: #94a3b8;
            font-weight: 500;
          }
          
          /* Mobile responsive */
          @media only screen and (max-width: 600px) {
            .email-container { width: 100% !important; }
            .header, .content, .footer { padding: 24px 20px !important; }
            .header-title { font-size: 20px !important; }
            .notification-card { padding: 24px 20px !important; margin: 24px 0 !important; }
            .info-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <!-- Header -->
          <div class="header">
            <div class="logo-container">
              <!--[if !mso]><!-->
              <div class="logo-svg">
                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
                  <!-- Simplified magnifying glass - positioned to fill more space but keeping original look -->
                  <g transform="translate(30, 0) scale(0.8)">
                    <!-- Magnifying glass handle -->
                    <path d="M 160,160 L 110,110" stroke="#333333" stroke-width="12" stroke-linecap="round"/>
                    <!-- Magnifying glass circle -->
                    <circle cx="70" cy="70" r="50" fill="none" stroke="#333333" stroke-width="12"/>
                  </g>
                  
                  <!-- Improved document icon with better alignment and no bottom line - positioned to fill more space -->
                  <g transform="translate(95, 70) scale(1.5)">
                    <!-- Document outline using just left, top, and right lines - no bottom line -->
                    <path d="M 0,-20 L 50,-20 L 50,40" fill="none" stroke="#333333" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
                    <line x1="0" y1="-20" x2="0" y2="40" stroke="#333333" stroke-width="5" stroke-linecap="round"/>
                    
                    <!-- Document fold aligned with document edge -->
                    <path d="M 50,-20 L 35,-20 L 50,-5 Z" fill="#333333" stroke="#333333" stroke-width="5" stroke-linejoin="round"/>
                  </g>
                </svg>
              </div>
              <!--<![endif]-->
              <!--[if mso]>
              <div class="logo-fallback">Ch</div>
              <![endif]-->
            </div>
            <h1 class="header-title">New Registration</h1>
            <p class="header-subtitle">Admin Notification</p>
          </div>
          
          <!-- Main Content -->
          <div class="content">
            <p>A new legal professional has successfully registered on the CaseOn platform.</p>
            
            <div class="notification-card">
              <div class="status-badge">New User Registered</div>
              <div class="user-email">${userEmail}</div>
              <p style="color: #059669; margin: 0; font-size: 14px;">
                Welcome email has been automatically sent
              </p>
            </div>
            
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Registration Time</div>
                <div class="info-value">${new Date().toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: 'numeric',
                  minute: 'numeric'
                })}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Platform Status</div>
                <div class="info-value">Active</div>
              </div>
            </div>
            
            <div class="action-needed">
              <h4>Recommended Follow-up</h4>
              <p style="margin: 0; line-height: 1.5;">
                Consider reaching out to this new user within 24 hours to ensure they have 
                all the resources needed to get started with CaseOn effectively.
              </p>
            </div>
            
            <p>
              The user has been provided with comprehensive onboarding information and 
              platform access. Monitor their initial activity to identify any support needs.
            </p>
          </div>
          
          <!-- Footer -->
          <div class="footer">
            <p class="footer-text">
              This is an automated notification from the CaseOn platform.<br>
              System notifications are sent for all new user registrations.
            </p>
            <p class="footer-branding">
              © ${new Date().getFullYear()} CaseOn. All rights reserved.
            </p>
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
