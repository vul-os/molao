import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';

// Initialize Supabase client with the internal service key
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fetchInvoiceData(invoiceId, firmId) {
  // Fetch the invoice data with related information
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(`
      *,
      plan:plan_id(*),
      firm:firm_id(*)
    `)
    .eq('id', invoiceId)
    .eq('firm_id', firmId)
    .single();

  if (error) {
    throw new Error(`Error fetching invoice: ${error.message}`);
  }

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  return invoice;
}

async function generatePDF(invoice) {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  
  // Add a page
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();
  
  // Get fonts
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Define margins and sizes
  const margin = 50;
  const fontSize = 10;
  const headerFontSize = 24;
  const titleFontSize = 16;
  const subtitleFontSize = 12;
  
  // Format dates and currency
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  
  const formatCurrency = (amountCents) => {
    return (amountCents / 100).toLocaleString('en-ZA', {
      style: 'currency',
      currency: invoice.currency || 'ZAR'
    });
  };
  
  // Draw invoice header
  page.drawText('INVOICE', {
    x: margin,
    y: height - margin - headerFontSize,
    size: headerFontSize,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  
  // Draw invoice number and date
  page.drawText(`Invoice Number: ${invoice.invoice_number}`, {
    x: margin,
    y: height - margin - headerFontSize - 20,
    size: fontSize,
    font: helveticaFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  page.drawText(`Date: ${formatDate(invoice.created_at)}`, {
    x: margin,
    y: height - margin - headerFontSize - 35,
    size: fontSize,
    font: helveticaFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  page.drawText(`Due Date: ${formatDate(invoice.due_date)}`, {
    x: margin,
    y: height - margin - headerFontSize - 50,
    size: fontSize,
    font: helveticaFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  // Draw status
  const statusText = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
  page.drawText(`Status: ${statusText}`, {
    x: width - margin - helveticaFont.widthOfTextAtSize(`Status: ${statusText}`, fontSize),
    y: height - margin - headerFontSize - 20,
    size: fontSize,
    font: helveticaBold,
    color: invoice.status === 'paid' ? rgb(0.2, 0.7, 0.3) : rgb(0.9, 0.6, 0.1),
  });
  
  // Draw firm details if available
  if (invoice.firm) {
    page.drawText('BILLED TO:', {
      x: margin,
      y: height - margin - headerFontSize - 80,
      size: subtitleFontSize,
      font: helveticaBold,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    page.drawText(invoice.firm.name, {
      x: margin,
      y: height - margin - headerFontSize - 95,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    if (invoice.firm.address) {
      page.drawText(invoice.firm.address, {
        x: margin,
        y: height - margin - headerFontSize - 110,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });
    }
    
    if (invoice.firm.email) {
      page.drawText(invoice.firm.email, {
        x: margin,
        y: height - margin - headerFontSize - 125,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });
    }
  }
  
  // Draw line items header
  page.drawText('DESCRIPTION', {
    x: margin,
    y: height - margin - headerFontSize - 160,
    size: subtitleFontSize,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  page.drawText('QTY', {
    x: margin + 250,
    y: height - margin - headerFontSize - 160,
    size: subtitleFontSize,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  page.drawText('UNIT PRICE', {
    x: margin + 300,
    y: height - margin - headerFontSize - 160,
    size: subtitleFontSize,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  page.drawText('AMOUNT', {
    x: margin + 400,
    y: height - margin - headerFontSize - 160,
    size: subtitleFontSize,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  // Draw horizontal line
  page.drawLine({
    start: { x: margin, y: height - margin - headerFontSize - 170 },
    end: { x: width - margin, y: height - margin - headerFontSize - 170 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  
  // Draw line items
  let y = height - margin - headerFontSize - 190;
  if (invoice.line_items && Array.isArray(invoice.line_items)) {
    for (const item of invoice.line_items) {
      page.drawText(item.description || '', {
        x: margin,
        y,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      page.drawText(item.quantity?.toString() || '1', {
        x: margin + 250,
        y,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      page.drawText(formatCurrency(item.unit_price_cents || 0), {
        x: margin + 300,
        y,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      page.drawText(formatCurrency(item.total_cents || 0), {
        x: margin + 400,
        y,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      y -= 20;
    }
  } else if (invoice.plan) {
    // If no line items but we have a plan, create a line item from the plan
    page.drawText(`${invoice.plan.name} (${invoice.plan.description || 'Monthly subscription'})`, {
      x: margin,
      y,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    page.drawText('1', {
      x: margin + 250,
      y,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    page.drawText(formatCurrency(invoice.subtotal_cents || 0), {
      x: margin + 300,
      y,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    page.drawText(formatCurrency(invoice.subtotal_cents || 0), {
      x: margin + 400,
      y,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
  }
  
  // Draw another horizontal line
  page.drawLine({
    start: { x: margin, y: y - 10 },
    end: { x: width - margin, y: y - 10 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  
  // Draw totals
  y -= 30;
  
  page.drawText('Subtotal:', {
    x: width - margin - 150,
    y,
    size: fontSize,
    font: helveticaFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  page.drawText(formatCurrency(invoice.subtotal_cents || 0), {
    x: width - margin - helveticaFont.widthOfTextAtSize(formatCurrency(invoice.subtotal_cents || 0), fontSize),
    y,
    size: fontSize,
    font: helveticaFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  y -= 20;
  
  page.drawText('Tax:', {
    x: width - margin - 150,
    y,
    size: fontSize,
    font: helveticaFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  page.drawText(formatCurrency(invoice.tax_cents || 0), {
    x: width - margin - helveticaFont.widthOfTextAtSize(formatCurrency(invoice.tax_cents || 0), fontSize),
    y,
    size: fontSize,
    font: helveticaFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  y -= 20;
  
  // Draw horizontal line for total
  page.drawLine({
    start: { x: width - margin - 150, y: y - 5 },
    end: { x: width - margin, y: y - 5 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  
  y -= 15;
  
  page.drawText('Total:', {
    x: width - margin - 150,
    y,
    size: subtitleFontSize,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  
  page.drawText(formatCurrency(invoice.total_cents || 0), {
    x: width - margin - helveticaBold.widthOfTextAtSize(formatCurrency(invoice.total_cents || 0), subtitleFontSize),
    y,
    size: subtitleFontSize,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  
  // Draw payment information if invoice is paid
  if (invoice.status === 'paid' && invoice.paid_at) {
    y -= 50;
    
    page.drawText('PAYMENT INFORMATION', {
      x: margin,
      y,
      size: subtitleFontSize,
      font: helveticaBold,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    y -= 20;
    
    page.drawText(`Paid on: ${formatDate(invoice.paid_at)}`, {
      x: margin,
      y,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    if (invoice.metadata?.payment_details?.transaction_id) {
      y -= 15;
      page.drawText(`Transaction ID: ${invoice.metadata.payment_details.transaction_id}`, {
        x: margin,
        y,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });
    }
  }
  
  // Draw notes section
  if (invoice.notes) {
    y -= 50;
    
    page.drawText('NOTES', {
      x: margin,
      y,
      size: subtitleFontSize,
      font: helveticaBold,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    y -= 20;
    
    page.drawText(invoice.notes, {
      x: margin,
      y,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0.3, 0.3, 0.3),
    });
  }
  
  // Draw footer
  page.drawText('Thank you for your business', {
    x: (width / 2) - (helveticaFont.widthOfTextAtSize('Thank you for your business', fontSize) / 2),
    y: margin + 30,
    size: fontSize,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  // Serialize the PDFDocument to bytes
  const pdfBytes = await pdfDoc.save();
  
  // Convert to base64
  const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
  
  return pdfBase64;
}

// Main function
Deno.serve(async (req) => {
  // Check for correct request method
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }), 
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    // Parse request body
    const { invoiceId, firmId } = await req.json();
    
    // Validate inputs
    if (!invoiceId || !firmId) {
      throw new Error('Missing required parameters: invoiceId and firmId');
    }
    
    // Fetch invoice data
    const invoice = await fetchInvoiceData(invoiceId, firmId);
    
    // Generate PDF
    const pdfBase64 = await generatePDF(invoice);
    
    // Return PDF data
    return new Response(
      JSON.stringify({ 
        success: true, 
        pdfBase64,
        invoice_number: invoice.invoice_number
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to generate PDF' 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}); 