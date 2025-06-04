import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the CDN URL from query parameters
    const url = new URL(req.url)
    const cdnUrl = url.searchParams.get('url')
    
    if (!cdnUrl) {
      return new Response(
        JSON.stringify({ error: 'URL parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate that it's a BunnyCDN URL (security measure)
    if (!cdnUrl.includes('caseonza.b-cdn.net')) {
      return new Response(
        JSON.stringify({ error: 'Invalid CDN URL' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Fetch the file from BunnyCDN
    const response = await fetch(cdnUrl)
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `File not found: ${response.status}` }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get the file content
    const fileContent = await response.arrayBuffer()
    
    // Return the file with proper CORS headers
    return new Response(fileContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Length': fileContent.byteLength.toString(),
      }
    })

  } catch (error) {
    console.error('Proxy error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}) 