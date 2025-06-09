import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SearchRequest {
  query: string
  firm_id?: string
  limit?: number
  score_threshold?: number
}

interface ModalSearchResult {
  id: string
  file_name: string
  file_type: string
  score: number
  file_size?: number
  mime_type?: string
}

interface ModalSearchResponse {
  results: ModalSearchResult[]
}

interface FileResult {
  id: string
  file_name: string
  file_title: string
  pdf_url: string
  file_size?: number
  summaries?: Array<{
    model: string
    content: string
  }>
}

interface UsageData {
  can_query: boolean
  daily_usage: number
  monthly_usage: number
  daily_limit: number
  monthly_limit: number
  daily_remaining: number
  monthly_remaining: number
  plan_name: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Parse request body
    const { query, firm_id, limit = 10, score_threshold = 0.75 }: SearchRequest = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!firm_id) {
      return new Response(
        JSON.stringify({ error: 'Firm ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check usage limits first
    const { data: usageData, error: usageError } = await supabaseClient
      .rpc('check_firm_usage_limits', { input_firm_id: firm_id })

    if (usageError) {
      console.error('Usage check error:', usageError)
      return new Response(
        JSON.stringify({ error: 'Error checking usage limits' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!usageData || usageData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No usage data found' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const usage: UsageData = usageData[0]

    if (!usage.can_query) {
      const limitMessage = `You have reached your ${usage.plan_name} plan's query limit. ` +
        `Daily: ${usage.daily_usage}/${usage.daily_limit} queries used. ` +
        `Monthly: ${usage.monthly_usage}/${usage.monthly_limit} queries used.`
      
      return new Response(
        JSON.stringify({ 
          error: limitMessage,
          usage: usage,
          billing_limit_reached: true
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Record the query
    const { error: recordError } = await supabaseClient
      .rpc('record_user_query', { 
        query_text: query, 
        firm_id: firm_id 
      })

    if (recordError) {
      console.error('Error recording query:', recordError)
      // Don't fail the request for this, just log it
    }

    // CDN base URL
    const CDN_URL = 'https://cdn.caseon.io/'

    // Call the simplified Modal search endpoint (only query and limit)
    const modalSearchPayload = {
      query,
      limit,
      score_threshold
    }

    const modalResponse = await fetch('https://exolutionza--caseon-inference-search.modal.run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(modalSearchPayload)
    })

    if (!modalResponse.ok) {
      console.error('Modal search failed:', modalResponse.status)
      return new Response(
        JSON.stringify({ error: 'Search service unavailable' }),
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const modalData: ModalSearchResponse = await modalResponse.json()

    if (!modalData.results || modalData.results.length === 0) {
      return new Response(
        JSON.stringify({ 
          results: [],
          total: 0,
          query,
          limit,
          usage: usage
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract file names from Modal results
    const fileNames = modalData.results.map(result => result.file_name)

    // Query local files table to get file titles and summaries (no firm filtering)
    const { data: filesWithSummaries, error } = await supabaseClient
      .from('files')
      .select(`
        id, 
        file_name, 
        file_title, 
        cdn_path, 
        file_size,
        file_summaries (
          model,
          content
        )
      `)
      .in('file_name', fileNames)
      .not('cdn_path', 'is', null)

    if (error) {
      console.error('Database query error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch file details' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create a map of file names to file data for quick lookup
    const fileMap = new Map()
    if (filesWithSummaries) {
      filesWithSummaries.forEach(file => {
        fileMap.set(file.file_name, file)
      })
    }

    // Process results: match Modal results with local file data and create PDF URLs
    const results: FileResult[] = modalData.results
      .map(modalResult => {
        const localFile = fileMap.get(modalResult.file_name)
        
        if (!localFile) {
          // If no local file found, create result with Modal data only
          const fileNameWithoutExt = modalResult.file_name.replace(/\.[^/.]+$/, '')
          const pdfFileName = `${fileNameWithoutExt}.pdf`
          const pdfUrl = `${CDN_URL}${pdfFileName}`

          return {
            id: modalResult.id,
            file_name: modalResult.file_name,
            file_title: modalResult.file_name, // Use filename as title if no local data
            pdf_url: pdfUrl,
            file_size: modalResult.file_size,
            summaries: []
          }
        }

        // Get the filename without extension and add .pdf
        const fileNameWithoutExt = localFile.file_name.replace(/\.[^/.]+$/, '')
        const pdfFileName = `${fileNameWithoutExt}.pdf`
        
        // Create the full CDN URL
        const pdfUrl = `${CDN_URL}${pdfFileName}`

        return {
          id: localFile.id,
          file_name: localFile.file_name,
          file_title: localFile.file_title || localFile.file_name,
          pdf_url: pdfUrl,
          file_size: localFile.file_size,
          summaries: localFile.file_summaries || []
        }
      })
      .filter(result => result !== null) // Remove any null results

    return new Response(
      JSON.stringify({ 
        results,
        total: results.length,
        query,
        limit,
        usage: usage
      }),
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
