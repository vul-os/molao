import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LegalSummaryRequest {
  query: string
}

interface LegalSummaryResponse {
  query: string
  condensed_summary: string
  case_names: string[]
  long_summary: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { query }: LegalSummaryRequest = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get Gemini API key from Supabase secrets
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY not found in environment variables')
      return new Response(
        JSON.stringify({ error: 'API configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Construct the prompt for South African legal context
    const prompt = `You are a South African legal assistant. Analyze the following legal query in the context of South African law and provide summaries in markdown format:

Query: "${query}"

Please structure your response in the following markdown format:

## Condensed Summary
[2-3 sentences highlighting the key legal issues and any relevant case names]

## Case Names
- Case Name 1 (if applicable)
- Case Name 2 (if applicable)
[List relevant South African case names, or write "No specific cases identified" if none apply]

## Long Summary
[2-3 paragraphs explaining the legal principles, precedents, and South African case law that applies. Focus specifically on South African legislation, case law, and legal principles. Discuss how South African courts have approached similar issues and what legal framework applies.]

Focus specifically on South African legislation, case law, and legal principles.`

    // Call Gemini Flash API
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      })
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error('Gemini API error:', geminiResponse.status, errorText)
      return new Response(
        JSON.stringify({ error: 'AI service unavailable' }),
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const geminiData = await geminiResponse.json()
    
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      console.error('No candidates returned from Gemini API')
      return new Response(
        JSON.stringify({ error: 'No response generated' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const generatedText = geminiData.candidates[0].content.parts[0].text

    // Parse markdown sections
    const condensedMatch = generatedText.match(/## Condensed Summary\s*([\s\S]*?)(?=##|$)/i)
    const caseNamesMatch = generatedText.match(/## Case Names\s*([\s\S]*?)(?=##|$)/i)
    const longSummaryMatch = generatedText.match(/## Long Summary\s*([\s\S]*?)(?=##|$)/i)

    // Extract case names from markdown list
    const caseNamesText = caseNamesMatch ? caseNamesMatch[1].trim() : ""
    const caseNames = caseNamesText
      .split('\n')
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(line => line && !line.toLowerCase().includes('no specific cases'))

    const response: LegalSummaryResponse = {
      query: query,
      condensed_summary: condensedMatch ? condensedMatch[1].trim() : "Legal analysis completed for South African context.",
      case_names: caseNames,
      long_summary: longSummaryMatch ? longSummaryMatch[1].trim() : "Detailed legal analysis not available."
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})