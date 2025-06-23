import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RerankRequest {
  query: string
  file_ids: string[]
  firm_id?: string
}

interface ModalRerankResult {
  id: string
  file_name: string
  file_type: string
  score: number
  file_size?: number
  mime_type?: string
}

interface ModalRerankResponse {
  results: ModalRerankResult[]
}

interface FileResult {
  id: string
  file_name: string
  file_title: string
  pdf_url: string
  file_size?: number
  score: number
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

interface RerankResponse {
  results: FileResult[]
  total: number
  query: string
  usage: UsageData
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
    const { query, file_ids, firm_id }: RerankRequest = await req.json()

    console.log(`Rerank request: query="${query}", file_ids=${file_ids?.length || 0}, firm_id=${firm_id}, no limit`)

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'file_ids array is required and must not be empty' }),
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
          billing_limit_reached: true,
          query
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

    // Call the Modal rerank endpoint
    const modalRerankPayload = {
      query,
      file_ids
    }

    console.log(`Calling Modal rerank with ${file_ids.length} file IDs, limiting to top 50`)

    const modalResponse = await fetch('https://exolutionza--caseon-inference-fastapi-wrapper.modal.run/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(modalRerankPayload)
    })

    if (!modalResponse.ok) {
      console.error('Modal rerank failed:', modalResponse.status)
      return new Response(
        JSON.stringify({ error: 'Rerank service unavailable' }),
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const modalData: ModalRerankResponse = await modalResponse.json()

    console.log(`Modal rerank returned ${modalData.results?.length || 0} results`)

    if (!modalData.results || modalData.results.length === 0) {
      return new Response(
        JSON.stringify({ 
          results: [],
          total: 0,
          query,
          usage: usage
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // CDN base URL
    const CDN_URL = 'https://cdn.caseon.io/'

    // Get file details and summaries for the reranked results
    const fileIds = modalData.results.map(result => result.id)

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
      .in('id', fileIds)
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

    // Create a map of file IDs to file data for quick lookup
    const fileMap = new Map()
    if (filesWithSummaries) {
      filesWithSummaries.forEach(file => {
        fileMap.set(file.id, file)
      })
    }

    // Combine Modal results with local file data, preserving rerank order
    const results: FileResult[] = modalData.results
      .map(modalResult => {
        const fileData = fileMap.get(modalResult.id)
        if (!fileData) {
          console.warn(`No file data found for ${modalResult.id}`)
          return null
        }

        return {
          id: fileData.id,
          file_name: modalResult.file_name,
          file_title: fileData.file_title || modalResult.file_name,
          pdf_url: `${CDN_URL}${fileData.cdn_path}`,
          file_size: fileData.file_size || modalResult.file_size,
          score: modalResult.score,
          summaries: fileData.file_summaries?.map(summary => ({
            model: summary.model,
            content: summary.content
          })) || []
        }
      })
      .filter(result => result !== null) as FileResult[]

    console.log(`Returning ${results.length} reranked results`)

    return new Response(
      JSON.stringify({ 
        results,
        total: results.length,
        query,
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